import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireAuth } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";

const schema = z.object({ code: z.string().length(6) });

// Step 2 of 2FA setup: verifies the code and enables 2FA, returning 8 backup codes.

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Code à 6 chiffres requis" }, { status: 400 });
  }

  await connectDB();
  const user = await User.findById(auth.user._id);
  if (!user || !user.two_factor_secret) {
    return NextResponse.json(
      { success: false, error: "Configuration 2FA introuvable. Recommencez." },
      { status: 400 }
    );
  }

  const verified = verifyTotp(user.two_factor_secret, parsed.data.code);

  if (!verified) {
    return NextResponse.json({ success: false, error: "Code incorrect" }, { status: 400 });
  }

  const backupCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );

  user.two_factor_enabled = true;
  user.two_factor_backup_codes = backupCodes;
  await user.save();

  return NextResponse.json({ success: true, backupCodes });
}
