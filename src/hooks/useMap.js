import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MAP_STYLES, GPX_ROUTE_COLORS, ROUTING_MODES } from "../constants";
import { nearestPointOnLine, getWaypointInsertIndex, getFilteredElevations, arePointsClose } from "../utils/geo";
import { loadAppleMapKit } from "../utils/appleMapKit";

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY;
const APPLE_MAPKIT_TOKEN = import.meta.env.VITE_APPLE_MAPKIT_JS_TOKEN;
const DEFAULT_CENTER = [25.2797, 54.6872];
const TRANSPARENT_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "rgba(0,0,0,0)", "background-opacity": 0 },
    },
  ],
};

// ---------- Layer helpers ----------

const ROUTE_PAINT = { "line-color": "#ff5500", "line-width": 4 };
const ROUTE_HIT_PAINT = { "line-color": "#000000", "line-width": 18, "line-opacity": 0 };
const IMPORTED_PAINT = {
  "line-color": ["coalesce", ["get", "color"], GPX_ROUTE_COLORS[0]],
  "line-width": 2.5,
  "line-opacity": 0.72,
};
const STRAVA_PAINT = { "line-color": "#FC4C02", "line-width": 2, "line-opacity": 0.65 };

function ensureSource(map, id, data) {
  if (!map.getSource(id)) {
    map.addSource(id, { type: "geojson", data });
    return true;
  }
  map.getSource(id).setData(data);
  return false;
}

function addRouteLayers(map, geojson) {
  if (ensureSource(map, "route", geojson)) {
    map.addLayer({ id: "route-hit-area", type: "line", source: "route", paint: ROUTE_HIT_PAINT });
    map.addLayer({ id: "route", type: "line", source: "route", paint: ROUTE_PAINT });
  }
}

function addImportedLayer(map, geojson) {
  if (ensureSource(map, "imported-routes", geojson)) {
    map.addLayer({ id: "imported-routes", type: "line", source: "imported-routes", paint: IMPORTED_PAINT });
  }
}

function addStravaLayer(map, geojson) {
  if (ensureSource(map, "strava-routes", geojson)) {
    map.addLayer({ id: "strava-routes", type: "line", source: "strava-routes", paint: STRAVA_PAINT });
  }
}

function applySatelliteGoogleLikeTone(map, mapStyle) {
  if (mapStyle !== "satellite") return;
  const layers = map.getStyle()?.layers || [];
  if (!layers.length) return;

  // Subtle global raster tuning to get closer to Google-like satellite tones.
  const rasterLayers = layers.filter((layer) => layer.type === "raster");
  rasterLayers.forEach((layer) => {
    try {
      map.setPaintProperty(layer.id, "raster-saturation", 0.1);
      map.setPaintProperty(layer.id, "raster-contrast", 0.06);
      map.setPaintProperty(layer.id, "raster-brightness-min", 0.02);
      map.setPaintProperty(layer.id, "raster-brightness-max", 1.03);
    } catch {
      // Ignore raster layers without these paint properties.
    }
  });

  const oceanLayers = layers.filter((layer) => {
    const searchable = `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
    return (layer.type === "fill" || layer.type === "line") && (searchable.includes("ocean") || searchable.includes("sea"));
  });

  const waterLayers = oceanLayers.length ? oceanLayers : layers.filter((layer) => {
    const searchable = `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
    return (layer.type === "fill" || layer.type === "line") && searchable.includes("water");
  });

  waterLayers.forEach((layer) => {
    try {
      if (layer.type === "fill") {
        map.setPaintProperty(layer.id, "fill-color", "#4b67af");
        map.setPaintProperty(layer.id, "fill-opacity", 0.34);
      } else if (layer.type === "line") {
        map.setPaintProperty(layer.id, "line-color", "#5a78bc");
        map.setPaintProperty(layer.id, "line-opacity", 0.42);
      }
    } catch {
      // Ignore layers without these paint properties.
    }
  });
}

function applyGaiaLikeOutdoorTone(map, mapStyle) {
  if (mapStyle !== "outdoor") return;
  const layers = map.getStyle()?.layers || [];
  if (!layers.length) return;

  const reservedLayers = new Set(["route", "route-hit-area", "imported-routes", "strava-routes"]);
  const layerKey = (layer) => `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();

  const trySetPaint = (layerId, prop, value) => {
    try {
      map.setPaintProperty(layerId, prop, value);
    } catch {
      // Ignore layers that do not support the paint property.
    }
  };
  const trySetLayout = (layerId, prop, value) => {
    try {
      map.setLayoutProperty(layerId, prop, value);
    } catch {
      // Ignore layers that do not support the layout property.
    }
  };

  const setLineWidth = (layerId, min = 0.8, max = 2.2) => {
    trySetPaint(layerId, "line-width", ["interpolate", ["linear"], ["zoom"], 10, min, 16, max]);
  };

  const setTextColor = (layerId, color, halo = "rgba(255,255,255,0.92)") => {
    trySetPaint(layerId, "text-color", color);
    trySetPaint(layerId, "text-halo-color", halo);
    trySetPaint(layerId, "text-halo-width", 1.1);
  };

  layers.forEach((layer) => {
    if (reservedLayers.has(layer.id)) return;

    const searchable = layerKey(layer);

    if (layer.type === "background") {
      trySetPaint(layer.id, "background-color", "#e8eedb");
      return;
    }

    if (layer.type === "raster") {
      if (searchable.includes("hillshade") || searchable.includes("terrain")) {
        trySetPaint(layer.id, "raster-opacity", 0.26);
      }
      return;
    }

    if (layer.type === "fill") {
      if (searchable.includes("water")) {
        trySetPaint(layer.id, "fill-color", "#c9deea");
        trySetPaint(layer.id, "fill-opacity", 0.9);
        return;
      }

      if (
        searchable.includes("park") ||
        searchable.includes("forest") ||
        searchable.includes("wood") ||
        searchable.includes("landcover") ||
        searchable.includes("landuse") ||
        searchable.includes("grass") ||
        searchable.includes("meadow")
      ) {
        trySetPaint(layer.id, "fill-color", "#e0ead6");
        trySetPaint(layer.id, "fill-opacity", 0.92);
        return;
      }

      if (searchable.includes("building")) {
        trySetPaint(layer.id, "fill-color", "#d9d8cf");
        trySetPaint(layer.id, "fill-opacity", 0.48);
        return;
      }
    }

    if (layer.type === "symbol") {
      const isNoiseLayer =
        searchable.includes("poi") ||
        searchable.includes("housenumber") ||
        searchable.includes("transit") ||
        searchable.includes("bus") ||
        searchable.includes("rail_station") ||
        searchable.includes("amenity") ||
        searchable.includes("aeroway");

      if (isNoiseLayer) {
        trySetLayout(layer.id, "visibility", "none");
        return;
      }

      trySetLayout(layer.id, "visibility", "visible");

      if (searchable.includes("road")) {
        setTextColor(layer.id, "#576066");
        trySetPaint(layer.id, "text-opacity", 0.74);
        return;
      }

      if (searchable.includes("water")) {
        setTextColor(layer.id, "#587a92");
        trySetPaint(layer.id, "text-opacity", 0.72);
        return;
      }

      if (searchable.includes("place") || searchable.includes("country") || searchable.includes("city")) {
        setTextColor(layer.id, "#4f575d");
        trySetPaint(layer.id, "text-opacity", 0.8);
        return;
      }
      return;
    }

    if (layer.type !== "line") return;

    const isCycleway =
      searchable.includes("cycleway") ||
      searchable.includes("bicycle") ||
      searchable.includes("bike") ||
      searchable.includes("cycling") ||
      searchable.includes("velo") ||
      searchable.includes("mtb");
    const isTrailLike =
      searchable.includes("trail") ||
      searchable.includes("path") ||
      searchable.includes("track") ||
      searchable.includes("footway") ||
      searchable.includes("bridleway") ||
      searchable.includes("hiking");
    const isSecondaryRoad = searchable.includes("secondary") || searchable.includes("primary");
    const isMinorRoad =
      searchable.includes("residential") ||
      searchable.includes("service") ||
      searchable.includes("living_street") ||
      searchable.includes("tertiary") ||
      searchable.includes("unclassified");
    const isMajorRoad = searchable.includes("motorway") || searchable.includes("trunk");
    const isWaterLine =
      searchable.includes("waterway") ||
      searchable.includes("river") ||
      searchable.includes("stream") ||
      searchable.includes("canal");
    const isBoundary = searchable.includes("boundary") || searchable.includes("admin");
    const isRail = searchable.includes("rail");
    const isContour = searchable.includes("contour");

    if (isCycleway) {
      trySetPaint(layer.id, "line-color", "#2cae76");
      trySetPaint(layer.id, "line-opacity", 0.98);
      setLineWidth(layer.id, 1.2, 3.6);
      return;
    }

    if (isTrailLike) {
      trySetPaint(layer.id, "line-color", "#737781");
      trySetPaint(layer.id, "line-opacity", 0.84);
      setLineWidth(layer.id, 0.65, 1.45);
      trySetPaint(layer.id, "line-dasharray", [2.7, 2.1]);
      return;
    }

    if (isMajorRoad) {
      trySetPaint(layer.id, "line-color", "#e3ab45");
      trySetPaint(layer.id, "line-opacity", 0.96);
      setLineWidth(layer.id, 1.8, 4.9);
      return;
    }

    if (isSecondaryRoad) {
      trySetPaint(layer.id, "line-color", "#e7cb76");
      trySetPaint(layer.id, "line-opacity", 0.93);
      setLineWidth(layer.id, 1.3, 3.8);
      return;
    }

    if (isMinorRoad) {
      trySetPaint(layer.id, "line-color", "#bddb7a");
      trySetPaint(layer.id, "line-opacity", 0.88);
      setLineWidth(layer.id, 0.95, 2.4);
      return;
    }

    if (isWaterLine) {
      trySetPaint(layer.id, "line-color", "#78b4d8");
      trySetPaint(layer.id, "line-opacity", 0.86);
      setLineWidth(layer.id, 0.75, 1.8);
      return;
    }

    if (isRail) {
      trySetPaint(layer.id, "line-color", "#8d8e91");
      trySetPaint(layer.id, "line-opacity", 0.46);
      setLineWidth(layer.id, 0.7, 1.6);
      return;
    }

    if (isBoundary) {
      trySetPaint(layer.id, "line-color", "#9ca19a");
      trySetPaint(layer.id, "line-opacity", 0.34);
      setLineWidth(layer.id, 0.5, 1.0);
      trySetPaint(layer.id, "line-dasharray", [1.4, 1.2]);
      return;
    }

    if (isContour) {
      trySetPaint(layer.id, "line-color", "#ab9b76");
      trySetPaint(layer.id, "line-opacity", 0.3);
      setLineWidth(layer.id, 0.4, 0.9);
    }
  });
}

function removeLayerAndSource(map, layerId, sourceId) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (sourceId && map.getSource(sourceId)) map.removeSource(sourceId);
}

function getBaseStyle(mapStyle, useAppleSatellite) {
  if (mapStyle === "satellite" && useAppleSatellite) return TRANSPARENT_STYLE;
  return MAP_STYLES[mapStyle]?.style || MAP_STYLES.streets.style;
}

function getBaseStyleKey(mapStyle, useAppleSatellite) {
  return mapStyle === "satellite" && useAppleSatellite ? "satellite-apple-overlay" : mapStyle;
}

// ---------- Rainbow marker ----------

function createMarkerElement(rainbow = false) {
  const el = document.createElement("div");
  el.className = rainbow ? "rainbow-marker" : "";
  el.innerHTML = `<svg display="block" height="41px" width="27px" viewBox="0 0 27 41">
    <g fill-rule="nonzero">
      <g transform="translate(3.0, 29.0)" fill="#000000">
        <ellipse opacity="0.04" cx="10.5" cy="5.8" rx="10.5" ry="5.25"></ellipse>
        <ellipse opacity="0.04" cx="10.5" cy="5.8" rx="9.5" ry="4.77"></ellipse>
        <ellipse opacity="0.04" cx="10.5" cy="5.8" rx="8.5" ry="4.3"></ellipse>
        <ellipse opacity="0.04" cx="10.5" cy="5.8" rx="7.5" ry="3.82"></ellipse>
        <ellipse opacity="0.04" cx="10.5" cy="5.8" rx="6.5" ry="3.34"></ellipse>
        <ellipse opacity="0.04" cx="10.5" cy="5.8" rx="5.5" ry="2.86"></ellipse>
        <ellipse opacity="0.04" cx="10.5" cy="5.8" rx="4.5" ry="2.39"></ellipse>
      </g>
      <g class="marker-body" fill="#3FB1CE">
        <path d="M27,13.5 C27,19.074644 20.250001,27.000002 14.75,34.500002 C14.016665,35.500004 12.983335,35.500004 12.25,34.500002 C6.7499993,27.000002 0,19.222562 0,13.5 C0,6.0441559 6.0441559,0 13.5,0 C20.955844,0 27,6.0441559 27,13.5 Z"></path>
      </g>
      <g opacity="0.25" fill="#000000">
        <path d="M13.5,0 C6.0441559,0 0,6.0441559 0,13.5 C0,19.222562 6.7499993,27 12.25,34.5 C13,35.522727 14.016664,35.500004 14.75,34.5 C20.250001,27 27,19.074644 27,13.5 C27,6.0441559 20.955844,0 13.5,0 Z M13.5,1 C20.415404,1 26,6.584596 26,13.5 C26,15.898657 24.495584,19.181431 22.220703,22.738281 C19.945823,26.295132 16.705119,30.142167 13.943359,33.908203 C13.743445,34.180814 13.612715,34.322738 13.5,34.441406 C13.387285,34.322738 13.256555,34.180814 13.056641,33.908203 C10.284481,30.127985 7.4148684,26.314159 5.015625,22.773438 C2.6163816,19.232715 1,15.953538 1,13.5 C1,6.584596 6.584596,1 13.5,1 Z"></path>
      </g>
      <g transform="translate(8.0, 8.0)">
        <circle fill="#000000" opacity="0.25" cx="5.5" cy="5.5" r="5.5"></circle>
        <circle fill="#FFFFFF" cx="5.5" cy="5.5" r="5.5"></circle>
      </g>
    </g>
  </svg>`;
  return el;
}

// ---------- Elevation ----------

function calculateElevationGain(geojson) {
  const coords = geojson?.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 3) return 0;
  const THRESHOLD = 3;
  const filtered = getFilteredElevations(coords);
  let total = 0;
  for (let i = 1; i < filtered.length; i++) {
    const diff = filtered[i] - filtered[i - 1];
    if (diff > THRESHOLD) total += diff;
  }
  return total;
}

function fitLineStringBounds(map, coordinates, padding) {
  if (!map || !Array.isArray(coordinates) || !coordinates.length) return;

  const bounds = coordinates.reduce(
    (acc, coord) => acc.extend(coord),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
  );

  map.fitBounds(bounds, {
    padding,
    duration: 500,
    maxZoom: 15,
  });
}

function getCoordinateAtProgress(coordinates, progress = 0.5) {
  if (!Array.isArray(coordinates) || !coordinates.length) return null;
  if (coordinates.length === 1) return coordinates[0];

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const segmentLengths = [];
  let totalLength = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const current = coordinates[index];
    const segmentLength = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    segmentLengths.push(segmentLength);
    totalLength += segmentLength;
  }

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    return coordinates[Math.floor((coordinates.length - 1) * clampedProgress)];
  }

  const targetLength = totalLength * clampedProgress;
  let walkedLength = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const segmentLength = segmentLengths[index - 1];
    const nextWalkedLength = walkedLength + segmentLength;
    if (targetLength <= nextWalkedLength) {
      const start = coordinates[index - 1];
      const end = coordinates[index];
      const localProgress = segmentLength > 0 ? (targetLength - walkedLength) / segmentLength : 0;
      return [
        start[0] + (end[0] - start[0]) * localProgress,
        start[1] + (end[1] - start[1]) * localProgress,
      ];
    }
    walkedLength = nextWalkedLength;
  }

  return coordinates[coordinates.length - 1];
}

function createStravaPhotoMarkerElement(marker, isMobile) {
  const size = isMobile ? 54 : 64;
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:relative;width:${size}px;height:${size}px;pointer-events:auto;`;

  const image = document.createElement("div");
  image.style.cssText = [
    "width:100%",
    "height:100%",
    "border-radius:999px",
    "overflow:hidden",
    "border:4px solid rgba(255,255,255,0.96)",
    "box-shadow:0 12px 24px rgba(15,23,42,0.24)",
    "background-color:#e5e7eb",
    "background-size:cover",
    "background-position:center",
  ].join(";");
  if (marker.imageUrl) image.style.backgroundImage = `url("${marker.imageUrl}")`;
  wrapper.appendChild(image);

  const totalPhotoCount = Number.isFinite(marker.totalPhotoCount) ? marker.totalPhotoCount : 0;
  if (marker.showCountBadge !== false && totalPhotoCount > 1) {
    const badge = document.createElement("div");
    badge.textContent = totalPhotoCount > 99 ? "99+" : `${totalPhotoCount}`;
    badge.style.cssText = [
      "position:absolute",
      "right:-4px",
      "bottom:-4px",
      "min-width:24px",
      "height:24px",
      "padding:0 7px",
      "border-radius:999px",
      "background:#FC4C02",
      "border:2px solid rgba(255,255,255,0.96)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font:700 11px/1 system-ui,sans-serif",
      "color:#fff",
      "box-shadow:0 8px 20px rgba(252,76,2,0.35)",
    ].join(";");
    wrapper.appendChild(badge);
  }

  return wrapper;
}

// ---------- Hook ----------

export function useMap({ appleMapContainerRef, mapContainerRef, mapStyle, importedRoutesGeoJson, stravaActivitiesGeoJson, selectedStravaActivityId, selectedStravaPhotoMarkers, routingMode, isMobile, speedMode }) {
  const mapRef = useRef(null);
  const appleMapRef = useRef(null);
  const appleMapKitRef = useRef(null);
  const appleMapReadyRef = useRef(false);
  const waypointsRef = useRef([]);
  const markersRef = useRef([]);
  const stravaPhotoMarkersRef = useRef([]);
  const routeDataRef = useRef(null);
  const geolocateControlRef = useRef(null);
  const userLocationRef = useRef(null);
  const userMarkerRef = useRef(null);
  const currentMapStyleRef = useRef(getBaseStyleKey(mapStyle, false));

  // Mutable refs so stable callbacks always see the latest values
  const routingModeRef = useRef(routingMode);
  const importedGeoJsonRef = useRef(importedRoutesGeoJson);
  const stravaGeoJsonRef = useRef(stravaActivitiesGeoJson);
  const isMobileRef = useRef(isMobile);
  const speedModeRef = useRef(speedMode);

  const [distanceKm, setDistanceKm] = useState("0.00");
  const [elevationGainM, setElevationGainM] = useState("0");
  const [routeGeoJson, setRouteGeoJson] = useState(null);
  const [locationState, setLocationState] = useState({ status: "idle", message: "Location off" });
  const [isRouting, setIsRouting] = useState(false);
  const [routingError, setRoutingError] = useState(null);
  const [appleMapReady, setAppleMapReady] = useState(false);

  useEffect(() => { routingModeRef.current = routingMode; }, [routingMode]);
  useEffect(() => { importedGeoJsonRef.current = importedRoutesGeoJson; }, [importedRoutesGeoJson]);
  useEffect(() => { stravaGeoJsonRef.current = stravaActivitiesGeoJson; }, [stravaActivitiesGeoJson]);
  useEffect(() => { isMobileRef.current = isMobile; }, [isMobile]);
  useEffect(() => { speedModeRef.current = speedMode; }, [speedMode]);

  // Stable internal functions stored in a ref so they can call each other
  const fns = useRef(null);

  // ---------- Map init ----------
  useEffect(() => {
    let isCancelled = false;
    let map = null;
    let geolocateControl = null;
    const setAppleBasemapVisibility = (visible) => {
      if (!appleMapContainerRef?.current) return;
      appleMapContainerRef.current.style.opacity = visible ? "1" : "0";
    };
    const syncAppleBasemapCamera = () => {
      if (!map || !appleMapRef.current || !appleMapKitRef.current) return;
      const center = map.getCenter();
      const bounds = map.getBounds();
      const latDelta = Math.max(Math.abs(bounds.getNorth() - bounds.getSouth()), 0.0005);
      const lngDelta = Math.max(Math.abs(bounds.getEast() - bounds.getWest()), 0.0005);
      appleMapRef.current.region = new appleMapKitRef.current.CoordinateRegion(
        new appleMapKitRef.current.Coordinate(center.lat, center.lng),
        new appleMapKitRef.current.CoordinateSpan(latDelta, lngDelta)
      );
    };
    const ensureAppleBasemap = async () => {
      if (!APPLE_MAPKIT_TOKEN || appleMapRef.current || !appleMapContainerRef?.current) return;
      try {
        const mapkit = await loadAppleMapKit(APPLE_MAPKIT_TOKEN);
        if (isCancelled || !appleMapContainerRef.current) return;
        appleMapKitRef.current = mapkit;
        appleMapRef.current = new mapkit.Map(appleMapContainerRef.current, {
          mapType: mapkit.Map.MapTypes.Satellite,
          showsMapTypeControl: false,
          showsZoomControl: false,
        });
        appleMapReadyRef.current = true;
        setAppleMapReady(true);
        syncAppleBasemapCamera();
        setAppleBasemapVisibility(mapStyle === "satellite");
      } catch (error) {
        console.error("Apple MapKit JS failed to load:", error);
        appleMapReadyRef.current = false;
        setAppleMapReady(false);
      }
    };
    const ensureUserMarker = (coords) => {
      if (!map || !Array.isArray(coords)) return;
      if (!userMarkerRef.current) {
        const dot = document.createElement("div");
        dot.style.cssText =
          "width:14px;height:14px;border-radius:999px;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,0.24);";
        userMarkerRef.current = new maplibregl.Marker({ element: dot }).setLngLat(coords).addTo(map);
      } else {
        userMarkerRef.current.setLngLat(coords);
      }
    };

    const handleGeolocate = (e) => {
      const accuracy = Number.isFinite(e?.coords?.accuracy) ? Math.round(e.coords.accuracy) : null;
      if (Number.isFinite(e?.coords?.longitude) && Number.isFinite(e?.coords?.latitude)) {
        const coords = [e.coords.longitude, e.coords.latitude];
        userLocationRef.current = coords;
        ensureUserMarker(coords);
      }
      setLocationState({ status: "active", message: accuracy ? `Location on • ±${accuracy} m` : "Location on" });
    };
    const handleGeolocateError = (e) => {
      setLocationState({ status: "error", message: e?.code === 1 ? "Location blocked" : "Location unavailable" });
    };
    const initMap = (center) => {
      if (isCancelled || !mapContainerRef.current) return;
      const useAppleSatellite = mapStyle === "satellite" && appleMapReadyRef.current;
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: getBaseStyle(mapStyle, useAppleSatellite),
        center,
        zoom: 12,
        attributionControl: false,
      });
      mapRef.current = map;
      currentMapStyleRef.current = getBaseStyleKey(mapStyle, useAppleSatellite);
      if (appleMapReadyRef.current) syncAppleBasemapCamera();
      if (Array.isArray(userLocationRef.current)) ensureUserMarker(userLocationRef.current);

      geolocateControl = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
        showAccuracyCircle: true,
      });
      geolocateControlRef.current = geolocateControl;
      map.addControl(geolocateControl, "top-right");
      if (geolocateControl._container) geolocateControl._container.style.display = "none";
      geolocateControl.on("geolocate", handleGeolocate);
      geolocateControl.on("error", handleGeolocateError);

      // --- Internal functions ---

      async function snapToRoads(profile, points, radius) {
        if (!points.length || !Number.isFinite(radius) || radius <= 0) return points;
        try {
          const res = await fetch(`https://api.openrouteservice.org/v2/snap/${profile}/json`, {
            method: "POST",
            headers: { Authorization: ORS_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ locations: points, radius }),
          });
          const data = await res.json();
          const snapped = data?.locations;
          if (!Array.isArray(snapped)) return points;
          return points.map((pt, i) => {
            const c = snapped[i];
            if (!c?.location) return pt;
            const d = Number(c.snapped_distance);
            return Number.isFinite(d) && d <= radius ? c.location : pt;
          });
        } catch (err) {
          console.error("Snapping error:", err);
          return points;
        }
      }

      function attachRemovePopup(marker) {
        const container = document.createElement("div");
        container.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;padding:4px 2px;";

        const label = document.createElement("span");
        label.textContent = "Waypoint";
        label.style.cssText = "font-size:11px;font-weight:600;color:#666;font-family:system-ui,sans-serif;letter-spacing:0.04em;text-transform:uppercase;";

        const btn = document.createElement("button");
        btn.textContent = "✕ Remove";
        btn.style.cssText = "padding:5px 14px;border-radius:6px;border:none;background:#ef4444;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:system-ui,sans-serif;";
        btn.addEventListener("mouseenter", () => { btn.style.background = "#dc2626"; });
        btn.addEventListener("mouseleave", () => { btn.style.background = "#ef4444"; });
        btn.addEventListener("click", () => {
          const idx = markersRef.current.indexOf(marker);
          if (idx === -1) return;
          waypointsRef.current.splice(idx, 1);
          markersRef.current.splice(idx, 1);
          marker.remove();
          if (waypointsRef.current.length < 2) {
            fns.current?.clearRouteState();
          } else {
            fns.current?.calculateRoute();
          }
        });

        container.appendChild(label);
        container.appendChild(btn);
        const popup = new maplibregl.Popup({ closeButton: false, offset: 25, className: "waypoint-popup" }).setDOMContent(container);
        marker.setPopup(popup);
      }

      function renderMarkers() {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        waypointsRef.current.forEach(([lng, lat], idx) => {
          const marker = new maplibregl.Marker({ element: createMarkerElement(speedModeRef.current), draggable: true })
            .setLngLat([lng, lat])
            .addTo(map);
          marker.on("dragend", () => {
            const p = marker.getLngLat();
            waypointsRef.current[idx] = [p.lng, p.lat];
            fns.current.calculateRoute();
          });
          attachRemovePopup(marker);
          markersRef.current.push(marker);
        });
      }

      function clearRouteLayer() {
        removeLayerAndSource(map, "route", null);
        removeLayerAndSource(map, "route-hit-area", "route");
      }

      function clearRouteState() {
        routeDataRef.current = null;
        setRouteGeoJson(null);
        setDistanceKm("0.00");
        setElevationGainM("0");
        clearRouteLayer();
      }

      async function calculateRoute() {
        if (waypointsRef.current.length < 2) return;

        const mode = ROUTING_MODES[routingModeRef.current] || ROUTING_MODES.gravel;
        let routeWaypoints = waypointsRef.current;

        if (routingModeRef.current === "mainRoads") {
          const snapped = await snapToRoads(mode.profile, waypointsRef.current, mode.snapRadius);
          const changed = snapped.some((pt, i) => !arePointsClose(pt, waypointsRef.current[i]));
          if (changed) {
            waypointsRef.current = snapped.map(([lng, lat]) => [lng, lat]);
            routeWaypoints = waypointsRef.current;
            renderMarkers();
          } else {
            routeWaypoints = snapped;
          }
        }

        setIsRouting(true);
        setRoutingError(null);

        try {
          const res = await fetch(
            `https://api.openrouteservice.org/v2/directions/${mode.profile}/geojson`,
            {
              method: "POST",
              headers: { Authorization: ORS_API_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ coordinates: routeWaypoints, elevation: true }),
            }
          );
          const data = await res.json();

          if (!data.features?.length) {
            setRoutingError("No route found. Try moving your waypoints.");
            return;
          }

          routeDataRef.current = data;
          setRouteGeoJson(data);

          const summary = data.features[0].properties?.summary || {};
          setDistanceKm(((summary.distance || 0) / 1000).toFixed(2));
          setElevationGainM(calculateElevationGain(data).toFixed(0));

          addRouteLayers(map, data);
        } catch (err) {
          console.error("Routing error:", err);
          setRoutingError("Routing failed. Check your connection and try again.");
        } finally {
          setIsRouting(false);
        }
      }

      fns.current = { calculateRoute, clearRouteState, renderMarkers, clearRouteLayer };

    // --- Map events ---
    map.on("load", () => {
      map.on("move", syncAppleBasemapCamera);
      map.on("zoom", syncAppleBasemapCamera);
      map.on("resize", syncAppleBasemapCamera);
      addImportedLayer(map, importedGeoJsonRef.current);
      if (stravaGeoJsonRef.current?.features?.length) addStravaLayer(map, stravaGeoJsonRef.current);
      applyGaiaLikeOutdoorTone(map, mapStyle);
      applySatelliteGoogleLikeTone(map, mapStyle);

        map.on("mouseenter", "route-hit-area", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "route-hit-area", () => { map.getCanvas().style.cursor = ""; });

      map.on("click", (e) => {
        if (e.originalEvent.target.closest(".maplibregl-marker")) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: ["route-hit-area"] });
        if (hits?.length && routeDataRef.current) {
          const coords = routeDataRef.current.features[0].geometry.coordinates;
          const nearest = nearestPointOnLine(coords, [e.lngLat.lng, e.lngLat.lat]);
          if (nearest && nearest.dist2 < 35 * 35) {
            const idx = getWaypointInsertIndex(routeDataRef.current, nearest.routeSegmentIndex, waypointsRef.current.length);
            waypointsRef.current.splice(idx, 0, nearest.point);
            renderMarkers();
            calculateRoute();
            return;
          }
        }

          const { lng, lat } = e.lngLat;
          const index = waypointsRef.current.length;
          waypointsRef.current.push([lng, lat]);

          const marker = new maplibregl.Marker({ element: createMarkerElement(speedModeRef.current), draggable: true })
            .setLngLat([lng, lat])
            .addTo(map);
          marker.on("dragend", () => {
            const p = marker.getLngLat();
            waypointsRef.current[index] = [p.lng, p.lat];
            calculateRoute();
          });
          attachRemovePopup(marker);
          markersRef.current.push(marker);
          calculateRoute();
        });
      });
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setLocationState({ status: "pending", message: "Requesting location..." });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (isCancelled) return;
          const accuracy = Number.isFinite(position?.coords?.accuracy) ? Math.round(position.coords.accuracy) : null;
          const coords = [position.coords.longitude, position.coords.latitude];
          userLocationRef.current = coords;
          setLocationState({ status: "active", message: accuracy ? `Location on • ±${accuracy} m` : "Location on" });
          initMap(coords);
        },
        (e) => {
          if (isCancelled) return;
          setLocationState({ status: "error", message: e?.code === 1 ? "Location blocked" : "Location unavailable" });
          initMap(DEFAULT_CENTER);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
      );
    } else {
      setLocationState({ status: "error", message: "Location unavailable" });
      initMap(DEFAULT_CENTER);
    }

    ensureAppleBasemap();

    return () => {
      isCancelled = true;
      if (geolocateControl) {
        geolocateControl.off("geolocate", handleGeolocate);
        geolocateControl.off("error", handleGeolocateError);
      }
      geolocateControlRef.current = null;
      userLocationRef.current = null;
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (appleMapRef.current) {
        appleMapRef.current.destroy?.();
        appleMapRef.current = null;
      }
      appleMapKitRef.current = null;
      appleMapReadyRef.current = false;
      fns.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      stravaPhotoMarkersRef.current.forEach((marker) => marker.remove());
      stravaPhotoMarkersRef.current = [];
      if (map) map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Map style changes ----------
  useEffect(() => {
    if (appleMapContainerRef?.current) {
      appleMapContainerRef.current.style.opacity = mapStyle === "satellite" && appleMapReady ? "1" : "0";
    }

    const map = mapRef.current;
    if (!map) return;

    const useAppleSatellite = mapStyle === "satellite" && appleMapReady;
    const nextStyleKey = getBaseStyleKey(mapStyle, useAppleSatellite);
    if (currentMapStyleRef.current === nextStyleKey) return;

    map.setStyle(getBaseStyle(mapStyle, useAppleSatellite));
    map.once("styledata", () => {
      currentMapStyleRef.current = nextStyleKey;
      if (useAppleSatellite && appleMapRef.current && appleMapKitRef.current) {
        const center = map.getCenter();
        const bounds = map.getBounds();
        const latDelta = Math.max(Math.abs(bounds.getNorth() - bounds.getSouth()), 0.0005);
        const lngDelta = Math.max(Math.abs(bounds.getEast() - bounds.getWest()), 0.0005);
        appleMapRef.current.region = new appleMapKitRef.current.CoordinateRegion(
          new appleMapKitRef.current.Coordinate(center.lat, center.lng),
          new appleMapKitRef.current.CoordinateSpan(latDelta, lngDelta)
        );
      }
      const imported = importedGeoJsonRef.current;
      if (imported.features.length) addImportedLayer(map, imported);
      if (routeDataRef.current) addRouteLayers(map, routeDataRef.current);
      const strava = stravaGeoJsonRef.current;
      if (strava?.features?.length) addStravaLayer(map, strava);
      applyGaiaLikeOutdoorTone(map, mapStyle);
      applySatelliteGoogleLikeTone(map, mapStyle);
    });
  }, [appleMapContainerRef, mapStyle, appleMapReady]);

  // ---------- Imported routes ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    if (importedRoutesGeoJson.features.length) {
      addImportedLayer(map, importedRoutesGeoJson);
    } else {
      removeLayerAndSource(map, "imported-routes", "imported-routes");
    }
  }, [importedRoutesGeoJson]);

  // ---------- Strava activities ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    if (stravaActivitiesGeoJson?.features?.length) {
      addStravaLayer(map, stravaActivitiesGeoJson);
    } else {
      removeLayerAndSource(map, "strava-routes", "strava-routes");
    }
  }, [stravaActivitiesGeoJson]);

  // ---------- Selected Strava activity ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStravaActivityId) return;

    const feature =
      stravaActivitiesGeoJson?.features?.find((entry) => entry?.properties?.id === selectedStravaActivityId) ||
      stravaActivitiesGeoJson?.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || !coordinates.length) return;

    const fitPadding = isMobileRef.current
      ? { top: 48, right: 18, bottom: 300, left: 18 }
      : { top: 80, right: 84, bottom: 80, left: 444 };

    fitLineStringBounds(map, coordinates, fitPadding);
  }, [selectedStravaActivityId, stravaActivitiesGeoJson]);

  useEffect(() => {
    stravaPhotoMarkersRef.current.forEach((marker) => marker.remove());
    stravaPhotoMarkersRef.current = [];

    const map = mapRef.current;
    if (!map || !selectedStravaActivityId || !selectedStravaPhotoMarkers?.length) return;

    const feature =
      stravaActivitiesGeoJson?.features?.find((entry) => entry?.properties?.id === selectedStravaActivityId) ||
      stravaActivitiesGeoJson?.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || !coordinates.length) return;

    stravaPhotoMarkersRef.current = selectedStravaPhotoMarkers
      .map((marker, index) => {
        const fallbackProgress =
          selectedStravaPhotoMarkers.length === 1
            ? 0.52
            : (index + 1) / (selectedStravaPhotoMarkers.length + 1);
        const coordinate = Array.isArray(marker.coordinate)
          ? marker.coordinate
          : getCoordinateAtProgress(coordinates, marker.progress ?? fallbackProgress);
        if (!Array.isArray(coordinate)) return null;

        return new maplibregl.Marker({
          element: createStravaPhotoMarkerElement(marker, isMobileRef.current),
          anchor: "center",
        })
          .setLngLat(coordinate)
          .addTo(map);
      })
      .filter(Boolean);
  }, [selectedStravaActivityId, selectedStravaPhotoMarkers, stravaActivitiesGeoJson]);

  // ---------- Routing mode change ----------
  useEffect(() => {
    if (waypointsRef.current.length >= 2) fns.current?.calculateRoute();
  }, [routingMode]);

  // ---------- Speed mode change ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Re-render markers so they pick up / drop the rainbow class
    fns.current?.renderMarkers();

    if (!speedMode) {
      // Restore normal route color
      if (map.getLayer("route")) map.setPaintProperty("route", "line-color", ROUTE_PAINT["line-color"]);
      return;
    }

    // Animate route line through rainbow hues using requestAnimationFrame
    let rafId;
    const start = performance.now();
    function frame(now) {
      if (!speedModeRef.current) return;
      const hue = ((now - start) / 20) % 360;
      if (map.getLayer("route")) {
        map.setPaintProperty("route", "line-color", `hsl(${hue}, 100%, 50%)`);
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [speedMode]);

  // ---------- Public API ----------

  const undoLast = () => {
    if (!waypointsRef.current.length) return;
    waypointsRef.current.pop();
    const marker = markersRef.current.pop();
    if (marker) marker.remove();
    if (waypointsRef.current.length < 2) {
      fns.current?.clearRouteState();
    } else {
      fns.current?.calculateRoute();
    }
  };

  const clearAll = () => {
    waypointsRef.current = [];
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    fns.current?.clearRouteState();
  };

  const ensureUserMarkerOnMap = (map, coords) => {
    if (!map || !Array.isArray(coords)) return;
    if (!userMarkerRef.current) {
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:14px;height:14px;border-radius:999px;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,0.24);";
      userMarkerRef.current = new maplibregl.Marker({ element: dot }).setLngLat(coords).addTo(map);
    } else {
      userMarkerRef.current.setLngLat(coords);
    }
  };

  const drawRouteBetweenPoints = (map, startCoords, endCoords) => {
    if (!map || !Array.isArray(startCoords) || !Array.isArray(endCoords)) return;
    waypointsRef.current = [
      [startCoords[0], startCoords[1]],
      [endCoords[0], endCoords[1]],
    ];
    fns.current?.renderMarkers();
    fns.current?.calculateRoute();
    const lngs = waypointsRef.current.map((p) => p[0]);
    const lats = waypointsRef.current.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: isMobileRef.current ? 90 : 140, duration: 550 }
    );
  };

  const locateUser = () => {
    const map = mapRef.current;
    if (!map) return;

    if (Array.isArray(userLocationRef.current)) {
      ensureUserMarkerOnMap(map, userLocationRef.current);
      map.easeTo({ center: userLocationRef.current, duration: 550, zoom: Math.max(map.getZoom(), 14) });
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState({ status: "error", message: "Location unavailable" });
      return;
    }

    setLocationState({ status: "pending", message: "Requesting location..." });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = [position.coords.longitude, position.coords.latitude];
        userLocationRef.current = coords;
        const accuracy = Number.isFinite(position?.coords?.accuracy) ? Math.round(position.coords.accuracy) : null;
        setLocationState({ status: "active", message: accuracy ? `Location on • ±${accuracy} m` : "Location on" });
        ensureUserMarkerOnMap(map, coords);
        map.easeTo({ center: coords, duration: 550, zoom: Math.max(map.getZoom(), 14) });
      },
      (e) => {
        setLocationState({ status: "error", message: e?.code === 1 ? "Location blocked" : "Location unavailable" });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
    );
  };

  const routeToDestination = async (destinationCoords) => {
    const map = mapRef.current;
    if (!map) return { ok: false, message: "Map not ready yet." };
    if (!Array.isArray(destinationCoords) || destinationCoords.length < 2) {
      return { ok: false, message: "Invalid destination coordinates." };
    }

    const destination = [Number(destinationCoords[0]), Number(destinationCoords[1])];
    if (!Number.isFinite(destination[0]) || !Number.isFinite(destination[1])) {
      return { ok: false, message: "Invalid destination coordinates." };
    }

    const buildRouteFrom = (origin) => {
      ensureUserMarkerOnMap(map, origin);
      drawRouteBetweenPoints(map, origin, destination);
    };

    if (Array.isArray(userLocationRef.current)) {
      buildRouteFrom(userLocationRef.current);
      return { ok: true };
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState({ status: "error", message: "Location unavailable" });
      return { ok: false, message: "Location unavailable." };
    }

    setLocationState({ status: "pending", message: "Requesting location..." });
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const origin = [position.coords.longitude, position.coords.latitude];
          userLocationRef.current = origin;
          const accuracy = Number.isFinite(position?.coords?.accuracy) ? Math.round(position.coords.accuracy) : null;
          setLocationState({ status: "active", message: accuracy ? `Location on • ±${accuracy} m` : "Location on" });
          buildRouteFrom(origin);
          resolve({ ok: true });
        },
        (e) => {
          const message = e?.code === 1 ? "Location blocked" : "Location unavailable";
          setLocationState({ status: "error", message });
          resolve({ ok: false, message });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
      );
    });
  };

  const loadRouteOnMap = (savedRoute) => {
    const map = mapRef.current;
    if (!map) return;

    waypointsRef.current = (savedRoute.waypoints || []).map(([lng, lat]) => [lng, lat]);
    routeDataRef.current = savedRoute.routeGeoJson || null;

    setDistanceKm(String(savedRoute.distanceKm || "0.00"));
    setElevationGainM(String(savedRoute.elevationGainM || "0"));
    setRouteGeoJson(savedRoute.routeGeoJson || null);

    fns.current?.renderMarkers();

    if (routeDataRef.current) addRouteLayers(map, routeDataRef.current);

    if (waypointsRef.current.length) {
      const lngs = waypointsRef.current.map((p) => p[0]);
      const lats = waypointsRef.current.map((p) => p[1]);
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: isMobileRef.current ? 80 : 120, duration: 500 }
      );
    }
  };

  const getMapViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return null;
    try {
      const center = map.getCenter();
      const bounds = map.getBounds();
      return {
        center: [center.lng, center.lat],
        bounds: [
          [bounds.getWest(), bounds.getSouth()],
          [bounds.getEast(), bounds.getNorth()],
        ],
      };
    } catch {
      return null;
    }
  }, []);

  return {
    distanceKm,
    elevationGainM,
    routeGeoJson,
    locationState,
    isRouting,
    routingError,
    waypointsRef,
    routeDataRef,
    undoLast,
    clearAll,
    locateUser,
    routeToDestination,
    loadRouteOnMap,
    getMapViewport,
  };
}
