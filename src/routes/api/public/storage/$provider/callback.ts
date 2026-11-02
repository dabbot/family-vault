import { createFileRoute } from "@tanstack/react-router";

/** Dropbox or Google sends the admin back here after they approve access. */
export const Route = createFileRoute("/api/public/storage/$provider/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { appUrl, isAdmin, providerById, redirectUri, saveConnection, verifyState } = await import(
          "@/lib/storage/connection.server"
        );
        const base = appUrl(request);
        const back = (status: string, reason?: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: `${base}/setup?storage=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}` },
          });

        const url = new URL(request.url);
        if (url.searchParams.get("error")) return back("error", url.searchParams.get("error_description") ?? url.searchParams.get("error")!);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return back("error", "The sign-in did not finish. Try again.");

        let provider;
        try {
          provider = providerById(params.provider);
        } catch {
          return back("error", "Unknown storage provider.");
        }
        const verified = verifyState(state, provider.id);
        if (!verified) return back("error", "The sign-in link expired. Try again.");
        if (!(await isAdmin(verified.userId))) return back("error", "Only an admin can link storage.");

        try {
          const tokens = await provider.exchangeCode(code, redirectUri(provider.id, base));
          await saveConnection(provider, tokens, verified.userId);
        } catch (e) {
          console.error("[storage callback]", e);
          return back("error", e instanceof Error ? e.message : "Could not link storage.");
        }
        // First import runs in the background of the next page load (Sync now / scheduled sync).
        return back("connected");
      },
    },
  },
});
