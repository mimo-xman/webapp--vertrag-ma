import { NextRequest, NextResponse } from "next/server";
import { createLogoutResponse } from "@/lib/auth";

export async function POST() {
  return createLogoutResponse();
}

export async function GET() {
  return createLogoutResponse();
}
