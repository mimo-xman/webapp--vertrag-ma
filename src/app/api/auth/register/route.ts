import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { hashPassword } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/email";

const schema = z.object({
  full_name: z.string().trim().min(3).max(80),
  date_of_birth: z.string().optional().nullable(),
  email: z.string().email(),
  password: z.string().min(6).max(128),
  confirm_password: z.string().min(6).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "register", 3, 60 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop d'inscriptions. Réessayez dans une heure." },
        { status: 429, headers: rateLimitHeaders(rl, 3) }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Données invalides";
      return NextResponse.json({ success: false, error: firstError }, { status: 400 });
    }

    const { full_name, email, password, confirm_password, date_of_birth } = parsed.data;
    if (password !== confirm_password) {
      return NextResponse.json(
        { success: false, error: "Les mots de passe ne correspondent pas" },
        { status: 400 }
      );
    }

    await connectDB();
    const existing = await User.findOne({ email: email.toLowerCase() });

    if (existing) {
      // Unverified account: resend a fresh token.
      if (!existing.active) {
        const token = crypto.randomBytes(32).toString("hex");
        existing.email_verification_token = token;
        existing.email_verification_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await existing.save();
        try {
          await sendVerificationEmail(existing.email, token);
        } catch (e) {
          console.error("[REGISTER] resend email failed", e);
        }
        return NextResponse.json(
          {
            success: false,
            error: "Un compte existe déjà avec cet email mais n'est pas activé. Un nouveau lien d'activation vient d'être envoyé.",
            resent: true,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Un compte existe déjà avec cet email" },
        { status: 400 }
      );
    }

    const emailToken = crypto.randomBytes(32).toString("hex");
    const hashed = await hashPassword(password);

    const user = await User.create({
      full_name,
      email: email.toLowerCase(),
      password: hashed,
      date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
      active: false,
      email_verification_token: emailToken,
      email_verification_expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    try {
      await sendVerificationEmail(user.email, emailToken);
    } catch (emailError) {
      console.error("[REGISTER] email send failed, rolling back", emailError);
      await User.findByIdAndDelete(user._id).catch(() => {});
      return NextResponse.json(
        {
          success: false,
          error: "Impossible d'envoyer l'email d'activation. Réessayez plus tard.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Compte créé ! Vérifiez votre email pour l'activer.",
    });
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ success: false, error: "Échec de l'inscription" }, { status: 500 });
  }
}
