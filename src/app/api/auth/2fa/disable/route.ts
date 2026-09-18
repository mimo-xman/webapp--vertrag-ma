import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { comparePassword, requireAuth } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";

const schema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(10),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Mot de passe et code requis" },
      { status: 400 }
    );
  }

  await connectDB();
  const user = await User.findById(auth.user._id);
  if (!user || !user.two_factor_enabled) {
    return NextResponse.json({ success: false, error: "2FA non activé" }, { status: 400 });
  }

  const valid = await comparePassword(parsed.data.password, user.password);
  if (!valid) {
    return NextResponse.json({ success: false, error: "Mot de passe incorrect" }, { status: 400 });
  }

  const codeOk = verifyTotp(user.two_factor_secret!, parsed.data.code);

  if (!codeOk) {
    return NextResponse.json({ success: false, error: "Code incorrect" }, { status: 400 });
  }

  user.two_factor_enabled = false;
  user.two_factor_secret = null;
  user.two_factor_backup_codes = [];
  user.disable_2fa_token = null;
  user.disable_2fa_expires = null;
  await user.save();

  return NextResponse.json({ success: true, message: "2FA désactivé" });
}
