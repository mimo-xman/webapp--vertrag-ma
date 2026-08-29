import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireAuth } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { send2faDisableEmail } from "@/lib/email";

const schema = z.object({ password: z.string().min(1) });

// Fallback: if the user lost their authenticator, emails a disable link.

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "2fa-disable-email", 3, 60 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop de demandes. Réessayez dans une heure." },
        { status: 429, headers: rateLimitHeaders(rl, 3) }
      );
    }

    const auth = await requireAuth(request);
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Mot de passe requis" }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(auth.user._id).select("+password");
    if (!user || !user.two_factor_enabled) {
      return NextResponse.json({ success: false, error: "2FA non activé" }, { status: 400 });
    }

    const { comparePassword } = await import("@/lib/auth");
    const valid = await comparePassword(parsed.data.password, user.password);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Mot de passe incorrect" }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.disable_2fa_token = await bcrypt.hash(token, 10);
    user.disable_2fa_expires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    try {
      await send2faDisableEmail(user.email, token);
    } catch (e) {
      console.error("[2FA-DISABLE-EMAIL]", e);
      return NextResponse.json(
        { success: false, error: "Impossible d'envoyer l'email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Email envoyé" });
  } catch (error) {
    console.error("[2FA-DISABLE-EMAIL]", error);
    return NextResponse.json({ success: false, error: "Erreur" }, { status: 500 });
  }
}
