import { AppPopupProvider } from "@/components/app-popup";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppPopupProvider>
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
          <div className="w-full max-w-md fade-up">{children}</div>
        </main>

        <footer className="border-t border-border bg-paper/80">
          <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground">
            <span className="font-mono">© {new Date().getFullYear()} Vertrag.ma</span>
            <Link href="/" className="font-mono hover:text-foreground transition-colors">
              ←vertrag.ma
            </Link>
          </div>
        </footer>
      </div>
    </AppPopupProvider>
  );
}
