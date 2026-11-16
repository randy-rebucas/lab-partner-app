'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { manilaClock } from '@/lib/time';

/**
 * Live lists (BUILD_PROMPT "Live lists"): refresh every 30 s while the tab is visible, and at once
 * when it becomes visible again. A failed refresh leaves the last good list on screen.
 */
export function LiveRefresh({ renderedAt, every = 30_000 }: { renderedAt: string; every?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lastAt, setLastAt] = useState(renderedAt);
  const [seen, setSeen] = useState(renderedAt);
  if (renderedAt !== seen) {
    setSeen(renderedAt);
    setLastAt(renderedAt);
  }

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') start(() => router.refresh());
    };
    const timer = window.setInterval(refresh, every);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router, every]);

  return (
    <p className="text-xs text-gray-500" aria-live="polite">
      {pending ? 'Updating…' : <>Updated <span className="font-mono tabular-nums">{manilaClock(lastAt)}</span></>}
    </p>
  );
}
