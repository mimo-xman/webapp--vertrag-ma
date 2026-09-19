import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SuspendedView } from "./suspended-view";

// Dedicated page shown to suspended accounts. The session stays valid (so
// the user can log out) but every app page redirects here, and every
// auth-required API returns 403 ACCOUNT_SUSPENDED.
export default async function SuspendedPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login?reason=auth_required");
  if (!user.suspended) redirect("/dashboard");

  return (
    <div className="min-h-dvh flex flex-col bg-[#f0eee6]">
      {/* Briefkopf — letterhead */}
      <header className="border-b border-[#d8d5cc] bg-[#fafaf6]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md fade-up">
          <SuspendedView email={user.email} reason={user.suspended_reason} />
        </div>
      </main>

      <footer className="border-t border-[#d8d5cc] bg-[#fafaf6]/80">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 text-xs text-[#75797f]">
          <span className="font-mono">© {new Date().getFullYear()} Vertrag.ma</span>
        </div>
      </footer>
    </div>
  );
}
