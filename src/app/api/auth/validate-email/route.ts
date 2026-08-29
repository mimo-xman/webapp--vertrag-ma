import { NextRequest, NextResponse } from "next/server";
import { EmailVerifier } from "@el-zazo/email-verifier";

// Deep email validation using @el-zazo/email-verifier.
// On service error, gives the benefit of the doubt (valid).

export async function POST(request: NextRequest) {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ valid: false, message: "Email requis" });
    }

    const verifier = new EmailVerifier();
    await verifier.init();
    const result = await verifier.verify(email.trim().toLowerCase());
    return NextResponse.json({
      valid: result.valid,
      message: result.valid ? null : result.reason,
    });
  } catch (error) {
    console.error("[VALIDATE-EMAIL]", error);
    return NextResponse.json({ valid: true, message: null });
  }
}
