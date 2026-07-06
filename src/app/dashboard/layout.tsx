import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <AuthGuard>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />

          {/* Added min-w-0 to prevent the flex item from expanding beyond its boundary container */}
          <div className="flex min-h-screen flex-1 min-w-0 flex-col overflow-hidden">
            {/* ── Top header bar ─────────────────────────────── */}
            <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
              <div className="flex h-14 items-center gap-3 px-4">
                {/* Left: sidebar trigger + page title */}
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="h-4" />
                <div>
                  <p className="text-sm font-semibold">Dashboard</p>
                </div>

                {/* Right: theme toggle + user menu */}
                <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                  <ThemeToggle />
                  <UserMenu />
                </div>
              </div>
            </header>

            {/* Changed overflow-auto to overflow-y-auto so page-level horizontal overflow is forbidden */}
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </AuthGuard>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}
