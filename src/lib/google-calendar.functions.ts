import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getGoogleCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("google_oauth_tokens")
      .select("google_email, calendar_id, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      connected: !!data,
      googleEmail: data?.google_email ?? null,
      lastUpdated: data?.updated_at ?? null,
    };
  });

export const startGoogleCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { signState, buildAuthUrl } = await import("./google-calendar.server");
    const state = signState(context.userId, data.origin);
    return { url: buildAuthUrl(data.origin, state) };
  });

export const disconnectGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("google_oauth_tokens").delete().eq("user_id", userId);
    await supabase.from("synced_calendar_events").delete().eq("user_id", userId);
    return { ok: true };
  });

export const syncGoogleCalendarNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { runSyncForUser } = await import("./google-calendar-sync.server");
    return runSyncForUser(supabase as any, userId);
  });
