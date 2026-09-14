
/** EthioHire — small shared UI building blocks */
import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/ethiohire/logo";
import type { ReactNode } from "react";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", STATUS_COLORS[status] || "bg-stone-100 text-stone-700 border-stone-200", className)}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon ? <span className="text-primary/60">{icon}</span> : null}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {body ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">{children}</h2>
      {sub ? <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function EhLogo({ size = 34, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      {withText ? (
        <span className="text-lg font-extrabold tracking-tight">
          Ethio<span className="text-primary">Hire</span>
        </span>
      ) : null}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#d97706" : "#dc2626";
  const circ = 2 * Math.PI * (size / 2 - 5);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 5} fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 5}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={`${(score / 100) * circ} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" fontSize={size / 4} fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  );
}
