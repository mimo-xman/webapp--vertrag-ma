// Client-side fetch wrapper.
// - Auto-logout only for genuine session expiry: a 401 whose body carries
//   code "AUTH_REQUIRED" (returned by requireAuth for invalid/expired
//   sessions). Plain 401s from public endpoints (login, 2FA challenge…)
//   surface their real error message instead of "Session expirée".
// - Auto-redirect to /suspended when the account has been suspended by an
//   admin (403 with code "ACCOUNT_SUSPENDED").

const TOKEN_NAME = "vertrag_token";

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    const body = await response.json().catch(() => ({}));
    const data = body as { error?: string; code?: string };

    // Real session expiry (invalid token, deleted account, changed password).
    if (data?.code === "AUTH_REQUIRED") {
      // Clear the session cookie server-side, then redirect to login.
      // Never redirect if we are already on the login page.
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      document.cookie = `${TOKEN_NAME}=; path=/; max-age=0`;
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login?reason=session_expired";
      }
      throw new Error(data.error || "Session expirée");
    }

    // Business 401 (wrong credentials, bad 2FA code, …): show the real error.
    throw new Error(data?.error || "Une erreur est survenue");
  }

  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    const data = body as { error?: string; code?: string };
    // Account suspended by an admin → send the user to the suspended page.
    if (data?.code === "ACCOUNT_SUSPENDED") {
      if (!window.location.pathname.startsWith("/suspended")) {
        window.location.href = "/suspended";
      }
      throw new Error(data.error || "Compte suspendu");
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Une erreur est survenue");
  }
  return data as T;
}
