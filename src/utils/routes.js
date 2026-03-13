import { GPX_ROUTE_COLORS } from "../constants";
import { uid } from "./geo";

export function getDefaultRouteColor(index) {
  return GPX_ROUTE_COLORS[index % GPX_ROUTE_COLORS.length];
}

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeGeoJsonStats(features) {
  let distKm = 0;
  let elevGain = 0;
  for (const feature of features) {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    for (let i = 1; i < coords.length; i++) {
      distKm += haversineKm(coords[i - 1], coords[i]);
      const dEle = (coords[i][2] ?? NaN) - (coords[i - 1][2] ?? NaN);
      if (Number.isFinite(dEle) && dEle > 0) elevGain += dEle;
    }
  }
  return {
    distanceKm: distKm.toFixed(2),
    elevationGainM: Math.round(elevGain).toString(),
  };
}

export function buildImportedRoutesGeoJson(importedRoutes, visibleFolders, focusedRouteId = null, isEditorMode = false) {
  return {
    type: "FeatureCollection",
    features: (Array.isArray(importedRoutes) ? importedRoutes : [])
      .filter((route) => route?.folder && visibleFolders.includes(route.folder))
      .flatMap((route) => {
        const opacity = focusedRouteId
          ? (route.id === focusedRouteId ? 1.0 : 0.15)
          : isEditorMode ? 0.2 : null;
        return (Array.isArray(route?.geoJson?.features) ? route.geoJson.features : []).map((feature) => ({
          ...feature,
          properties: {
            ...(feature.properties || {}),
            routeId: route.id,
            routeName: route.name,
            folder: route.folder,
            color: route.color || GPX_ROUTE_COLORS[0],
            ...(opacity !== null ? { opacity } : {}),
          },
        }));
      }),
  };
}

export function normalizeImportedRoute(route, index) {
  if (!route || typeof route !== "object") return null;

  const folder =
    typeof route.folder === "string" && route.folder.trim() ? route.folder.trim() : "Imported";

  const features = Array.isArray(route.geoJson?.features)
    ? route.geoJson.features.filter((f) => f?.geometry?.type === "LineString")
    : [];

  if (!features.length) return null;

  const stats = route.distanceKm != null
    ? { distanceKm: route.distanceKm, elevationGainM: route.elevationGainM ?? "0" }
    : computeGeoJsonStats(features);

  return {
    ...route,
    id: route.id || uid(),
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : `Imported route ${index + 1}`,
    folder,
    color: route.color || getDefaultRouteColor(index),
    geoJson: { type: "FeatureCollection", features },
    ...stats,
  };
}

export function normalizeSavedRoute(route, index) {
  if (!route || typeof route !== "object") return null;

  const features = Array.isArray(route.routeGeoJson?.features) ? route.routeGeoJson.features : [];
  const waypoints = Array.isArray(route.waypoints)
    ? route.waypoints.filter(
        (p) =>
          Array.isArray(p) &&
          p.length >= 2 &&
          Number.isFinite(Number(p[0])) &&
          Number.isFinite(Number(p[1]))
      )
    : [];

  return {
    id: route.id || `saved_${index}_${uid()}`,
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : `Saved route ${index + 1}`,
    createdAt: route.createdAt || new Date().toISOString(),
    routingMode: typeof route.routingMode === "string" ? route.routingMode : undefined,
    gravelMode: !!route.gravelMode,
    waypoints,
    routeGeoJson: features.length > 0 ? { type: "FeatureCollection", features } : null,
    distanceKm: route.distanceKm ?? "0.00",
    elevationGainM: route.elevationGainM ?? "0",
  };
}
