import { useEffect, useRef, useState } from "react";

const EDGE_PX = 24;
const SWIPE_OPEN_PX = 60;
const PULL_TRIGGER_PX = 70;
const PULL_MAX_PX = 120;

/**
 * Mobile gesture hook:
 *  - Edge-swipe right opens the drawer
 *  - Pull-down at top of scroll triggers a page reload (PWA pull-to-refresh)
 */
export function useMobileGestures({
  onOpenDrawer,
  enabled = true,
}: {
  onOpenDrawer: () => void;
  enabled?: boolean;
}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const onOpenDrawerRef = useRef(onOpenDrawer);

  useEffect(() => {
    onOpenDrawerRef.current = onOpenDrawer;
  }, [onOpenDrawer]);

  useEffect(() => {
    if (!enabled) return;

    let edgeStartX: number | null = null;
    let edgeStartY: number | null = null;
    let pullStartY: number | null = null;
    let pulling = false;
    let opened = false;

    const getScrollTop = () =>
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const setPull = (px: number) => {
      pullDistanceRef.current = px;
      setPullDistance(px);
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;

      if (t.clientX <= EDGE_PX) {
        edgeStartX = t.clientX;
        edgeStartY = t.clientY;
        opened = false;
      }

      if (getScrollTop() <= 0) {
        pullStartY = t.clientY;
        pulling = false;
      } else {
        pullStartY = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;

      // Edge-swipe to open drawer
      if (edgeStartX !== null && edgeStartY !== null && !opened) {
        const dx = t.clientX - edgeStartX;
        const dy = Math.abs(t.clientY - edgeStartY);
        if (dx > SWIPE_OPEN_PX && dy < dx) {
          opened = true;
          edgeStartX = null;
          onOpenDrawerRef.current();
        }
      }

      // Pull-to-refresh
      if (pullStartY !== null && getScrollTop() <= 0) {
        const dy = t.clientY - pullStartY;
        if (dy > 6) {
          pulling = true;
          const damped = Math.min(PULL_MAX_PX, dy * 0.5);
          setPull(damped);
          if (e.cancelable) e.preventDefault();
        }
      }
    };

    const onTouchEnd = () => {
      edgeStartX = null;
      edgeStartY = null;
      if (pulling && pullDistanceRef.current >= PULL_TRIGGER_PX) {
        setRefreshing(true);
        setPull(PULL_TRIGGER_PX);
        setTimeout(() => window.location.reload(), 250);
      } else {
        setPull(0);
      }
      pullStartY = null;
      pulling = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled]);

  return { pullDistance, refreshing };
}
