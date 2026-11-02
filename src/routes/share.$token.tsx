import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSharedDocument } from "@/lib/shares.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, FileText, ShieldAlert } from "lucide-react";
import { formatBytes, resolveMimeType } from "@/lib/utils";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [{ title: "Shared document — Family Vault" }] }),
  component: SharePage,
});

type Result =
  | { ok: true; title: string; mime_type: string | null; size_bytes: number | null; url: string }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

function SharePage() {
  const { token } = Route.useParams();
  const fetchShare = useServerFn(getSharedDocument);
  const [state, setState] = useState<Result | { ok: "loading" } | { ok: "error"; message: string }>({ ok: "loading" });

  useEffect(() => {
    fetchShare({ data: { token } })
      .then((r) => setState(r as Result))
      .catch((e) => setState({ ok: "error", message: e instanceof Error ? e.message : "Failed to load" }));
  }, [token, fetchShare]);

  if (state.ok === "loading") {
    return <Centered>Loading…</Centered>;
  }
  if (state.ok === "error") {
    return <Centered><ErrorCard title="Couldn’t load this link" body={state.message} /></Centered>;
  }
  if (state.ok === false) {
    const msg =
      state.reason === "expired" ? "This link has expired." :
      state.reason === "revoked" ? "This link has been revoked." :
      "This link is invalid or no longer available.";
    return <Centered><ErrorCard title="Link unavailable" body={msg} /></Centered>;
  }

  const effectiveMime = resolveMimeType(state.mime_type, state.title);
  const isImage = (effectiveMime ?? "").startsWith("image/");
  const isPdf = effectiveMime === "application/pdf";

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <div className="truncate text-sm font-medium">{state.title}</div>
          {state.size_bytes != null && (
            <span className="ml-2 text-xs text-muted-foreground">{formatBytes(state.size_bytes)}</span>
          )}
        </div>
        <Button asChild size="sm" className="gap-2">
          <a href={state.url} download={state.title}>
            <Download className="h-4 w-4" /> Download
          </a>
        </Button>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Card className="overflow-hidden">
          <div className="h-[80vh] w-full bg-muted/30">
            {isImage ? (
              <div className="grid h-full place-items-center p-4">
                <img src={state.url} alt={state.title} className="max-h-full max-w-full object-contain" />
              </div>
            ) : isPdf ? (
              <iframe src={state.url} title={state.title} className="h-full w-full" />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                Preview not available for this file type. Use Download to view it.
              </div>
            )}
          </div>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Shared securely via Family Vault.
        </p>
      </main>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-background p-4">{children}</div>;
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="max-w-sm p-6 text-center">
      <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}
