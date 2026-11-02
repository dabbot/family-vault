import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck2, CalendarPlus, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getGoogleCalendarStatus,
  startGoogleCalendarConnect,
  disconnectGoogleCalendar,
  syncGoogleCalendarNow,
} from "@/lib/google-calendar.functions";

export function GoogleCalendarConnect() {
  const fetchStatus = useServerFn(getGoogleCalendarStatus);
  const startConnect = useServerFn(startGoogleCalendarConnect);
  const disconnect = useServerFn(disconnectGoogleCalendar);
  const syncNow = useServerFn(syncGoogleCalendarNow);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "sync" | "disconnect">(null);
  const [status, setStatus] = useState<{ connected: boolean; googleEmail: string | null }>({
    connected: false,
    googleEmail: null,
  });

  const refresh = async () => {
    try {
      const s = await fetchStatus({});
      setStatus(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Handle redirect from OAuth
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("google_calendar");
    if (flag === "connected") {
      toast.success("Google Calendar connected — your dues are syncing.");
      params.delete("google_calendar");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? "?" + params : ""}`);
    } else if (flag === "error") {
      toast.error(`Google Calendar connect failed: ${params.get("reason") ?? "unknown"}`);
      params.delete("google_calendar");
      params.delete("reason");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? "?" + params : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setBusy("connect");
    try {
      const { url } = await startConnect({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const handleSync = async () => {
    setBusy("sync");
    try {
      const r = await syncNow({});
      toast.success(`Synced ${r.total} events (${r.created} new, ${r.updated} updated, ${r.deleted} removed)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Calendar? Existing synced events will be removed from this app's tracking (events already on your calendar stay).")) return;
    setBusy("disconnect");
    try {
      await disconnect({});
      toast.success("Google Calendar disconnected");
      setStatus({ connected: false, googleEmail: null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Loading calendar sync…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          {status.connected ? <CalendarCheck2 className="h-5 w-5" /> : <CalendarPlus className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Google Calendar Sync</div>
          {status.connected ? (
            <div className="mt-0.5 text-sm text-muted-foreground">
              Connected as <span className="font-medium text-foreground">{status.googleEmail ?? "your Google account"}</span>. Document expiries, premium dues, and policy maturity dates push to your calendar with 7-day and 1-day reminders.
            </div>
          ) : (
            <div className="mt-0.5 text-sm text-muted-foreground">
              Push upcoming document expiries, insurance premium dues, and policy maturity dates to your Google Calendar — visible on phone & laptop with reminders.
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {status.connected ? (
          <>
            <Button size="sm" onClick={handleSync} disabled={busy !== null} className="gap-2">
              {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </Button>
            <Button size="sm" variant="outline" onClick={handleDisconnect} disabled={busy !== null} className="gap-2">
              <Unlink className="h-4 w-4" />
              Disconnect
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={handleConnect} disabled={busy !== null} className="gap-2">
            {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            Connect Google Calendar
          </Button>
        )}
      </div>
    </div>
  );
}
