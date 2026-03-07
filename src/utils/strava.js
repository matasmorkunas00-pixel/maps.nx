const CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_STRAVA_CLIENT_SECRET;
const AUTH_STORAGE_KEY = "strava_auth";

export function getStravaAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin,
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

export function activitiesToGeoJson(activities) {
  const features = activities
    .filter((a) => a.map?.summary_polyline)
    .map((a) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: decodePolyline(a.map.summary_polyline) },
      properties: {
        id: a.id,
        name: a.name,
        type: a.type,
        distance: a.distance,
        moving_time: a.moving_time,
      },
    }));
  return { type: "FeatureCollection", features };
}
