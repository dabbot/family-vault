import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { Home, Star, Folder, ShieldCheck, Settings, LogOut, Upload, Menu, X, Trash2, Inbox, CalendarDays, Sparkles, RefreshCw, StickyNote, Umbrella } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UpcomingDue } from "@/components/upcoming-due";
import { InstallAppButton } from "@/components/install-app-button";
import { GlobalSearch } from "@/components/global-search";
import { useMobileGestures } from "@/hooks/use-mobile-gestures";

const nav = [
  { to: "/", label: "Home", icon: Home },
  { to: "/chat", label: "Ask AI", icon: Sparkles },
  { to: "/notes", label: "Notes", icon: StickyNote },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/insurance", label: "Insurance", icon: Umbrella },
  { to: "/favorites", label: "Favorites", icon: Star },
  { to: "/folders", label: "Folders", icon: Folder },
  { to: "/trash", label: "Trash", icon: Trash2 },
];

export function AppShell({ children, onUpload }: { children: ReactNode; onUpload?: () => void }) {
  const { profile, isAdmin, isFamilyMember } = useAuth();
  const router = useRouter();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pullDistance, refreshing } = useMobileGestures({
    onOpenDrawer: () => setMobileOpen(true),
    enabled: !mobileOpen,
  });

  // Warm the route cache for every top-level destination once the shell
  // has painted. Runs during requestIdleCallback so it never competes with
  // the initial render. Each route's chunk + loader lands in cache, so
  // clicking the nav (or a deep link inside admin views) is instant.
  useEffect(() => {
    const w = window as unknown as { __appRoutesPrewarmed?: boolean; requestIdleCallback?: (cb: () => void) => number };
    if (w.__appRoutesPrewarmed) return;
    w.__appRoutesPrewarmed = true;
    const idle = w.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 400));
    idle(() => {
      const targets = ["/", "/chat", "/notes", "/inbox", "/calendar", "/insurance", "/favorites", "/folders", "/trash", "/admin"] as const;
      for (const to of targets) {
        // Fire-and-forget; router dedupes and caches internally.
        void router.preloadRoute({ to }).catch(() => { /* noop */ });
      }
    });
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  const initials = (profile?.full_name ?? "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const NavItems = ({ onClick }: { onClick?: () => void }) => (
    <>
      {nav.map((n) => {
        const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
      {isFamilyMember && (
        <Link
          to="/admin"
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            loc.pathname.startsWith("/admin")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          Family View
        </Link>
      )}
      {isAdmin && (
        <Link
          to="/setup"
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            loc.pathname.startsWith("/setup")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          Setup
        </Link>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Pull-to-refresh indicator (mobile) */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-end justify-center md:hidden"
          style={{ height: pullDistance, transition: refreshing ? "height 150ms ease-out" : undefined }}
        >
          <div className="mb-1 grid h-9 w-9 place-items-center rounded-full bg-background/90 shadow-lift">
            <RefreshCw
              className={cn("h-4 w-4 text-muted-foreground", refreshing && "animate-spin text-primary")}
              style={{ transform: refreshing ? undefined : `rotate(${pullDistance * 3}deg)` }}
            />
          </div>
        </div>
      )}
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Folder className="h-4 w-4" />
          </div>
          <div className="font-semibold tracking-tight">Family Vault</div>
        </div>
        <nav className="space-y-1 p-3">
          <NavItems />
          <InstallAppButton />
        </nav>
        <div className="flex-1 overflow-y-auto border-t border-sidebar-border/60 pt-3">
          <UpcomingDue />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profile?.full_name ?? "You"}</div>
              <div className="truncate text-xs text-muted-foreground">{isAdmin ? "Admin" : "Member"}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:pl-[15.5rem] md:pr-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="md:hidden font-semibold">Family Vault</div>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearch />
          {onUpload && (
            <Button onClick={onUpload} className="gap-2 shadow-sm">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </Button>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar p-4 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-semibold">Family Vault</div>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="space-y-1">
              <NavItems onClick={() => setMobileOpen(false)} />
              <InstallAppButton />
            </nav>
            <div className="mt-6 border-t border-sidebar-border pt-4">
              <Button variant="ghost" className="w-full justify-start gap-2" onClick={signOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </aside>
        </div>
      )}

      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8 md:py-8">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-border bg-background/95 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        {(() => {
          const items: { to: string; label: string; icon: typeof Home }[] = [
            { to: "/", label: "Home", icon: Home },
            { to: "/notes", label: "Notes", icon: StickyNote },
            { to: "/insurance", label: "Insurance", icon: Umbrella },
            ...(isFamilyMember ? [{ to: "/admin", label: "Family", icon: ShieldCheck }] : [{ to: "/folders", label: "Family", icon: Folder }]),
          ];
          return items.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex min-h-12 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-xs",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </Link>
            );
          });
        })()}
      </nav>
    </div>
  );
}
