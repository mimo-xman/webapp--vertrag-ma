import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { comparePassword, createAuthResponse, signToken } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "login", 5, 15 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop de tentatives. Réessayez dans 15 minutes." },
        { status: 429, headers: rateLimitHeaders(rl, 5) }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Email ou mot de passe incorrect" },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Email ou mot de passe incorrect" },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { success: false, error: "Compte non activé. Vérifiez votre boîte email.", notVerified: true },
        { status: 403 }
      );
    }

    const isValid = await comparePassword(parsed.data.password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Email ou mot de passe incorrect" },
        { status: 401 }
      );
    }

    // 2FA enabled → challenge required, no token issued yet.
    if (user.two_factor_enabled) {
      return NextResponse.json({
        success: true,
        requires2FA: true,
        userId: String(user._id),
      });
    }

    const token = signToken(String(user._id));
    return createAuthResponse(
      {
        success: true,
        user: {
          id: String(user._id),
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          two_factor_enabled: false,
        },
      },
      token
    );
  } catch (error) {
    console.error("[LOGIN]", error);
    return NextResponse.json({ success: false, error: "Échec de la connexion" }, { status: 500 });
  }
}
