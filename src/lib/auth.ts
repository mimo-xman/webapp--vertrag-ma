import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "./mongodb";
import { User } from "@/models/User";

const JWT_SECRET = process.env.JWT_SECRET || "vertrag-ma-dev-secret-change-in-production";
const TOKEN_NAME = "vertrag_token";
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days
const SALT_ROUNDS = 12;

export interface JWTPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  _id: string;
  email: string;
  full_name: string;
  role: "user" | "admin";
  active: boolean;
  suspended: boolean;
  suspended_reason: string | null;
  passwordChangedAt: Date | null;
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.ALLOW_HTTP_COOKIES !== "true" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });
}

export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function getTokenFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get(TOKEN_NAME)?.value;
}

function isTokenOutdated(
  decoded: JWTPayload,
  passwordChangedAt: Date | null | undefined
): boolean {
  if (!passwordChangedAt) return false;
  const changedSeconds = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
  return decoded.iat !== undefined && decoded.iat + 1 < changedSeconds;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(TOKEN_NAME)?.value;
    if (!token) return null;
    const decoded = verifyToken(token);
    if (!decoded?.userId) return null;
    await connectDB();
    const user = await User.findById(decoded.userId)
      .select("_id email full_name role active suspended suspended_reason passwordChangedAt")
      .lean();
    if (!user || !user.active) return null;
    if (isTokenOutdated(decoded, user.passwordChangedAt)) return null;
    return {
      _id: String(user._id),
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      active: user.active,
      suspended: Boolean(user.suspended),
      suspended_reason: user.suspended_reason ?? null,
      passwordChangedAt: user.passwordChangedAt,
    };
  } catch {
    return null;
  }
}

export async function getAuthUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
  try {
    const token = getTokenFromRequest(request);
    if (!token) return null;
    const decoded = verifyToken(token);
    if (!decoded?.userId) return null;
    await connectDB();
    const user = await User.findById(decoded.userId)
      .select("_id email full_name role active suspended suspended_reason passwordChangedAt")
      .lean();
    if (!user || !user.active) return null;
    if (isTokenOutdated(decoded, user.passwordChangedAt)) return null;
    return {
      _id: String(user._id),
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      active: user.active,
      suspended: Boolean(user.suspended),
      suspended_reason: user.suspended_reason ?? null,
      passwordChangedAt: user.passwordChangedAt,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(
  request: NextRequest
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      ),
    };
  }
  // Suspended accounts keep their session (so they can log out and see the
  // suspended page) but are blocked from every auth-required API.
  if (user.suspended) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: "Votre compte est suspendu. Contactez le support pour plus d'informations.",
          code: "ACCOUNT_SUSPENDED",
        },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export async function requireAdmin(
  request: NextRequest
): Promise<{ user: AuthUser } | { error: NextResponse }> {
  const result = await requireAuth(request);
  if ("error" in result) return result;
  if (result.user.role !== "admin") {
    return {
      error: NextResponse.json(
        { success: false, error: "Forbidden - Admin access required", code: "ADMIN_REQUIRED" },
        { status: 403 }
      ),
    };
  }
  return result;
}

export function createAuthResponse(data: unknown, token: string, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.cookies.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.ALLOW_HTTP_COOKIES !== "true" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });
  return response;
}

export function createLogoutResponse(): NextResponse {
  const response = NextResponse.json({ success: true });
  const names = [TOKEN_NAME, "token", "auth-token", "jwt", "session"];
  for (const name of names) {
    response.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
  return response;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}
