// Client-side fetch wrapper: auto-logout on 401.

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
    // Session expired or invalid: clear cookies and redirect to login.
    document.cookie = `${TOKEN_NAME}=; path=/; max-age=0`;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?reason=session_expired";
    }
    throw new Error("Session expirée");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Une erreur est survenue");
  }
  return data as T;
}
