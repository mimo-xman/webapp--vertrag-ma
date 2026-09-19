import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getAuthUser } from "@/lib/auth";
import { ContactView } from "./contact-view";

// Public contact page — the support form. Also linked from the suspended
// account page so suspended users can reach the team.
export default async function ContactPage() {
  // Best-effort prefill (suspended users keep a valid session).
  const user = await getAuthUser().catch(() => null);

  return (
    <div className="min-h-dvh flex flex-col bg-paper">
      {/* Briefkopf — letterhead */}
      <header className="border-b border-border bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg fade-up">
          <ContactView
            defaultName={user?.full_name || ""}
            defaultEmail={user?.email || ""}
          />
        </div>
      </main>

      <footer className="border-t border-border bg-paper/80">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground">
          <span className="font-mono">© {new Date().getFullYear()} Vertrag.ma</span>
        </div>
      </footer>
    </div>
  );
}
