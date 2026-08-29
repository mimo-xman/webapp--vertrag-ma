import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { comparePassword, requireAuth } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendDeleteAccountEmail } from "@/lib/email";

const schema = z.object({
  password: z.string().min(1),
  two_factor_code: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "request-delete", 3, 60 * 60 * 1000);
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
    const user = await User.findById(auth.user._id);
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const valid = await comparePassword(parsed.data.password, user.password);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Mot de passe incorrect" },
        { status: 400 }
      );
    }

    // If 2FA enabled, require a valid code too.
    if (user.two_factor_enabled) {
      if (!parsed.data.two_factor_code) {
        return NextResponse.json(
          { success: false, error: "Code 2FA requis", requires2FA: true },
          { status: 400 }
        );
      }
      const { authenticator } = await import("otplib");
      let codeOk = false;
      try {
        codeOk = authenticator.verify({
          token: parsed.data.two_factor_code,
          secret: user.two_factor_secret!,
        });
      } catch {
        codeOk = false;
      }
      if (!codeOk) {
        const codeIndex = user.two_factor_backup_codes.findIndex(
          (c) => c.toLowerCase() === parsed.data.two_factor_code!.toLowerCase()
        );
        if (codeIndex >= 0) {
          codeOk = true;
          user.two_factor_backup_codes.splice(codeIndex, 1);
          await user.save();
        }
      }
      if (!codeOk) {
        return NextResponse.json({ success: false, error: "Code 2FA incorrect" }, { status: 400 });
      }
    }

    const deleteToken = crypto.randomBytes(32).toString("hex");
    user.delete_account_token = await bcrypt.hash(deleteToken, 10);
    user.delete_account_expires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    try {
      await sendDeleteAccountEmail(user.email, deleteToken);
    } catch (e) {
      console.error("[REQUEST-DELETE] email failed", e);
      return NextResponse.json(
        { success: false, error: "Impossible d'envoyer l'email. Réessayez plus tard." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Email de confirmation envoyé" });
  } catch (error) {
    console.error("[REQUEST-DELETE]", error);
    return NextResponse.json({ success: false, error: "Erreur" }, { status: 500 });
  }
}
