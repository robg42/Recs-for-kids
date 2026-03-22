'use client';

import { useState, useCallback, useRef } from 'react';

interface LocationState {
  lat: number | null;
  lon: number | null;
  error: string | null;
  loading: boolean;
  /** true when the user has entered a postcode instead of using GPS */
  isManual: boolean;
  /** display label — postcode string when manual, null when GPS */
  label: string | null;
}

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lon: null,
    error: null,
    loading: false,
    isManual: false,
    label: null,
  });

  // Stores manual override between renders without triggering re-renders
  const manualRef = useRef<{ lat: number; lon: number; label: string } | null>(null);

  /**
   * Set a manual location from a postcode lookup.
   * This will be used instead of GPS until clearManualLocation() is called.
   */
  const setManualLocation = useCallback(
    (lat: number, lon: number, label: string) => {
      manualRef.current = { lat, lon, label };
      setState((s) => ({ ...s, lat, lon, isManual: true, label, error: null }));
      // Persist to cookie so the server can use it for prefetch
      document.cookie = `lc=${lat.toFixed(5)},${lon.toFixed(5)}; max-age=86400; path=/; SameSite=Lax`;
    },
    []
  );

  /** Revert to GPS-based location */
  const clearManualLocation = useCallback(() => {
    manualRef.current = null;
    setState((s) => ({ ...s, isManual: false, label: null }));
  }, []);

  const requestLocation = useCallback((): Promise<{ lat: number; lon: number }> => {
    // If a manual override is set, return it immediately — no GPS needed
    if (manualRef.current) {
      const { lat, lon } = manualRef.current;
      return Promise.resolve({ lat, lon });
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = 'Geolocation is not supported by your browser';
        setState((s) => ({ ...s, error: err }));
        reject(new Error(err));
        return;
      }

      setState((s) => ({ ...s, loading: true, error: null }));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          setState((s) => ({ ...s, lat, lon, error: null, loading: false }));
          // Store last known coords in a cookie so the server can prefetch on next login
          document.cookie = `lc=${lat.toFixed(5)},${lon.toFixed(5)}; max-age=86400; path=/; SameSite=Lax`;
          resolve({ lat, lon });
        },
        (err) => {
          const msg =
            err.code === err.PERMISSION_DENIED
              ? 'Location access denied — please enable it to find nearby venues'
              : 'Could not get your location';
          setState((s) => ({ ...s, lat: null, lon: null, error: msg, loading: false }));
          reject(new Error(msg));
        },
        { timeout: 10000, maximumAge: 300000 } // 5 min cache
      );
    });
  }, []);

  return { ...state, requestLocation, setManualLocation, clearManualLocation };
}
