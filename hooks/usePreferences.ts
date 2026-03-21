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

  useEffect(() => {
    setPrefs(loadPreferences());
  }, []);

  const refresh = useCallback(() => {
    setPrefs(loadPreferences());
  }, []);

  const updateChildren = useCallback((children: ChildProfile[]) => {
    saveChildren(children);
    refresh();
  }, [refresh]);

  const accept = useCallback((activity: Activity) => {
    acceptActivity(activity);
    refresh();
  }, [refresh]);

  const reject = useCallback((activity: Activity, reason: RejectionReason) => {
    rejectActivity(activity, reason);
    refresh();
  }, [refresh]);

  const wipeHistory = useCallback(() => {
    clearHistory();
    refresh();
  }, [refresh]);

  return {
    prefs,
    updateChildren,
    accept,
    reject,
    wipeHistory,
    hasChildren: (prefs?.children?.length ?? 0) > 0,
  };
}
