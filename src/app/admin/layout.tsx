import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AppPopupProvider } from "@/components/app-popup";
import { Toaster } from "@/components/ui/toaster";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  if (!user) redirect("/login?reason=auth_required");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-[#1a1d21]">
      <div className="flex">
        <AdminSidebar userEmail={user.email} />
        <div className="min-w-0 flex-1">
          <AppPopupProvider>
            <main className="min-h-dvh bg-[#f4f2ec] lg:rounded-tl-lg">{children}</main>
          </AppPopupProvider>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
