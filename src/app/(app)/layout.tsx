import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AppNavbar } from "@/components/app-navbar";
import { AppPopupProvider } from "@/components/app-popup";
import { Toaster } from "@/components/ui/toaster";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login?reason=auth_required");

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <AppNavbar isAdmin={user.role === "admin"} />
      <AppPopupProvider>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-8">{children}</div>
        </main>
      </AppPopupProvider>
      <footer className="border-t border-border">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 text-xs text-muted-foreground">
          <span className="font-mono">© {new Date().getFullYear()} Vertrag.ma</span>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}
