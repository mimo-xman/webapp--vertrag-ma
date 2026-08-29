import { NextRequest, NextResponse } from "next/server";

const TOKEN_NAME = "vertrag_token";

// Pages that redirect logged-in users away (auth-only pages)
const authOnlyRoutes = ["/login", "/register", "/forgot-password", "/reset-password"];

// Public access regardless of auth state
const publicAccessRoutes = ["/verify-email", "/delete-account-confirm", "/2fa-disable"];

// Requires at least a session cookie (real verification happens server-side)
const protectedRoutes = [
  "/dashboard",
  "/postulations",
  "/demandes",
  "/dossier",
  "/profile",
  "/admin",
];

export function middleware(request: NextRequest) {
  const token = request.cookies.get(TOKEN_NAME)?.value;
  const { pathname } = request.nextUrl;

  // Logged-in users are pushed away from auth-only pages
  if (token && authOnlyRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Not logged in → pushed to login when accessing protected pages
  if (!token && protectedRoutes.some((route) => pathname.startsWith(route))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "auth_required");
    return NextResponse.redirect(loginUrl);
  }

  if (publicAccessRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/postulations/:path*",
    "/demandes/:path*",
    "/dossier/:path*",
    "/profile/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/delete-account-confirm",
    "/2fa-disable",
  ],
};
