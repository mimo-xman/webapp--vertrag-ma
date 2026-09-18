"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api-utils";

/**
 * Silent session validation for authenticated layouts.
 *
 * Re-checks /api/auth/me when the tab regains focus and every 60 s.
 * If the session became invalid in the meantime (account deleted or
 * password changed from another tab/device), apiFetch's 401 handler
 * performs the auto-logout redirect to /login?reason=session_expired.
 */
export function SessionWatcher() {
  useEffect(() => {
    let stopped = false;

    const check = () => {
      if (stopped || document.visibilityState === "hidden") return;
      // apiFetch handles the 401 → logout redirect.
      // Errors are swallowed on purpose: this is a background probe.
      apiFetch("/api/auth/me").catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const onFocus = () => check();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    const interval = setInterval(check, 60_000);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  return null;
}
