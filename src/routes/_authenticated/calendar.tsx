import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { GoogleCalendarConnect } from "@/components/google-calendar-connect";
import { cn, daysUntil } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Family Vault" }] }),
  component: CalendarPage,
});

type Doc = {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  expiry_date: string;
  doc_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type CalEvent =
  | { kind: "doc"; id: string; date: string; title: string; doc: Doc }
  | { kind: "policy_premium" | "policy_maturity"; id: string; date: string; title: string };

function CalendarPage() {
  const { user, isFamilyMember } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [policyEvents, setPolicyEvents] = useState<CalEvent[]>([]);
  const [preview, setPreview] = useState<Doc | null>(null);

  useEffect(() => {
    if (!user) return;
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    let q = supabase
      .from("documents")
      .select("id,title,storage_path,mime_type,expiry_date,doc_type,size_bytes,created_at")
      .is("deleted_at", null)
      .not("expiry_date", "is", null)
      .gte("expiry_date", startStr)
      .lte("expiry_date", endStr)
      .order("expiry_date");
    if (!isFamilyMember) q = q.eq("owner_id", user.id);
    q.then(({ data }) => setDocs((data ?? []) as Doc[]));

    supabase
      .from("insurance_policies")
      .select("id,policy_name,premium_due_date,maturity_date")
      .then(({ data }) => {
        const evs: CalEvent[] = [];
        ((data ?? []) as Array<{ id: string; policy_name: string; premium_due_date: string | null; maturity_date: string | null }>).forEach((p) => {
          if (p.premium_due_date && p.premium_due_date >= startStr && p.premium_due_date <= endStr) {
            evs.push({ kind: "policy_premium", id: `${p.id}-prem`, date: p.premium_due_date, title: `${p.policy_name} · premium` });
          }
          if (p.maturity_date && p.maturity_date >= startStr && p.maturity_date <= endStr) {
            evs.push({ kind: "policy_maturity", id: `${p.id}-mat`, date: p.maturity_date, title: `${p.policy_name} · matures` });
          }
        });
        setPolicyEvents(evs);
      });
  }, [cursor, user, isFamilyMember]);

  const byDay = useMemo(() => {
    const m: Record<string, CalEvent[]> = {};
    docs.forEach((d) => { (m[d.expiry_date] ??= []).push({ kind: "doc", id: d.id, date: d.expiry_date, title: d.title, doc: d }); });
    policyEvents.forEach((e) => { (m[e.date] ??= []).push(e); });
    return m;
  }, [docs, policyEvents]);

  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const firstDow = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === cursor.getFullYear() &&
    today.getMonth() === cursor.getMonth() &&
    today.getDate() === day;

  if (!user) return null;

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Renewals calendar</h1>
            <p className="text-sm text-muted-foreground">{monthName} · {docs.length} expiring</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <GoogleCalendarConnect />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-xs font-medium text-muted-foreground">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const key = day ? `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}` : null;
            const items = key ? (byDay[key] ?? []) : [];
            return (
              <div key={i} className={cn(
                "min-h-[88px] border-b border-r border-border/60 p-1.5 text-xs",
                !day && "bg-muted/10"
              )}>
                {day && (
                  <>
                    <div className={cn("mb-1 text-right text-[11px]", isToday(day) ? "font-bold text-primary" : "text-muted-foreground")}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {items.slice(0, 3).map((ev) => {
                        const n = daysUntil(ev.date);
                        const danger = n !== null && n <= 7;
                        const isPolicy = ev.kind !== "doc";
                        return (
                          <button
                            key={ev.id}
                            onClick={() => { if (ev.kind === "doc") setPreview(ev.doc); }}
                            className={cn(
                              "block w-full truncate rounded px-1.5 py-1 text-left text-[11px] transition",
                              danger ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                                : isPolicy ? "bg-warning/15 text-warning-foreground hover:bg-warning/25"
                                : "bg-primary-soft text-primary hover:bg-primary/15"
                            )}
                            title={ev.title}
                          >
                            {ev.title}
                          </button>
                        );
                      })}
                      {items.length > 3 && (
                        <div className="px-1.5 text-[10px] text-muted-foreground">+{items.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {docs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">All this month</h2>
          <Card className="divide-y divide-border">
            {docs.map((d) => {
              const n = daysUntil(d.expiry_date);
              return (
                <button key={d.id} onClick={() => setPreview(d)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/40">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{d.title}</div>
                    <div className="text-xs text-muted-foreground">{d.expiry_date}</div>
                  </div>
                  <Badge variant={n !== null && n <= 7 ? "destructive" : "secondary"}>
                    {n === null ? "—" : n < 0 ? `expired ${-n}d ago` : n === 0 ? "today" : `in ${n}d`}
                  </Badge>
                </button>
              );
            })}
          </Card>
        </section>
      )}

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        title={preview?.title ?? ""}
        storagePath={preview?.storage_path ?? null}
        mimeType={preview?.mime_type ?? null}
        documentId={preview?.id ?? null}
        ownerId={user.id}
        sizeBytes={preview?.size_bytes ?? null}
        updatedAt={preview?.created_at ?? null}
      />
    </AppShell>
  );
}
