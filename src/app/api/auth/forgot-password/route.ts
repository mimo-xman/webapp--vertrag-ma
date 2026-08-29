import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, "forgot-password", 3, 60 * 60 * 1000);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: "Trop de demandes. Réessayez dans une heure." },
        { status: 429, headers: rateLimitHeaders(rl, 3) }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    // Anti-enumeration: always return the same response.
    if (!parsed.success) {
      return NextResponse.json({ success: true, message: "Email envoyé si le compte existe" });
    }

    await connectDB();
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() });

    if (user && user.active) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      user.resetToken = resetToken;
      user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      try {
        await sendPasswordResetEmail(user.email, resetToken);
      } catch (e) {
        console.error("[FORGOT-PASSWORD] email failed", e);
      }
    }

    return NextResponse.json({ success: true, message: "Email envoyé si le compte existe" });
  } catch (error) {
    console.error("[FORGOT-PASSWORD]", error);
    return NextResponse.json({ success: false, error: "Erreur" }, { status: 500 });
  }
}
