import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, HardDrive } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatDate, daysUntil } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Family View — Family Vault" }] }),
  ssr: false,
  component: AdminPage,
});

type Row = {
  id: string;
  title: string;
  storage_path: string;
  owner_id: string;
  member_name: string | null;
  size_bytes: number | null;
  expiry_date: string | null;
  created_at: string;
};

type FamilyMember = { slug: string; email: string | null; name: string };

const UNASSIGNED = "Unassigned";

function AdminPage() {
  const router = useRouter();
  const { isFamilyMember, loading } = useAuth();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [activeMember, setActiveMember] = useState<string>("__all");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  useEffect(() => {
    (async () => {
      if (!isFamilyMember) return;
      const [fm, d] = await Promise.all([
        supabase.from("family_members").select("slug,email,name").order("sort_order").order("name"),
        supabase
          .from("documents")
          .select("id,title,storage_path,owner_id,member_name,size_bytes,expiry_date,created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      setFamilyMembers((fm.data ?? []) as FamilyMember[]);
      setRows((d.data ?? []) as Row[]);
    })();
  }, [isFamilyMember]);

  useEffect(() => {
    if (!loading && !isFamilyMember) {
      router.navigate({ to: "/home", replace: true });
    }
  }, [isFamilyMember, loading, router]);

  const open = async (p: string) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(p, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const { countsByMember, bytesByMember, totalBytes } = useMemo(() => {
    const counts = new Map<string, number>();
    const bytes = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      const key = r.member_name ?? UNASSIGNED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const sz = r.size_bytes ?? 0;
      bytes.set(key, (bytes.get(key) ?? 0) + sz);
      total += sz;
    }
    return { countsByMember: counts, bytesByMember: bytes, totalBytes: total };
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (activeMember === "__all") return rows;
    if (activeMember === UNASSIGNED) return rows.filter((r) => !r.member_name);
    return rows.filter((r) => r.member_name === activeMember);
  }, [rows, activeMember]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedRows = useMemo(
    () => filteredRows.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [filteredRows, currentPage],
  );

  useEffect(() => { setPage(0); }, [activeMember]);

  if (loading || !isFamilyMember) return null;

  const memberTabs: { key: string; label: string; count: number }[] = [
    { key: "__all", label: "All", count: rows.length },
    ...familyMembers.map((m) => ({
      key: m.name,
      label: m.name,
      count: countsByMember.get(m.name) ?? 0,
    })),
    { key: UNASSIGNED, label: UNASSIGNED, count: countsByMember.get(UNASSIGNED) ?? 0 },
  ];

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Family View</h1>
        <Button asChild size="sm" variant="outline">
          <Link to="/setup">Family &amp; storage setup</Link>
        </Button>
      </div>



      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Family members ({familyMembers.length})</h2>
        <Card className="divide-y divide-border">
          {familyMembers.map((m) => (
            <div key={m.slug} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{m.email ?? "Shared folder"}</div>
              </div>
              <Badge variant="secondary">{countsByMember.get(m.name) ?? 0} files</Badge>
            </div>
          ))}
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <HardDrive className="h-5 w-5 text-muted-foreground" /> Storage usage
        </h2>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total used</span>
            <span className="font-medium">{formatBytes(totalBytes)}</span>
          </div>
          <div className="space-y-2 pt-2">
            {[...familyMembers.map((m) => m.name), UNASSIGNED]
              .filter((name) => (bytesByMember.get(name) ?? 0) > 0 || (countsByMember.get(name) ?? 0) > 0)
              .map((name) => {
                const used = bytesByMember.get(name) ?? 0;
                const pct = totalBytes > 0 ? Math.round((used / totalBytes) * 100) : 0;
                return (
                  <div key={name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground">
                        {formatBytes(used)} <span className="opacity-60">({pct}%)</span>
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            {totalBytes === 0 && (
              <div className="text-sm text-muted-foreground">No files uploaded yet.</div>
            )}
          </div>
        </Card>
      </section>



      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Files by member ({filteredRows.length})</h2>
          <div className="flex flex-wrap gap-2">
            {memberTabs.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={activeMember === t.key ? "default" : "outline"}
                onClick={() => setActiveMember(t.key)}
              >
                {t.label} <span className="ml-1 opacity-70">({t.count})</span>
              </Button>
            ))}
          </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((r) => {
                const n = daysUntil(r.expiry_date);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell>{r.member_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    <TableCell>
                      {r.expiry_date ? (
                        <Badge variant={n !== null && (n < 0 || n <= 7) ? "destructive" : "secondary"}>
                          {formatDate(r.expiry_date)}
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatBytes(r.size_bytes)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => open(r.storage_path)}><Download className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredRows.length > pageSize && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
              <div className="text-muted-foreground">
                Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, filteredRows.length)} of {filteredRows.length}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Previous
                </Button>
                <span className="text-muted-foreground">Page {currentPage + 1} of {totalPages}</span>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </section>
    </AppShell>
  );
}
