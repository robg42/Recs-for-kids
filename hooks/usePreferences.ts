'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  loadPreferences,
  saveChildren,
  acceptActivity,
  rejectActivity,
  clearHistory,
} from '@/lib/storage';
import type {
  UserPreferences,
  ChildProfile,
  Activity,
  RejectionReason,
} from '@/types';

export function usePreferences() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  /**
   * `initialized` becomes true after the first localStorage read completes
   * (synchronously inside the first useEffect).  Use this to gate any UI that
   * depends on whether the user has children — without it, the first render
   * always sees `hasChildren = false` and flashes the old setup form.
   */
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(() => {
    setPrefs(loadPreferences());
  }, []);

  useEffect(() => {
    // Load local prefs immediately so the UI isn't blocked
    const local = loadPreferences();
    setPrefs(local);
    setInitialized(true); // synchronous — happens before any await in this effect

    // Sync children from server — server is the source of truth across devices
    fetch('/api/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { children?: ChildProfile[] } | null) => {
        if (!data) return;

        if (data.children && data.children.length > 0) {
          // Server has children → use them (overwrite local)
          saveChildren(data.children);
          setPrefs(loadPreferences());
        } else if (local.children.length > 0) {
          // Server is empty but local has children (e.g. first login after
          // this feature was deployed) → upload local children to server
          fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ children: local.children }),
          }).catch(() => {});
        }
      })
      .catch(() => {
        // Server unavailable — keep local data as-is
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateChildren = useCallback(
    (children: ChildProfile[]) => {
      // Save locally first so the UI updates immediately
      saveChildren(children);
      refresh();

      // Persist to server in the background
      fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ children }),
      }).catch(() => {});
    },
    [refresh]
  );

  const accept = useCallback(
    (activity: Activity) => {
      acceptActivity(activity);
      refresh();
    },
    [refresh]
  );

  const reject = useCallback(
    (activity: Activity, reason: RejectionReason) => {
      rejectActivity(activity, reason);
      refresh();
    },
    [refresh]
  );

  const wipeHistory = useCallback(() => {
    clearHistory();
    refresh();
  }, [refresh]);

  return {
    prefs,
    initialized,
    updateChildren,
    accept,
    reject,
    wipeHistory,
    hasChildren: (prefs?.children?.length ?? 0) > 0,
  };
}
