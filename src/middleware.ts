import { NextRequest, NextResponse } from "next/server";

const TOKEN_NAME = "vertrag_token";

// Pages that redirect logged-in users away (auth-only pages)
const authOnlyRoutes = ["/login", "/register", "/forgot-password", "/reset-password"];

// Public access regardless of auth state
const publicAccessRoutes = ["/verify-email", "/delete-account-confirm", "/2fa-disable", "/contact"];

// Requires at least a session cookie (real verification happens server-side)
const protectedRoutes = [
  "/dashboard",
  "/postulations",
  "/demandes",
  "/dossier",
  "/profile",
  "/admin",
  "/suspended",
];

export function middleware(request: NextRequest) {
  const token = request.cookies.get(TOKEN_NAME)?.value;
  const { pathname, searchParams } = request.nextUrl;
  const hasReason = searchParams.has("reason");

  // Logged-in users are pushed away from auth-only pages - EXCEPT when the
  // visit carries a reason flag (session_expired / auth_required). In that
  // case the cookie is stale or the session was invalidated (password
  // changed, account deleted): clear it and show the login page instead of
  // bouncing back, which would cause a redirect loop.
  if (token && authOnlyRoutes.some((route) => pathname.startsWith(route))) {
    if (hasReason) {
      const response = NextResponse.next();
      response.cookies.set(TOKEN_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
      return response;
    }
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
    "/suspended",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/delete-account-confirm",
    "/2fa-disable",
  ],
};
