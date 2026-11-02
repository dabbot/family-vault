import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        const origin = `${url.protocol}//${url.host}`;

        if (error) {
          return redirectTo(`${origin}/home?google_calendar=error&reason=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
          return redirectTo(`${origin}/home?google_calendar=error&reason=missing_params`);
        }

        const { verifyState, exchangeCodeForTokens, fetchGoogleEmail } = await import(
          "@/lib/google-calendar.server"
        );
        const verified = verifyState(state);
        if (!verified) {
          return redirectTo(`${origin}/home?google_calendar=error&reason=invalid_state`);
        }

        try {
          const tokens = await exchangeCodeForTokens(code, verified.origin);
          if (!tokens.refresh_token) {
            return redirectTo(
              `${origin}/home?google_calendar=error&reason=no_refresh_token`,
            );
          }
          const email = await fetchGoogleEmail(tokens.access_token);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          await supabaseAdmin
            .from("google_oauth_tokens")
            .upsert(
              {
                user_id: verified.userId,
                google_email: email,
                refresh_token: tokens.refresh_token,
                access_token: tokens.access_token,
                expires_at: expiresAt,
                scope: tokens.scope,
                calendar_id: "primary",
              },
              { onConflict: "user_id" },
            );

          // Kick off an initial sync (best-effort)
          try {
            const { runSyncForUser } = await import("@/lib/google-calendar-sync.server");
            await runSyncForUser(supabaseAdmin, verified.userId);
          } catch (e) {
            console.error("Initial sync failed:", e);
          }

          return redirectTo(`${verified.origin}/home?google_calendar=connected`);
        } catch (e) {
          console.error("OAuth callback error:", e);
          return redirectTo(`${origin}/home?google_calendar=error&reason=exchange_failed`);
        }
      },
    },
  },
});

function redirectTo(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}
