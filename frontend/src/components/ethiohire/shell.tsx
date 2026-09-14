
/** EthioHire — role-aware portal shell (sidebar + topbar + notifications) */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { apiJson, useAuth } from "@/lib/auth-client";
import { EhLogo, Spinner } from "@/components/ethiohire/bits";
import { navigate } from "@/components/ethiohire/hash-router";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/constants";
import {
  Bell,
  Briefcase,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  ScrollText,
  UserRound,
  Video,
  ClipboardList,
  Users,
  Building2,
  CreditCard,
  BookOpen,
} from "lucide-react";
import type { ReactNode } from "react";

export interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  route: string;
  exact?: boolean;
}

const NAVS: Record<string, NavItem[]> = {
  candidate: [
    { label: "Dashboard", icon: LayoutDashboard, route: "/candidate", exact: true },
    { label: "Find Jobs", icon: FileSearch, route: "/candidate/jobs" },
    { label: "My Applications", icon: ClipboardList, route: "/candidate/applications" },
    { label: "Interviews", icon: Video, route: "/candidate/interviews" },
    { label: "Profile & CV", icon: UserRound, route: "/candidate/profile" },
  ],
  recruiter: [
    { label: "Dashboard", icon: LayoutDashboard, route: "/recruiter", exact: true },
    { label: "Job Posts", icon: Briefcase, route: "/recruiter/jobs" },
    { label: "Applicants", icon: Users, route: "/recruiter/applicants" },
    { label: "Interviews", icon: Video, route: "/recruiter/interviews" },
    { label: "Exams", icon: ClipboardList, route: "/recruiter/exams" },
    { label: "Interview setup", icon: MessagesSquare, route: "/recruiter/interview-setup" },
    { label: "Company Profile", icon: Building2, route: "/recruiter/company" },
  ],
  admin: [
    { label: "Overview", icon: LayoutDashboard, route: "/admin", exact: true },
    { label: "Companies", icon: Building2, route: "/admin/companies" },
    { label: "Subscriptions", icon: CreditCard, route: "/admin/subscriptions" },
    { label: "Audit Logs", icon: ScrollText, route: "/admin/audit" },
    { label: "Notifications", icon: Bell, route: "/admin/notifications" },
    { label: "Setup Guides", icon: BookOpen, route: "/docs" },
  ],
};

const ROLE_TITLES: Record<string, string> = {
  candidate: "Candidate Portal",
  recruiter: "Recruiter / HR Portal",
  admin: "System Admin Portal",
};

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  channel: string;
  read: boolean;
  createdAt: string;
}

export function PortalShell({ route, children }: { route: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const role = user?.role.toLowerCase() || "candidate";
  const nav = NAVS[role] || NAVS.candidate;
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiJson<{ notifications: NotificationItem[]; unread: number }>("/api/notifications");
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await apiJson<{ notifications: NotificationItem[]; unread: number }>("/api/notifications");
        if (!cancelled) {
          setNotifications(data.notifications);
          setUnread(data.unread);
        }
      } catch {
        /* silent */
      }
    };
    tick();
    const t = setInterval(tick, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const markAllRead = async () => {
    try {
      await apiJson("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
      loadNotifications();
    } catch {
      /* session issue — central 401 handler manages the fallback */
    }
  };

  const handleLogout = async () => {
    await logout();
    toast({ title: "Signed out. See you soon!" });
    navigate("/");
  };

  const isActive = (item: NavItem) => (item.exact ? route === item.route : route.startsWith(item.route));

  return (
    <div className="flex min-h-screen flex-col bg-muted/25">
      {/* Topbar */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-5">
          <div className="flex items-center gap-2">
            {/* Mobile nav */}
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetTitle>{ROLE_TITLES[role]}</SheetTitle>
                <div className="mt-3">
                  <PortalNav nav={nav} route={route} onNavigate={() => setNavOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <button onClick={() => navigate("/")} aria-label="EthioHire home">
              <EhLogo size={30} />
            </button>
            <Badge variant="secondary" className="hidden sm:inline-flex">{ROLE_TITLES[role]}</Badge>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unread} unread)`}>
                  <Bell className="h-5 w-5" />
                  {unread > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent className="eh-scroll w-full overflow-y-auto sm:max-w-sm">
                <SheetTitle className="flex items-center justify-between">
                  Notifications
                  <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>
                </SheetTitle>
                <div className="mt-2 space-y-2 pb-6">
                  {notifications.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={cn("rounded-lg border p-3", !n.read && "border-primary/40 bg-primary/5")}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug">{n.title}</p>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{n.channel === "EMAIL" ? "Email" : n.channel === "SMS" ? "SMS" : "In-app"}</Badge>
                        </div>
                        {n.body ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{n.body}</p> : null}
                        <p className="mt-1.5 text-[10px] text-muted-foreground/70">{formatDateTime(n.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <div className="hidden items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {(user?.name || "U").slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[140px] truncate text-sm font-medium">{user?.name}</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-3 py-6 sm:px-5">
        {/* Desktop sidebar */}
        <aside className="sticky top-20 hidden h-fit w-60 shrink-0 rounded-xl border bg-card p-3 lg:block">
          <PortalNav nav={nav} route={route} />
        </aside>

        <main className="min-w-0 flex-1 pb-10">{children}</main>
      </div>
    </div>
  );
}

/** Module-level nav component (stable identity — not re-created during render) */
function PortalNav({ nav, route, onNavigate }: { nav: NavItem[]; route: string; onNavigate?: () => void }) {
  const isActive = (item: NavItem) => (item.exact ? route === item.route : route.startsWith(item.route));
  return (
    <nav aria-label="Portal" className="space-y-1">
      {nav.map((item) => (
        <button
          key={item.route}
          onClick={() => {
            navigate(item.route);
            onNavigate?.();
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isActive(item) ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          aria-current={isActive(item) ? "page" : undefined}
        >
          <item.icon className="h-[18px] w-[18px]" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
