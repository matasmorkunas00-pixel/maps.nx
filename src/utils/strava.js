const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET;
const REDIRECT_URI = import.meta.env.VITE_STRAVA_REDIRECT_URI || window.location.origin;
const AUTH_STORAGE_KEY = "strava_auth";

export function getStravaAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "activity:read_all",
    approval_prompt: "auto",
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

export function getStoredAuth() {
  try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY)); } catch { return null; }
}

export function storeAuth(auth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function exchangeCode(code) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error("Token exchange failed");
  return res.json();
}

async function doRefresh(refresh_token) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json();
}

export async function getValidToken(auth, onRefreshed) {
  if (!auth) return null;
  if (Date.now() / 1000 < auth.expires_at - 60) return auth.access_token;
  const refreshed = await doRefresh(auth.refresh_token);
  const newAuth = { ...auth, ...refreshed };
  storeAuth(newAuth);
  onRefreshed?.(newAuth);
  return newAuth.access_token;
}

function decodePolyline(encoded) {
  if (!encoded) return [];
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

export async function fetchAllActivities(accessToken) {
  const activities = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error("Failed to fetch activities");
    const batch = await res.json();
    if (!batch.length) break;
    activities.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return activities;
}

function getActivityType(activity) {
  return activity?.sport_type || activity?.type || "Other";
}

function getActivityYear(activity) {
  const rawDate = activity?.start_date_local || activity?.start_date;
  if (!rawDate) return null;

  const year = new Date(rawDate).getFullYear();
  return Number.isFinite(year) ? year : null;
}

export function activityToProperties(activity, extras = {}) {
  return {
    id: activity.id,
    name: activity.name,
    type: getActivityType(activity),
    activityType: getActivityType(activity),
    legacyType: activity.type,
    sportType: activity.sport_type || null,
    year: getActivityYear(activity),
    startDate: activity.start_date || null,
    startDateLocal: activity.start_date_local || null,
    distance: activity.distance,
    moving_time: activity.moving_time,
    elapsedTime: activity.elapsed_time ?? null,
    totalElevationGain: activity.total_elevation_gain ?? null,
    averageSpeed: activity.average_speed ?? null,
    maxSpeed: activity.max_speed ?? null,
    averageHeartrate: activity.average_heartrate ?? null,
    maxHeartrate: activity.max_heartrate ?? null,
    calories: activity.calories ?? null,
    kudosCount: activity.kudos_count ?? null,
    achievementCount: activity.achievement_count ?? null,
    averageWatts: activity.average_watts ?? null,
    kilojoules: activity.kilojoules ?? null,
    trainer: !!activity.trainer,
    commute: !!activity.commute,
    private: !!activity.private,
    description: activity.description || "",
    totalPhotoCount: activity.total_photo_count ?? activity.photos?.count ?? 0,
    primaryPhotoUrls: activity.photos?.primary?.urls || null,
    heartrateStream: null,
    ...extras,
  };
}

export function activitiesToGeoJson(activities) {
  const features = activities
    .filter((a) => a.map?.summary_polyline)
    .map((a) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: decodePolyline(a.map.summary_polyline) },
      properties: activityToProperties(a),
    }));
  return { type: "FeatureCollection", features };
}

export async function fetchActivityDetails(accessToken, activityId) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch activity details");
  return res.json();
}

export async function fetchActivityStreams(accessToken, activityId, keys = ["heartrate"]) {
  const params = new URLSearchParams({
    keys: keys.join(","),
    key_by_type: "true",
  });

  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/streams?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch activity streams");
  return res.json();
}

export function getHeartrateStream(streamsPayload) {
  const values = streamsPayload?.heartrate?.data;
  if (!Array.isArray(values)) return null;

  const heartrateValues = values.filter((value) => Number.isFinite(value)).map((value) => Number(value));
  return heartrateValues.length ? heartrateValues : null;
}
