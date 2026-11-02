import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Copy, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

const ALIAS_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
// The domain your inbound email provider (e.g. Postmark) receives mail for. See the README.
const DOMAIN = (import.meta.env.VITE_INBOUND_EMAIL_DOMAIN as string | undefined)?.trim() || "";

type Member = { email: string; name: string };

export function FamilyEmail() {
  const { isAdmin } = useAuth();
  const [alias, setAlias] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    supabase
      .from("family_settings")
      .select("family_alias")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setAlias(data?.family_alias ?? null));

    supabase
      .from("family_members")
      .select("email,name")
      .order("name")
      .then(({ data }) => setMembers((data ?? []).filter((m): m is Member => !!m.email)));
  }, []);

  if (!alias && !editing) return null;

  const email = alias ? `${alias}@${DOMAIN}` : "";

  const startEdit = () => {
    setDraft(alias ?? "");
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim().toLowerCase();
    if (!ALIAS_RE.test(next)) {
      toast.error("Use 3–30 letters, numbers, or dashes (no spaces).");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("family_settings")
      .update({ family_alias: next })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAlias(next);
    setEditing(false);
    toast.success("Family email updated");
  };

  return (
    <Card className="mb-8 p-4">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Your family email</div>
          <p className="text-sm text-muted-foreground">
            Forward documents here. We'll file them under the sender's name automatically.
          </p>

          {editing ? (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-sm">
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="h-7 flex-1 min-w-0 border-0 bg-transparent px-1 font-mono text-sm focus-visible:ring-0"
                placeholder="family"
              />
              <span className="shrink-0 text-muted-foreground">@{DOMAIN}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={saving} aria-label="Save">
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)} aria-label="Cancel">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
              <span className="truncate">{email}</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    navigator.clipboard.writeText(email);
                    toast.success("Copied");
                  }}
                  aria-label="Copy email"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEdit} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {members.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Recognised senders</div>
              {members.map((m) => (
                <div key={m.email} className="flex items-center gap-2 text-sm">
                  <span className="font-medium w-20 shrink-0">{m.name}</span>
                  <span className="font-mono text-xs text-muted-foreground truncate">{m.email}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
