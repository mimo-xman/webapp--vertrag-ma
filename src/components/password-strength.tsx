"use client";

import { useI18n } from "@/components/language-provider";
import { cn } from "@/lib/utils";

// Password strength: 4 bars. Very Strong = 12+ chars, upper+lower+digit+special.
export function computePasswordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const variety = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
  if (variety >= 3) score += 1;
  if (variety === 4 && pw.length >= 12) score += 1;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

const STRENGTH_COLORS = ["#d8d5cc", "#b3391f", "#d9a441", "#7ba3d9", "#2f6b4a"];

/** 4-bar strength meter + label, identical to the register page. */
export function PasswordStrengthMeter({ password, className }: { password: string; className?: string }) {
  const { t } = useI18n();
  const strength = computePasswordStrength(password);
  const strengthLabel = [
    "",
    t("auth.passwordStrength.weak"),
    t("auth.passwordStrength.medium"),
    t("auth.passwordStrength.strong"),
    t("auth.passwordStrength.veryStrong"),
  ][strength];

  if (!password) return null;

  return (
    <div className={cn("flex items-center gap-2 pt-1", className)}>
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: strength >= i ? STRENGTH_COLORS[strength] : "#d8d5cc" }}
          />
        ))}
      </div>
      <span className="text-xs font-mono text-muted-foreground">{strengthLabel}</span>
    </div>
  );
}

/** Red inline message when confirmation doesn't match. */
export function PasswordMatchHint({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) {
  const { t } = useI18n();
  if (!confirmPassword) return null;
  if (password === confirmPassword) return null;
  return (
    <p className="text-xs text-[#b3391f]">
      {t("auth.passwordsDoNotMatch")}
    </p>
  );
}
