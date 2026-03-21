'use client';

import { useState, useCallback } from 'react';

interface LocationState {
  lat: number | null;
  lon: number | null;
  error: string | null;
  loading: boolean;
}

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lon: null,
    error: null,
    loading: false,
  });

  const requestLocation = useCallback((): Promise<{ lat: number; lon: number }> => {
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
          setState({ lat, lon, error: null, loading: false });
          // Store last known coords in a cookie so the server can prefetch on next login
          document.cookie = `lc=${lat.toFixed(5)},${lon.toFixed(5)}; max-age=86400; path=/; SameSite=Lax`;
          resolve({ lat, lon });
        },
        (err) => {
          const msg =
            err.code === err.PERMISSION_DENIED
              ? 'Location access denied — please enable it to find nearby venues'
              : 'Could not get your location';
          setState({ lat: null, lon: null, error: msg, loading: false });
          reject(new Error(msg));
        },
        { timeout: 10000, maximumAge: 300000 } // 5 min cache
      );
    });
  }, []);

  return { ...state, requestLocation };
}
