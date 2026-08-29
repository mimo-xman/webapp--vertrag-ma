import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { createLogoutResponse } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(
        new URL("/2fa-disable?status=invalid", request.url)
      );
    }

    await connectDB();
    const candidates = await User.find({
      disable_2fa_token: { $ne: null },
      disable_2fa_expires: { $gt: new Date() },
    });

    let target: typeof candidates[number] | null = null;
    for (const candidate of candidates) {
      const match = await bcrypt.compare(token, candidate.disable_2fa_token!);
      if (match) {
        target = candidate;
        break;
      }
    }

    if (!target) {
      return NextResponse.redirect(
        new URL("/2fa-disable?status=invalid", request.url)
      );
    }

    target.two_factor_enabled = false;
    target.two_factor_secret = null;
    target.two_factor_backup_codes = [];
    target.disable_2fa_token = null;
    target.disable_2fa_expires = null;
    await target.save();

    return NextResponse.redirect(
      new URL("/2fa-disable?status=success", request.url)
    );
  } catch (error) {
    console.error("[2FA-DISABLE-BY-EMAIL]", error);
    return NextResponse.redirect(
      new URL("/2fa-disable?status=error", request.url)
    );
  }
}
