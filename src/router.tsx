import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Data stays "fresh" for 5 min → navigating away and back does NOT
        // trigger a refetch. Query still returns cached data instantly.
        staleTime: 5 * 60 * 1000,
        // Keep evicted queries in memory for 30 min so back-nav is instant.
        gcTime: 30 * 60 * 1000,
        // Don't hammer the API on tab focus / component remount.
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: "always",
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    defaultPreloadStaleTime: 0,
    defaultPendingMinMs: 0,
  });

  return router;
};
