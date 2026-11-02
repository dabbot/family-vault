import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Folder, Mail, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Family Vault" },
      { name: "description", content: "Securely access your family's documents." },
    ],
  }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.navigate({ to: "/" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const friendly = (msg: string) =>
    /not an authorized family member|Access denied|Database error saving new user/i.test(msg)
      ? "This account isn't on the family list. Ask the admin to add your email."
      : msg || "Sign-in failed. Please try again.";

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast.error(friendly(error.message));
      setBusy(false);
    }
  };

  const magicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) toast.error(friendly(error.message));
    else setSent(true);
  };

  // Shows the provider error that Supabase puts in the URL after a refused sign-in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const msg = params.get("error_description");
    if (msg) toast.error(friendly(msg.replace(/\+/g, " ")));
  }, []);

  return (
    <div className="grid min-h-screen bg-gradient-to-br from-primary to-primary/70 md:grid-cols-2 md:bg-none">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-primary to-primary/70 p-10 text-primary-foreground md:flex">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 backdrop-blur">
            <Folder className="h-5 w-5" />
          </div>
          <div className="text-lg font-semibold">Family Vault</div>
        </div>
        <div className="max-w-sm">
          <ShieldCheck className="mb-4 h-10 w-10 opacity-90" />
          <h1 className="text-3xl font-semibold leading-tight">Every family document, in one safe place.</h1>
          <p className="mt-3 text-primary-foreground/80">
            Passports, policies, school records and bills — organised per person, searchable, and mirrored to your own Dropbox or Google Drive.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/60">Self-hosted · open source</div>
      </div>

      <div className="flex flex-col items-center p-6 md:justify-center md:p-10">
        {/* Mobile branding header */}
        <div className="flex w-full max-w-md flex-col items-center text-center text-primary-foreground md:hidden">
          <div className="mb-10 flex items-center gap-2 self-center pt-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 backdrop-blur">
              <Folder className="h-5 w-5" />
            </div>
            <div className="text-lg font-semibold">Family Vault</div>
          </div>
        </div>

        <Card className="w-full max-w-md p-6 shadow-card">
          <div className="mb-6 text-center md:text-left">
            <h2 className="text-2xl font-semibold">Welcome</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with the Google account or email the admin added for you.
            </p>
          </div>

          <Button variant="outline" className="w-full gap-2" onClick={google} disabled={busy}>
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
            </svg>
            {busy ? "Signing in…" : "Continue with Google"}
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          {sent ? (
            <p className="rounded-lg bg-muted p-3 text-sm">Check {email} for a sign-in link.</p>
          ) : (
            <form onSubmit={magicLink} className="flex gap-2">
              <Input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" disabled={busy || !email} className="shrink-0 gap-1.5">
                <Mail className="h-4 w-4" /> Email link
              </Button>
            </form>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Only emails on the family list can sign in. The very first person to sign in becomes the admin. If you're not on the list, ask the admin to add your email.
          </p>
        </Card>
      </div>
    </div>
  );
}
