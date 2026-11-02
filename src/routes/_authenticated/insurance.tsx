import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, Plus, Sparkles, Pencil, Trash2, CalendarClock, Coins, FileText, CheckCircle2, History, Trash, BadgeCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useFamilySlots, type FamilySlot } from "@/lib/family-slots";
import { daysUntil, formatDate } from "@/lib/utils";
import { extractInsuranceFromDocument } from "@/lib/insurance.functions";

export const Route = createFileRoute("/_authenticated/insurance")({
  head: () => ({ meta: [{ title: "Insurance — Family Vault" }] }),
  component: InsurancePage,
});

type Policy = {
  id: string;
  owner_id: string;
  family_slot: FamilySlot | null;
  member_name: string | null;
  policy_name: string;
  policy_number: string | null;
  provider: string | null;
  policy_type: string | null;
  premium_amount: number | null;
  premium_frequency: string | null;
  premium_due_date: string | null;
  sum_assured: number | null;
  maturity_date: string | null;
  maturity_amount: number | null;
  start_date: string | null;
  notes: string | null;
  source_document_id: string | null;
  maturity_received_at: string | null;
  maturity_note: string | null;
};

type DocOption = { id: string; title: string };

const POLICY_TYPES = ["life", "health", "car", "term", "ulip", "endowment", "other"];
const FREQUENCIES = ["monthly", "quarterly", "half-yearly", "yearly", "single"];

const emptyForm = (): Partial<Policy> => ({
  policy_name: "",
  policy_number: "",
  provider: "",
  policy_type: "life",
  family_slot: null,
  member_name: "",
  premium_amount: null,
  premium_frequency: "yearly",
  premium_due_date: "",
  sum_assured: null,
  maturity_date: "",
  maturity_amount: null,
  start_date: "",
  notes: "",
  maturity_note: "",
});

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

type StatusKind = "overdue" | "due-soon" | "upcoming" | "paid" | "matured" | "single" | "none";
type StatusInfo = { kind: StatusKind; label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string };

function policyStatus(p: Policy): StatusInfo {
  if (p.maturity_received_at) return { kind: "matured", label: "Matured", variant: "outline", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (p.premium_frequency === "single" && !p.premium_due_date) return { kind: "single", label: "Single premium", variant: "outline" };
  const d = p.premium_due_date;
  if (!d) return { kind: "none", label: "No schedule", variant: "outline" };
  const n = daysUntil(d);
  if (n == null) return { kind: "none", label: "No schedule", variant: "outline" };
  if (n < 0) return { kind: "overdue", label: `${-n}d overdue`, variant: "destructive" };
  if (n === 0) return { kind: "due-soon", label: "Due today", variant: "destructive" };
  if (n <= 7) return { kind: "due-soon", label: `Due in ${n}d`, variant: "destructive" };
  if (n <= 30) return { kind: "upcoming", label: `Due in ${n}d`, variant: "secondary", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
  return { kind: "paid", label: `Paid · next in ${n}d`, variant: "outline", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
}

function StatusBadge({ p, className }: { p: Policy; className?: string }) {
  const s = policyStatus(p);
  return (
    <Badge variant={s.variant} className={[s.className, className].filter(Boolean).join(" ")}>
      {s.label}
    </Badge>
  );
}

function InsurancePage() {
  const { slots, slotName } = useFamilySlots();
  const { user } = useAuth();
  const extract = useServerFn(extractInsuranceFromDocument);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [form, setForm] = useState<Partial<Policy>>(emptyForm());
  const [importOpen, setImportOpen] = useState(false);
  const [importDocId, setImportDocId] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("insurance_policies")
      .select("*")
      .order("premium_due_date", { ascending: true, nullsFirst: false });
    setPolicies((data ?? []) as Policy[]);
  };

  const loadDocs = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id, title")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    setDocs((data ?? []) as DocOption[]);
  };

  useEffect(() => {
    if (!user) return;
    load();
    loadDocs();
  }, [user]);

  const { upcoming, maturing, credited, all } = useMemo(() => {
    const sorted = [...policies];
    const upcoming = sorted
      .filter((p) => p.premium_due_date)
      .sort((a, b) => (a.premium_due_date! < b.premium_due_date! ? -1 : 1));
    const maturing = sorted
      .filter((p) => p.maturity_date && !p.maturity_received_at)
      .sort((a, b) => (a.maturity_date! < b.maturity_date! ? -1 : 1));
    const credited = sorted
      .filter((p) => p.maturity_received_at)
      .sort((a, b) => (a.maturity_received_at! > b.maturity_received_at! ? -1 : 1));
    return { upcoming, maturing, credited, all: sorted };
  }, [policies]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (p: Policy) => {
    setEditing(p);
    setForm({
      ...p,
      premium_due_date: p.premium_due_date ?? "",
      maturity_date: p.maturity_date ?? "",
      start_date: p.start_date ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.policy_name?.trim()) { toast.error("Policy name is required"); return; }
    const payload = {
      owner_id: user.id,
      family_slot: form.family_slot ?? null,
      member_name: form.member_name?.toString().trim() || null,
      policy_name: form.policy_name.trim(),
      policy_number: form.policy_number?.toString().trim() || null,
      provider: form.provider?.toString().trim() || null,
      policy_type: form.policy_type ?? null,
      premium_amount: form.premium_amount == null || (form.premium_amount as unknown) === "" ? null : Number(form.premium_amount),
      premium_frequency: form.premium_frequency ?? null,
      premium_due_date: form.premium_due_date || null,
      sum_assured: form.sum_assured == null || (form.sum_assured as unknown) === "" ? null : Number(form.sum_assured),
      maturity_date: form.maturity_date || null,
      maturity_amount: form.maturity_amount == null || (form.maturity_amount as unknown) === "" ? null : Number(form.maturity_amount),
      start_date: form.start_date || null,
      notes: form.notes?.toString().trim() || null,
      maturity_note: form.maturity_note?.toString().trim() || null,
      maturity_received_at:
        (form as Policy).maturity_received_at ?? (editing?.maturity_received_at ?? null),
    };
    if (editing) {
      const { error } = await supabase.from("insurance_policies").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Policy updated");
    } else {
      const { error } = await supabase.from("insurance_policies").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Policy added");
    }
    setOpen(false);
    load();
  };

  const remove = async (p: Policy) => {
    if (!confirm(`Delete "${p.policy_name}"?`)) return;
    const { error } = await supabase.from("insurance_policies").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  };

  const advanceDueDate = (dateStr: string | null, freq: string | null): string | null => {
    const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const monthsByFreq: Record<string, number> = {
      monthly: 1, quarterly: 3, "half-yearly": 6, yearly: 12,
    };
    if (freq === "single") return null;
    const months = (freq ? monthsByFreq[freq] : undefined) ?? 12;
    const d = new Date(base);
    const day = d.getDate();
    d.setMonth(d.getMonth() + months);
    // Handle month overflow (e.g. Jan 31 + 1 month)
    if (d.getDate() < day) d.setDate(0);
    // If we're catching up overdue premiums, keep advancing until future
    const today = new Date(); today.setHours(0, 0, 0, 0);
    while (d < today) {
      d.setMonth(d.getMonth() + months);
    }
    return d.toISOString().slice(0, 10);
  };

  const markPaid = async (p: Policy) => {
    const next = advanceDueDate(p.premium_due_date, p.premium_frequency);
    const { error } = await supabase
      .from("insurance_policies")
      .update({ premium_due_date: next })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    if (user) {
      await supabase.from("insurance_payments").insert({
        policy_id: p.id,
        owner_id: user.id,
        previous_due_date: p.premium_due_date,
        next_due_date: next,
        amount: p.premium_amount,
      });
    }
    toast.success(next ? `Marked paid · next due ${formatDate(next)}` : "Marked paid");
    load();
  };

  const markMaturityReceived = async (p: Policy) => {
    const { error } = await supabase
      .from("insurance_policies")
      .update({ maturity_received_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked as received");
    load();
  };


  const runImport = async () => {
    if (!importDocId) return;
    setImporting(true);
    try {
      const res = await extract({ data: { documentId: importDocId } });
      const parts: string[] = [];
      if (res.inserted) parts.push(`${res.inserted} new`);
      if (res.merged) parts.push(`${res.merged} enriched`);
      toast.success(parts.length ? `Imported · ${parts.join(", ")}` : "No policies found");
      setImportOpen(false);
      setImportDocId("");
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Insurance tracker</h1>
            <p className="text-sm text-muted-foreground">{all.length} polic{all.length === 1 ? "y" : "ies"} on file</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">Import from document</span>
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" /> Upcoming premium dates
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No premium due dates yet.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 6).map((p) => {
                const n = daysUntil(p.premium_due_date);
                return (
                  <button key={p.id} onClick={() => openEdit(p)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.policy_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{[p.provider, fmtMoney(p.premium_amount)].filter(Boolean).join(" · ")}</div>
                    </div>
                    <Badge variant={n !== null && n <= 7 ? "destructive" : n !== null && n <= 30 ? "secondary" : "outline"}>
                      {n === null ? "—" : n < 0 ? `${-n}d overdue` : n === 0 ? "today" : `in ${n}d`}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Coins className="h-4 w-4 text-primary" /> Upcoming maturities
          </div>
          {maturing.length === 0 ? (
            <p className="text-sm text-muted-foreground">No maturity dates yet.</p>
          ) : (
            <div className="space-y-2">
              {maturing.slice(0, 6).map((p) => {
                const n = daysUntil(p.maturity_date);
                return (
                  <div key={p.id} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                    <button onClick={() => openEdit(p)} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.policy_name}</div>
                        <div className="truncate text-xs text-muted-foreground">{[p.provider, fmtMoney(p.maturity_amount)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <Badge variant="outline">{p.maturity_date ? formatDate(p.maturity_date) : "—"}{n !== null && n >= 0 ? ` · in ${n}d` : ""}</Badge>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => markMaturityReceived(p)}
                      aria-label="Mark money received"
                      title="Mark money received"
                    >
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <CreditedByPerson policies={credited} onSelect={openEdit} />

      <MaturityTimeline policies={maturing.filter((p) => p.maturity_amount != null)} onSelect={openEdit} />

      <MaturityTimeline
        title="Lumpsum maturity timeline (excluding Gopesh)"
        policies={maturing.filter(
          (p) =>
            p.maturity_amount != null &&
            !(p.member_name ?? "").toLowerCase().includes("gopesh"),
        )}
        onSelect={openEdit}
      />

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">All policies</h2>
        {all.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No policies yet. Click <span className="font-medium text-foreground">Add</span> or <span className="font-medium text-foreground">Import from document</span> to get started.
          </Card>
        ) : (
          (() => {
            const classify = (p: Policy): string => {
              const hay = `${p.provider ?? ""} ${p.policy_name ?? ""}`.toLowerCase();
              if (/tata/.test(hay)) return "tata";
              if (/bajaj/.test(hay)) return "bajaj";
              if (/icici/.test(hay)) return "icici";
              if (/axis/.test(hay)) return "axis";
              if (/hdfc/.test(hay)) return "hdfc";
              if (/\blic\b|life insurance corp|jeevan|endowment|annuity/.test(hay)) return "lic";
              return "other";
            };
            const groups: Record<string, Policy[]> = { lic: [], icici: [], axis: [], hdfc: [], tata: [], bajaj: [], other: [] };
            for (const p of all) groups[classify(p)].push(p);
            const tabs: { key: string; label: string }[] = [
              { key: "lic", label: "LIC" },
              { key: "icici", label: "ICICI Pru" },
              { key: "axis", label: "Axis Life" },
              { key: "hdfc", label: "HDFC Life" },
              { key: "tata", label: "Tata AIA" },
              { key: "bajaj", label: "Bajaj Life" },
              { key: "other", label: "Other" },
            ];
            const firstNonEmpty = tabs.find((t) => groups[t.key].length > 0)?.key ?? "lic";
            return (
              <Tabs defaultValue={firstNonEmpty}>
                <TabsList className="flex flex-wrap h-auto">
                  {tabs.map((t) => (
                    <TabsTrigger key={t.key} value={t.key} className="gap-2">
                      {t.label}
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">{groups[t.key].length}</Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((t) => (
                  <TabsContent key={t.key} value={t.key} className="mt-3">
                    {groups[t.key].length === 0 ? (
                      <Card className="p-6 text-center text-sm text-muted-foreground">No policies under {t.label}.</Card>
                    ) : (
                      <Card className="divide-y divide-border">
                        {groups[t.key].map((p) => (
                          <div key={p.id} className="flex items-start gap-3 p-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{p.policy_name}</span>
                                <StatusBadge p={p} />
                                {p.policy_type && <Badge variant="outline" className="capitalize">{p.policy_type}</Badge>}
                                {p.family_slot && <Badge variant="secondary">{p.member_name || slotName(p.family_slot)}</Badge>}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {[p.provider, p.policy_number && `#${p.policy_number}`].filter(Boolean).join(" · ") || "No provider info"}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                                {p.premium_due_date && (
                                  <span className="text-muted-foreground">Premium <span className="font-medium text-foreground">{formatDate(p.premium_due_date)}</span> · {fmtMoney(p.premium_amount)} {p.premium_frequency ?? ""}</span>
                                )}
                                {p.maturity_date && (
                                  <span className="text-muted-foreground">Matures <span className="font-medium text-foreground">{formatDate(p.maturity_date)}</span>{p.maturity_amount ? ` · ${fmtMoney(p.maturity_amount)}` : ""}</span>
                                )}
                                {p.sum_assured != null && (
                                  <span className="text-muted-foreground">Sum assured <span className="font-medium text-foreground">{fmtMoney(p.sum_assured)}</span></span>
                                )}
                              </div>
                              {p.maturity_received_at && (
                                <div className="mt-1 flex items-start gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                                  <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <div>
                                    <span className="font-medium">Money credited</span>
                                    <span className="text-emerald-700/80 dark:text-emerald-300/80"> · {formatDate(p.maturity_received_at.slice(0, 10))}</span>
                                    {p.maturity_note && <div className="text-emerald-800/90 dark:text-emerald-200/90">{p.maturity_note}</div>}
                                  </div>
                                </div>
                              )}
                              {p.notes && <NotesPreview text={p.notes} title={p.policy_name} />}
                              {p.source_document_id && (
                                <Link to="/folders" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                  <FileText className="h-3 w-3" /> source document
                                </Link>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              {p.premium_due_date && (
                                <Button variant="ghost" size="icon" onClick={() => markPaid(p)} aria-label="Mark premium as paid" title="Mark premium as paid">
                                  <CheckCircle2 className="h-4 w-4 text-primary" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => remove(p)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        ))}
                      </Card>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            );
          })()
        )}
      </section>

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{editing ? "Edit policy" : "Add policy"}</span>
              {editing && <StatusBadge p={editing} />}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Policy name *"><Input value={form.policy_name ?? ""} onChange={(e) => setForm({ ...form, policy_name: e.target.value })} /></Field>
            <Field label="Provider"><Input value={form.provider ?? ""} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></Field>
            <Field label="Policy number"><Input value={form.policy_number ?? ""} onChange={(e) => setForm({ ...form, policy_number: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={form.policy_type ?? undefined} onValueChange={(v) => setForm({ ...form, policy_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{POLICY_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Member / slot">
              <Select value={form.family_slot ?? undefined} onValueChange={(v) => setForm({ ...form, family_slot: v as FamilySlot })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{slots.map((s) => <SelectItem key={s.slot} value={s.slot}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Insured person name"><Input value={form.member_name ?? ""} onChange={(e) => setForm({ ...form, member_name: e.target.value })} /></Field>
            <Field label="Premium amount"><Input type="number" value={form.premium_amount ?? ""} onChange={(e) => setForm({ ...form, premium_amount: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <Field label="Frequency">
              <Select value={form.premium_frequency ?? undefined} onValueChange={(v) => setForm({ ...form, premium_frequency: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Next premium due"><Input type="date" value={form.premium_due_date ?? ""} onChange={(e) => setForm({ ...form, premium_due_date: e.target.value })} /></Field>
            <Field label="Start date"><Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
            <Field label="Maturity date"><Input type="date" value={form.maturity_date ?? ""} onChange={(e) => setForm({ ...form, maturity_date: e.target.value })} /></Field>
            <Field label="Maturity amount"><Input type="number" value={form.maturity_amount ?? ""} onChange={(e) => setForm({ ...form, maturity_amount: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <Field label="Sum assured"><Input type="number" value={form.sum_assured ?? ""} onChange={(e) => setForm({ ...form, sum_assured: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            <div className="md:col-span-2">
              <Field label="Notes"><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={!!(form as Policy).maturity_received_at}
                  onCheckedChange={(v) =>
                    setForm({
                      ...form,
                      maturity_received_at: v ? new Date().toISOString() : null,
                    } as Partial<Policy>)
                  }
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <BadgeCheck className="h-4 w-4 text-emerald-600" />
                    Already matured — money credited to account
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Marks this policy as settled and removes it from upcoming maturity reminders.
                  </p>
                  {(form as Policy).maturity_received_at && (
                    <div className="mt-2">
                      <Input
                        placeholder="Additional info (bank, date credited, reference…)"
                        value={form.maturity_note ?? ""}
                        onChange={(e) => setForm({ ...form, maturity_note: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
            {editing && (
              <div className="md:col-span-2">
                <PaymentHistory policyId={editing.id} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {editing && editing.premium_due_date && (
                <Button
                  variant="outline"
                  onClick={async () => { await markPaid(editing); setOpen(false); }}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Mark as paid
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>{editing ? "Save changes" : "Add policy"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from a document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Pick a PDF or image. AI will read it and create policy entries you can edit afterwards.</p>
          <Select value={importDocId} onValueChange={setImportDocId}>
            <SelectTrigger><SelectValue placeholder="Select a document" /></SelectTrigger>
            <SelectContent>
              {docs.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={runImport} disabled={!importDocId || importing} className="gap-2">
              <Sparkles className="h-4 w-4" /> {importing ? "Reading…" : "Extract policies"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

type PaymentEntry = {
  id: string;
  paid_on: string;
  previous_due_date: string | null;
  next_due_date: string | null;
  amount: number | null;
  note: string | null;
  created_at: string;
};

function PaymentHistory({ policyId }: { policyId: string }) {
  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("insurance_payments")
      .select("id, paid_on, previous_due_date, next_due_date, amount, note, created_at")
      .eq("policy_id", policyId)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false });
    setEntries((data ?? []) as PaymentEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [policyId]);

  const remove = async (id: string) => {
    if (!confirm("Delete this payment log entry?")) return;
    const { error } = await supabase.from("insurance_payments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Entry deleted");
    load();
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <History className="h-3.5 w-3.5 text-primary" /> Payment history
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{entries.length}</Badge>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No payments logged yet. Use "Mark as paid" to add one.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-2 py-1.5 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  Paid on {formatDate(e.paid_on)}
                  {e.amount != null && <span className="text-muted-foreground"> · {fmtMoney(Number(e.amount))}</span>}
                </div>
                <div className="text-muted-foreground">
                  {e.previous_due_date ? `Cleared due ${formatDate(e.previous_due_date)}` : "No prior due date"}
                  {e.next_due_date ? ` → next ${formatDate(e.next_due_date)}` : " · no further due"}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => remove(e.id)}
                aria-label="Delete entry"
              >
                <Trash className="h-3 w-3 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesPreview({ text, title }: { text: string; title: string }) {
  const [open, setOpen] = useState(false);
  const firstPara = text.split(/\n\s*\n/)[0]?.trim() ?? text;
  const hasMore = firstPara.length < text.trim().length;
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      <p className="whitespace-pre-wrap">{firstPara}</p>
      {hasMore && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-1 text-primary hover:underline"
          >
            View more
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{title} — Notes</DialogTitle>
              </DialogHeader>
              <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function MaturityTimeline({ policies, onSelect, title = "Lumpsum maturity timeline" }: { policies: Policy[]; onSelect: (p: Policy) => void; title?: string }) {
  const { slotName } = useFamilySlots();
  if (policies.length === 0) return null;
  const lumpOf = (p: Policy) => p.maturity_amount ?? 0;
  const totalAmount = policies.reduce((s, p) => s + lumpOf(p), 0);

  const sorted = [...policies].sort((a, b) => (a.maturity_date! < b.maturity_date! ? -1 : 1));
  const byYear = new Map<number, Policy[]>();
  for (const p of sorted) {
    const y = new Date(p.maturity_date! + "T00:00:00").getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(p);
  }
  const yearEntries = Array.from(byYear.entries()).sort((a, b) => a[0] - b[0]);
  const maxYearTotal = Math.max(...yearEntries.map(([, ps]) => ps.reduce((s, p) => s + lumpOf(p), 0)), 1);

  return (
    <Card className="mt-6 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4 text-primary" /> {title}
        </div>
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-semibold text-foreground">{fmtMoney(totalAmount)}</span> across {policies.length} polic{policies.length === 1 ? "y" : "ies"}
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-full items-end gap-3" style={{ minHeight: 220 }}>
          {yearEntries.map(([year, ps]) => {
            const yearTotal = ps.reduce((s, p) => s + lumpOf(p), 0);
            const colH = 60 + (yearTotal / maxYearTotal) * 180; // 60-240px, strictly proportional
            return (
              <div key={year} className="flex min-w-[120px] flex-1 flex-col items-center">
                <div className="mb-1 text-[11px] font-semibold text-foreground">{fmtMoney(yearTotal)}</div>
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-md border border-border bg-muted/30"
                  style={{ height: colH }}
                >
                  {ps.map((p) => {
                    const share = lumpOf(p) / Math.max(yearTotal, 1);
                    const segH = share * colH;
                    const showLabel = segH >= 16;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelect(p)}
                        className="group relative w-full bg-primary/70 transition hover:bg-primary"
                        style={{ height: `${share * 100}%`, borderTop: "1px solid hsl(var(--background))" }}
                        title={`${p.policy_name} · ${p.member_name ?? ""} · ${formatDate(p.maturity_date)} · ${fmtMoney(lumpOf(p))}`}
                      >
                        {showLabel && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-1 text-[10px] font-medium leading-none text-primary-foreground truncate">
                            {p.member_name || (p.family_slot ? slotName(p.family_slot) : "")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 border-t border-border pt-1 text-center">
                  <div className="text-xs font-semibold">{year}</div>
                  <div className="text-[10px] text-muted-foreground">{ps.length} polic{ps.length === 1 ? "y" : "ies"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Policy</th>
              <th className="py-2 pr-3 font-medium">Member</th>
              <th className="py-2 pr-3 font-medium">Matures</th>
              <th className="py-2 pr-3 font-medium">In</th>
              <th className="py-2 pr-3 text-right font-medium">Lumpsum</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const n = daysUntil(p.maturity_date);
              const years = n != null ? (n / 365).toFixed(1) : "—";
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium">{p.policy_name}</div>
                    <div className="text-xs text-muted-foreground">{p.provider ?? ""}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs">{p.member_name || (p.family_slot ? slotName(p.family_slot) : "—")}</td>
                  <td className="py-2 pr-3 text-xs">{formatDate(p.maturity_date)}</td>
                  <td className="py-2 pr-3 text-xs">{n != null && n >= 0 ? `${years} yr` : "—"}</td>
                  <td className="py-2 pr-3 text-right font-medium">{fmtMoney(lumpOf(p))}</td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="py-2 pr-3" colSpan={4}>Total</td>
              <td className="py-2 pr-3 text-right">{fmtMoney(totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CreditedByPerson({ policies, onSelect }: { policies: Policy[]; onSelect: (p: Policy) => void }) {
  const { slotName } = useFamilySlots();
  if (policies.length === 0) return null;
  const keyOf = (p: Policy) => (p.member_name?.trim() || (p.family_slot ? slotName(p.family_slot) : "Unassigned"));
  const groups = new Map<string, { total: number; items: Policy[] }>();
  for (const p of policies) {
    const k = keyOf(p);
    if (!groups.has(k)) groups.set(k, { total: 0, items: [] });
    const g = groups.get(k)!;
    g.total += p.maturity_amount ?? 0;
    g.items.push(p);
  }
  const entries = Array.from(groups.entries()).sort((a, b) => b[1].total - a[1].total);
  const grandTotal = entries.reduce((s, [, g]) => s + g.total, 0);

  return (
    <Card className="mt-6 border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <BadgeCheck className="h-4 w-4" /> Credited to account (by person)
        </div>
        <div className="text-xs text-muted-foreground">
          Total credited: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{fmtMoney(grandTotal)}</span> across {policies.length} polic{policies.length === 1 ? "y" : "ies"}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([name, g]) => (
          <div key={name} className="rounded-lg border border-emerald-500/30 bg-background p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate font-medium">{name}</div>
              <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{fmtMoney(g.total)}</div>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{g.items.length} polic{g.items.length === 1 ? "y" : "ies"}</div>
            <ul className="mt-2 space-y-1">
              {g.items.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onSelect(p)}
                    className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-emerald-500/10"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{p.policy_name}</span>
                      {p.maturity_received_at && (
                        <span className="text-muted-foreground"> · {formatDate(p.maturity_received_at.slice(0, 10))}</span>
                      )}
                      {p.maturity_note && (
                        <span className="block truncate text-[11px] text-muted-foreground">{p.maturity_note}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium text-emerald-700 dark:text-emerald-300">{fmtMoney(p.maturity_amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
