import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { comparePassword, createAuthResponse, signToken } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";

const schema = z.object({
  userId: z.string().min(1),
  code: z.string().min(6).max(10),
});

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "2fa-challenge", 5, 15 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop de tentatives. Réessayez dans 15 minutes." },
        { status: 429, headers: rateLimitHeaders(rl, 5) }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Code invalide" }, { status: 400 });
    }

    await connectDB();
    const user = await User.findById(parsed.data.userId);
    if (!user || !user.active || !user.two_factor_enabled) {
      return NextResponse.json({ success: false, error: "Code invalide" }, { status: 401 });
    }

    let verified = false;
    let usedBackupCode = false;

    if (/^\d{6}$/.test(parsed.data.code)) {
      verified = verifyTotp(user.two_factor_secret!, parsed.data.code);
    }

    if (!verified) {
      const codeIndex = user.two_factor_backup_codes.findIndex(
        (c) => c.toLowerCase() === parsed.data.code.toLowerCase()
      );
      if (codeIndex >= 0) {
        verified = true;
        usedBackupCode = true;
        user.two_factor_backup_codes.splice(codeIndex, 1);
        await user.save();
      }
    }

    if (!verified) {
      return NextResponse.json(
        { success: false, error: "Code de vérification incorrect" },
        { status: 401 }
      );
    }

    const remaining = user.two_factor_backup_codes.length;
    const token = signToken(String(user._id));
    return createAuthResponse(
      {
        success: true,
        user: {
          id: String(user._id),
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          two_factor_enabled: true,
        },
        ...(usedBackupCode
          ? { warning: `Code de secours utilisé. ${remaining} code(s) restant(s).` }
          : {}),
      },
      token
    );
  } catch (error) {
    console.error("[2FA-CHALLENGE]", error);
    return NextResponse.json(
      { success: false, error: "Échec de la vérification" },
      { status: 500 }
    );
  }
}
