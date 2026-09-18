import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { comparePassword, createAuthResponse, hashPassword, requireAuth, signToken } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const schema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "change-password", 5, 15 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop de tentatives. Réessayez plus tard." },
        { status: 429, headers: rateLimitHeaders(rl, 5) }
      );
    }

    const auth = await requireAuth(request);
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Le nouveau mot de passe doit contenir au moins 6 caractères" },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findById(auth.user._id);
    if (!user) {
      return NextResponse.json({ success: false, error: "Session expirée", code: "AUTH_REQUIRED" }, { status: 401 });
    }

    const valid = await comparePassword(parsed.data.current_password, user.password);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Mot de passe actuel incorrect" },
        { status: 400 }
      );
    }

    user.password = await hashPassword(parsed.data.new_password);
    user.passwordChangedAt = new Date();
    await user.save();

    // Re-issue a fresh session token: the user stays logged in on THIS
    // device, while every other session (other tabs/devices) is invalidated
    // by the passwordChangedAt check and cleanly redirected to /login.
    const token = signToken(String(user._id));
    return createAuthResponse({
      success: true,
      message: "Mot de passe modifié",
      user: {
        id: String(user._id),
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    }, token);
  } catch (error) {
    console.error("[CHANGE-PASSWORD]", error);
    return NextResponse.json({ success: false, error: "Erreur" }, { status: 500 });
  }
}
