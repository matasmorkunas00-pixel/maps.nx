import { GPX_ROUTE_COLORS } from "../constants";
import { uid } from "./geo";

export function getDefaultRouteColor(index) {
  return GPX_ROUTE_COLORS[index % GPX_ROUTE_COLORS.length];
}

export function buildImportedRoutesGeoJson(importedRoutes, visibleFolders) {
  return {
    type: "FeatureCollection",
    features: (Array.isArray(importedRoutes) ? importedRoutes : [])
      .filter((route) => route?.folder && visibleFolders.includes(route.folder))
      .flatMap((route) =>
        (Array.isArray(route?.geoJson?.features) ? route.geoJson.features : []).map((feature) => ({
          ...feature,
          properties: {
            ...(feature.properties || {}),
            routeId: route.id,
            routeName: route.name,
            folder: route.folder,
            color: route.color || GPX_ROUTE_COLORS[0],
          },
        }))
      ),
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

  return {
    ...route,
    id: route.id || uid(),
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : `Imported route ${index + 1}`,
    folder,
    color: route.color || getDefaultRouteColor(index),
    geoJson: { type: "FeatureCollection", features },
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
