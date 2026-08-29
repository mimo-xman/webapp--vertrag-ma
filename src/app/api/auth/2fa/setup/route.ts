import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireAuth } from "@/lib/auth";

// Step 1 of 2FA setup: generates a TOTP secret + QR code data URL (not yet enabled).

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  await connectDB();
  const user = await User.findById(auth.user._id);
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (user.two_factor_enabled) {
    return NextResponse.json(
      { success: false, error: "Le 2FA est déjà activé" },
      { status: 400 }
    );
  }

  const { authenticator } = await import("otplib");
  const QRCode = (await import("qrcode")).default;

  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(user.email, "Vertrag.ma", secret);
  const qrDataUrl = await QRCode.toDataURL(uri);

  user.two_factor_secret = secret;
  user.two_factor_enabled = false;
  await user.save();

  return NextResponse.json({ success: true, secret, qrDataUrl });
}
