import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireAuth } from "@/lib/auth";
import { createTotpSecret, buildTotpUri } from "@/lib/totp";

// Step 1 of 2FA setup: generates a TOTP secret + QR code data URL (not yet enabled).

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if ("error" in auth) return auth.error;

    await connectDB();
    const user = await User.findById(auth.user._id);
    if (!user) {
      return NextResponse.json({ success: false, error: "Session expirée", code: "AUTH_REQUIRED" }, { status: 401 });
    }

    if (user.two_factor_enabled) {
      return NextResponse.json(
        { success: false, error: "Le 2FA est déjà activé" },
        { status: 400 }
      );
    }

    const QRCode = (await import("qrcode")).default;

    const secret = createTotpSecret();
    const uri = buildTotpUri(user.email, "Vertrag.ma", secret);
    const qrDataUrl = await QRCode.toDataURL(uri);

    user.two_factor_secret = secret;
    user.two_factor_enabled = false;
    await user.save();

    return NextResponse.json({ success: true, secret, qrDataUrl });
  } catch (error) {
    console.error("[2FA-SETUP]", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la génération du 2FA" },
      { status: 500 }
    );
  }
}
