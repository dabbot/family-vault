import { createFileRoute } from "@tanstack/react-router";
import { isAuthorisedCron } from "@/lib/cron-auth.server";

/** Scheduled import from the linked Dropbox or Google Drive. Call with the x-cron-secret header. */
export const Route = createFileRoute("/api/public/hooks/storage-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorisedCron(request)) return new Response("Unauthorized", { status: 401 });
        const { connectionStatus } = await import("@/lib/storage/connection.server");
        if (!(await connectionStatus())) return Response.json({ skipped: "no storage linked" });
        const { syncStorage } = await import("@/lib/storage/sync.server");
        try {
          const r = await syncStorage();
          return Response.json({ imported: r.imported, skipped: r.skipped, errors: r.errors.length });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
        }
      },
    },
  },
});
