import { useState, useEffect, useCallback } from "react";
import {
  getStravaAuthUrl, getStoredAuth, storeAuth, clearAuth,
  exchangeCode, getValidToken, fetchAllActivities, activitiesToGeoJson,
} from "../utils/strava";

const ACTIVITIES_CACHE_KEY = "strava_activities_cache";

export function useStrava() {
  const [auth, setAuth] = useState(() => getStoredAuth());
  const [activitiesGeoJson, setActivitiesGeoJson] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Handle OAuth callback — Strava redirects back with ?code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const scope = params.get("scope");
    if (!code) return;

    window.history.replaceState({}, "", window.location.pathname);

    if (!scope?.includes("activity:read")) {
      setError("Strava access was denied or wrong permissions.");
      return;
    }

    setIsLoading(true);
    exchangeCode(code)
      .then((tokenData) => { storeAuth(tokenData); setAuth(tokenData); })
      .catch((err) => setError("Failed to connect Strava: " + err.message))
      .finally(() => setIsLoading(false));
  }, []);

  // Load cached activities when auth is available
  useEffect(() => {
    if (!auth) return;
    try {
      const cached = localStorage.getItem(ACTIVITIES_CACHE_KEY);
      if (cached) setActivitiesGeoJson(JSON.parse(cached));
    } catch {}
  }, [auth]);

  const loadActivities = useCallback(async () => {
    if (!auth) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getValidToken(auth, (newAuth) => setAuth(newAuth));
      const activities = await fetchAllActivities(token);
      const geojson = activitiesToGeoJson(activities);
      localStorage.setItem(ACTIVITIES_CACHE_KEY, JSON.stringify(geojson));
      setActivitiesGeoJson(geojson);
    } catch (err) {
      setError("Failed to load activities: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  const disconnect = useCallback(() => {
    clearAuth();
    localStorage.removeItem(ACTIVITIES_CACHE_KEY);
    setAuth(null);
    setActivitiesGeoJson(null);
  }, []);

  const connect = useCallback(() => {
    window.location.href = getStravaAuthUrl();
  }, []);

  const athleteName = auth?.athlete
    ? `${auth.athlete.firstname ?? ""} ${auth.athlete.lastname ?? ""}`.trim()
    : null;

  return {
    isConnected: !!auth,
    athleteName,
    activitiesGeoJson,
    isLoading,
    error,
    connect,
    disconnect,
    loadActivities,
  };
}
