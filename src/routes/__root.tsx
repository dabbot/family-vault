import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";

const splashStyles = `
  :root { --sk-bg: #f8fafc; --sk-card: #ffffff; --sk-line: #eef2f7; --sk-shimmer: #e6edf5; --sk-border: #e5e7eb; --sk-brand: #2563eb; --sk-sidebar: #f5f7fb; }
  @media (prefers-color-scheme: dark) {
    :root { --sk-bg: #0b1220; --sk-card: #111827; --sk-line: #1f2937; --sk-shimmer: #253145; --sk-border: #1f2937; --sk-sidebar: #0f1626; }
  }
  #app-splash { position: fixed; inset: 0; z-index: 9999; background: var(--sk-bg); color: transparent;
    transition: opacity 220ms ease-out; -webkit-font-smoothing: antialiased;
    font: 500 14px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  #app-splash.hide { opacity: 0; pointer-events: none; }
  #app-splash .sk-shell { display: grid; grid-template-columns: 240px 1fr; height: 100%; }
  @media (max-width: 767px) { #app-splash .sk-shell { grid-template-columns: 1fr; } #app-splash .sk-side { display: none; } }
  #app-splash .sk-side { border-right: 1px solid var(--sk-border); background: var(--sk-sidebar); padding: 16px 12px; display: flex; flex-direction: column; gap: 8px; }
  #app-splash .sk-brand { display: flex; align-items: center; gap: 10px; padding: 6px 8px 14px; }
  #app-splash .sk-logo { width: 32px; height: 32px; border-radius: 9px; background: var(--sk-brand); display: grid; place-items: center; color: #fff; box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
  #app-splash .sk-brand-text { font-weight: 600; letter-spacing: -0.01em; color: #111827; }
  @media (prefers-color-scheme: dark) { #app-splash .sk-brand-text { color: #e5e7eb; } }
  #app-splash .sk-navrow { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; }
  #app-splash .sk-navdot { width: 16px; height: 16px; border-radius: 4px; }
  #app-splash .sk-navline { height: 10px; flex: 1; border-radius: 4px; }
  #app-splash .sk-main { display: flex; flex-direction: column; min-width: 0; }
  #app-splash .sk-top { height: 64px; border-bottom: 1px solid var(--sk-border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
  #app-splash .sk-search { height: 34px; width: 220px; border-radius: 8px; }
  #app-splash .sk-btn { height: 34px; width: 96px; border-radius: 8px; background: var(--sk-brand); opacity: 0.85; }
  #app-splash .sk-body { padding: 24px; display: flex; flex-direction: column; gap: 18px; overflow: hidden; }
  #app-splash .sk-h1 { height: 22px; width: 220px; border-radius: 6px; }
  #app-splash .sk-h2 { height: 12px; width: 160px; border-radius: 4px; }
  #app-splash .sk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  #app-splash .sk-card { background: var(--sk-card); border: 1px solid var(--sk-border); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; height: 130px; }
  #app-splash .sk-thumb { height: 60px; border-radius: 8px; }
  #app-splash .sk-line { border-radius: 4px; }
  #app-splash .sk-shim { background: linear-gradient(90deg, var(--sk-line) 0%, var(--sk-shimmer) 40%, var(--sk-line) 80%); background-size: 200% 100%; animation: sk-shimmer 1.25s ease-in-out infinite; }
  @keyframes sk-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Family Vault" },
      { name: "description", content: "Securely store and manage your family's important documents in one place." },
      { property: "og:title", content: "Family Vault" },
      { name: "twitter:title", content: "Family Vault" },
      { property: "og:description", content: "Securely store and manage your family's important documents in one place." },
      { name: "twitter:description", content: "Securely store and manage your family's important documents in one place." },
      { name: "twitter:card", content: "summary" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#2563eb" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Family Vault" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

// Splash is created and removed entirely outside React's tree. This script
// runs once during the initial HTML parse and never again — so client-side
// navigations between routes don't re-trigger it. React never owns the
// element, so there's no hydration mismatch and no re-injection on nav.
const splashScript = `
  (function () {
    function log(type, detail) {
      var evt = { t: Date.now(), type: type, detail: detail };
      window.__splashEvents = window.__splashEvents || [];
      window.__splashEvents.push(evt);
      (window.__splashEventListeners || []).forEach(function (l) { try { l(evt); } catch (e) {} });
      try { console.log('[splash]', type, detail || ''); } catch (e) {}
    }

    if (window.__appSplashRan) { log('script-skip', 'already ran'); return; }
    window.__appSplashRan = true;
    log('script-init');

    var MIN_MS = 0;
    var start = Date.now();


    function inject() {
      if (document.getElementById('app-splash')) { log('mount-skip', 'already in DOM'); return; }
      var el = document.createElement('div');
      el.id = 'app-splash';
      el.setAttribute('aria-hidden', 'true');
      var navRows = '';
      for (var i = 0; i < 9; i++) {
        var w = [55, 70, 45, 60, 80, 50, 65, 40, 70][i];
        navRows += '<div class="sk-navrow"><div class="sk-navdot sk-shim"></div><div class="sk-navline sk-shim" style="max-width:' + w + '%"></div></div>';
      }
      var cards = '';
      for (var j = 0; j < 8; j++) {
        cards += '<div class="sk-card">' +
          '<div class="sk-thumb sk-shim"></div>' +
          '<div class="sk-line sk-shim" style="height:11px;width:80%"></div>' +
          '<div class="sk-line sk-shim" style="height:9px;width:55%"></div>' +
        '</div>';
      }
      el.innerHTML =
        '<div class="sk-shell">' +
          '<aside class="sk-side">' +
            '<div class="sk-brand">' +
              '<div class="sk-logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg></div>' +
              '<div class="sk-brand-text">Family Vault</div>' +
            '</div>' +
            navRows +
          '</aside>' +
          '<div class="sk-main">' +
            '<div class="sk-top"><div class="sk-search sk-shim"></div><div class="sk-btn"></div></div>' +
            '<div class="sk-body">' +
              '<div class="sk-h1 sk-shim"></div>' +
              '<div class="sk-h2 sk-shim"></div>' +
              '<div class="sk-grid">' + cards + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(el);
      log('mount');
    }


    var hidden = false;
    function hide(reason) {
      if (hidden) { log('unmount-skip', reason + ' (already hidden)'); return; }
      hidden = true;
      var wait = Math.max(0, MIN_MS - (Date.now() - start));
      log('hide-scheduled', reason + ' wait=' + wait + 'ms');
      setTimeout(function () {
        var el = document.getElementById('app-splash');
        if (!el) { log('unmount-skip', 'not in DOM'); return; }
        el.classList.add('hide');
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
          log('unmount', reason);
        }, 350);
      }, wait);
    }
    window.__hideAppSplash = function () { hide('react-mount'); };

    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);

    if (document.readyState === 'complete') hide('already-complete');
    else window.addEventListener('load', function () { hide('window-load'); });

    setTimeout(function () { hide('safety-timeout'); }, 10000);
  })();
`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style dangerouslySetInnerHTML={{ __html: splashStyles }} />
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const w = window as unknown as {
      __hideAppSplash?: () => void;
      __appSplashRan?: boolean;
      __splashNavGuard?: boolean;
      __splashEvents?: Array<{ t: number; type: string; detail?: string }>;
      __splashEventListeners?: Array<(e: { t: number; type: string; detail?: string }) => void>;
    };

    // Hide splash on first React mount.
    w.__hideAppSplash?.();

    // Install the navigation guard exactly once. It survives component
    // remounts (StrictMode double-invoke, layout swaps, HMR) because the
    // flag lives on `window`, not React state.
    if (w.__splashNavGuard) return;
    w.__splashNavGuard = true;

    const logEvent = (type: string, detail?: string) => {
      const evt = { t: Date.now(), type, detail };
      w.__splashEvents = w.__splashEvents ?? [];
      w.__splashEvents.push(evt);
      (w.__splashEventListeners ?? []).forEach((l) => {
        try { l(evt); } catch { /* noop */ }
      });
      try { console.log("[splash]", type, detail ?? ""); } catch { /* noop */ }
    };

    logEvent("nav-guard-installed");

    // Belt: forcibly strip any #app-splash that appears after first paint.
    // (Nothing should re-create it, but if anything does, kill it fast.)
    const stripSplash = (reason: string) => {
      const el = document.getElementById("app-splash");
      if (el) {
        el.parentNode?.removeChild(el);
        logEvent("nav-guard-strip", reason);
      }
      // Neutralize the script-level flag + hide fn so nothing can re-run it.
      w.__appSplashRan = true;
      w.__hideAppSplash = () => { /* no-op after first navigation */ };
    };

    // Braces: watch the DOM for any #app-splash insertion.
    const observer = new MutationObserver(() => {
      if (document.getElementById("app-splash")) stripSplash("mutation");
    });
    observer.observe(document.body, { childList: true, subtree: false });

    // Router subscription: on every navigation resolution, verify no splash.
    const unsub = router.subscribe("onResolved", (e) => {
      logEvent("nav", `${e.fromLocation?.pathname ?? "∅"} → ${e.toLocation.pathname}`);
      stripSplash("nav");
    });

    return () => {
      observer.disconnect();
      unsub();
    };
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
