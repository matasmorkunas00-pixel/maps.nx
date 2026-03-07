import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjY5NjNlMTI3OTQ5MjQ2MDVhYzBmMDZmMWMwMGNiOTY2IiwiaCI6Im11cm11cjY0In0=";
const buildRasterStyle = ({ rasterTiles, labelTiles = [], maxzoom = 19 }) => ({
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: rasterTiles,
      tileSize: 256,
      maxzoom,
      attribution:
        'Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
    ...(labelTiles.length
      ? {
          labels: {
            type: "raster",
            tiles: labelTiles,
            tileSize: 256,
            maxzoom,
            attribution: "Labels © Esri",
          },
        }
      : {}),
  },
  layers: [
    {
      id: "basemap",
      type: "raster",
      source: "basemap",
    },
    ...(labelTiles.length
      ? [
          {
            id: "labels",
            type: "raster",
            source: "labels",
          },
        ]
      : []),
  ],
});

const MAP_STYLES = {
  streets: {
    label: "Streets",
    style: "https://api.maptiler.com/maps/streets-v2/style.json?key=Hyv4x1z1eacwc6D47Zsg",
  },
  satellite: {
    label: "Satellite",
    style: buildRasterStyle({
      rasterTiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      labelTiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
    }),
  },
};

const STORAGE_KEY = "gp_routes_v1";
const GPX_LIBRARY_STORAGE_KEY = "gp_gpx_library_v1";
const GPX_ROUTE_COLORS = ["#2563eb", "#ef4444", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#0891b2", "#f97316"];
const ROUTING_MODES = {
  gravel: { label: "Gravel", profile: "cycling-mountain", snapRadius: null },
  regular: { label: "Balanced", profile: "cycling-regular", snapRadius: null },
  mainRoads: { label: "Main roads", profile: "driving-car", snapRadius: 25 },
};

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function arePointsClose(a, b, epsilon = 1e-6) {
  return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}

// Approx meters conversion around a latitude (good enough for short distances)
function lngLatToMeters(lng, lat, refLat) {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((refLat * Math.PI) / 180);
  return {
    x: lng * mPerDegLng,
    y: lat * mPerDegLat,
  };
}

// Find nearest point on polyline (coords: [[lng,lat,ele?],...]) to click [lng,lat]
function nearestPointOnLine(coords, clickLngLat) {
  if (!coords || coords.length < 2) return null;

  const [clng, clat] = clickLngLat;
  const refLat = clat;
  const C = lngLatToMeters(clng, clat, refLat);

  let best = { dist2: Infinity, point: null, insertIndex: 1 };

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    const A = lngLatToMeters(a[0], a[1], refLat);
    const B = lngLatToMeters(b[0], b[1], refLat);

    const ABx = B.x - A.x;
    const ABy = B.y - A.y;
    const ACx = C.x - A.x;
    const ACy = C.y - A.y;

    const ab2 = ABx * ABx + ABy * ABy;
    const t = ab2 === 0 ? 0 : clamp((ACx * ABx + ACy * ABy) / ab2, 0, 1);

    const Px = A.x + t * ABx;
    const Py = A.y + t * ABy;

    const dx = C.x - Px;
    const dy = C.y - Py;
    const dist2 = dx * dx + dy * dy;

    if (dist2 < best.dist2) {
      // convert back to lng/lat
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos((refLat * Math.PI) / 180);
      const plng = Px / mPerDegLng;
      const plat = Py / mPerDegLat;

      best = {
        dist2,
        point: [plng, plat],
        routeSegmentIndex: i,
      };
    }
  }

  return best;
}

function getWaypointInsertIndex(routeGeoJson, routeSegmentIndex, waypointCount) {
  if (waypointCount < 2) return waypointCount;

  const geometryWaypoints = routeGeoJson?.features?.[0]?.properties?.way_points;
  if (Array.isArray(geometryWaypoints) && geometryWaypoints.length >= 2) {
    for (let i = 0; i < geometryWaypoints.length - 1; i++) {
      const start = geometryWaypoints[i];
      const end = geometryWaypoints[i + 1];

      if (routeSegmentIndex >= start && routeSegmentIndex < end) {
        return i + 1;
      }
    }
  }

  return clamp(routeSegmentIndex + 1, 1, waypointCount - 1);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function getFilteredElevations(coords) {
  if (!coords?.length) return [];

  const raw = coords.map((coord) => (typeof coord?.[2] === "number" ? coord[2] : null));
  const filled = raw.map((value, index) => {
    if (value !== null) return value;

    const window = raw
      .slice(Math.max(0, index - 2), Math.min(raw.length, index + 3))
      .filter((entry) => entry !== null);

    return window.length ? median(window) : 0;
  });

  const DROP_RATIO_THRESHOLD = 0.3;
  const RECOVERY_THRESHOLD = 18;
  const MAX_DROPOUT_WIDTH = 5;
  const corrected = [...filled];

  for (let start = 1; start < corrected.length - 1; start++) {
    let end = start;

    while (end < corrected.length - 1 && end - start < MAX_DROPOUT_WIDTH) {
      const left = corrected[start - 1];
      const right = corrected[end + 1];
      const boundaryBaseline = Math.max(median([left, right]), 1);
      const segment = corrected.slice(start, end + 1);
      const segmentMin = Math.min(...segment);
      const segmentMax = Math.max(...segment);

      const isSuddenDropout =
        (left - segmentMin) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        (right - segmentMin) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        Math.abs(left - right) < RECOVERY_THRESHOLD;

      const isSuddenSpike =
        (segmentMax - left) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        (segmentMax - right) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        Math.abs(left - right) < RECOVERY_THRESHOLD;

      if (isSuddenDropout || isSuddenSpike) {
        const span = end - start + 2;
        for (let i = start; i <= end; i++) {
          const t = (i - start + 1) / span;
          corrected[i] = left + (right - left) * t;
        }
        start = end;
        break;
      }

      end += 1;
    }
  }

  return corrected.map((value, index) => {
    const window = corrected.slice(Math.max(0, index - 1), Math.min(corrected.length, index + 2));
    return median(window);
  });
}

function buildGpxFromRouteGeoJson(routeGeoJson, name = "Route") {
  const coords = routeGeoJson?.features?.[0]?.geometry?.coordinates;
  if (!coords || !coords.length) return null;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  gpx += `<gpx version="1.1" creator="GravelPlanner" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  gpx += `<trk><name>${esc(name)}</name><trkseg>`;

  coords.forEach(([lng, lat, ele]) => {
    gpx += `<trkpt lat="${lat}" lon="${lng}">`;
    if (typeof ele === "number") gpx += `<ele>${ele}</ele>`;
    gpx += `</trkpt>`;
  });

  gpx += `</trkseg></trk></gpx>`;
  return gpx;
}

function parseGpxText(gpxText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(gpxText, "application/xml");
  if (xml.querySelector("parsererror")) return null;

  const featureCoords = [];
  const trackSegments = Array.from(xml.querySelectorAll("trkseg"));

  trackSegments.forEach((segment) => {
    const coords = Array.from(segment.querySelectorAll("trkpt"))
      .map((point) => {
        const lat = Number(point.getAttribute("lat"));
        const lng = Number(point.getAttribute("lon"));
        const eleNode = point.querySelector("ele");
        const ele = eleNode ? Number(eleNode.textContent) : undefined;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return typeof ele === "number" && Number.isFinite(ele) ? [lng, lat, ele] : [lng, lat];
      })
      .filter(Boolean);

    if (coords.length >= 2) {
      featureCoords.push(coords);
    }
  });

  if (!featureCoords.length) {
    const routePoints = Array.from(xml.querySelectorAll("rtept"))
      .map((point) => {
        const lat = Number(point.getAttribute("lat"));
        const lng = Number(point.getAttribute("lon"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [lng, lat];
      })
      .filter(Boolean);

    if (routePoints.length >= 2) {
      featureCoords.push(routePoints);
    }
  }

  if (!featureCoords.length) return null;

  const name =
    xml.querySelector("trk > name")?.textContent?.trim() ||
    xml.querySelector("rte > name")?.textContent?.trim() ||
    "Imported GPX";

  return {
    name,
    featureCollection: {
      type: "FeatureCollection",
      features: featureCoords.map((coords, index) => ({
        type: "Feature",
        properties: { segmentIndex: index },
        geometry: {
          type: "LineString",
          coordinates: coords,
        },
      })),
    },
  };
}

function buildImportedRoutesGeoJson(importedRoutes, visibleFolders) {
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

function getDefaultRouteColor(index) {
  return GPX_ROUTE_COLORS[index % GPX_ROUTE_COLORS.length];
}

function normalizeImportedRoute(route, index) {
  if (!route || typeof route !== "object") return null;

  const folder =
    typeof route.folder === "string" && route.folder.trim()
      ? route.folder.trim()
      : "Imported";

  const features = Array.isArray(route.geoJson?.features)
    ? route.geoJson.features.filter((feature) => feature?.geometry?.type === "LineString")
    : [];

  if (!features.length) return null;

  return {
    ...route,
    id: route.id || uid(),
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : `Imported route ${index + 1}`,
    folder,
    color: route.color || getDefaultRouteColor(index),
    geoJson: {
      type: "FeatureCollection",
      features,
    },
  };
}

function normalizeSavedRoute(route, index) {
  if (!route || typeof route !== "object") return null;

  const features = Array.isArray(route.routeGeoJson?.features) ? route.routeGeoJson.features : [];
  const waypoints = Array.isArray(route.waypoints)
    ? route.waypoints.filter(
        (point) =>
          Array.isArray(point) &&
          point.length >= 2 &&
          Number.isFinite(Number(point[0])) &&
          Number.isFinite(Number(point[1]))
      )
    : [];

  return {
    id: route.id || `saved_${index}_${uid()}`,
    name: typeof route.name === "string" && route.name.trim() ? route.name.trim() : `Saved route ${index + 1}`,
    createdAt: route.createdAt || new Date().toISOString(),
    routingMode: typeof route.routingMode === "string" ? route.routingMode : undefined,
    gravelMode: !!route.gravelMode,
    waypoints,
    routeGeoJson:
      features.length > 0
        ? {
            type: "FeatureCollection",
            features,
          }
        : null,
    distanceKm: route.distanceKm ?? "0.00",
    elevationGainM: route.elevationGainM ?? "0",
  };
}

function ElevationChart({ routeGeoJson }) {
  const coords = routeGeoJson?.features?.[0]?.geometry?.coordinates;

  const data = useMemo(() => {
    if (!coords || coords.length < 2) return null;
    const elevations = getFilteredElevations(coords);

    // Build distance along route (approx) + elevation
    const points = [];
    let dist = 0;

    // Simple equirectangular distance
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;

    const elevs = [];

    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];

      if (i > 0) {
        const [lng0, lat0] = coords[i - 1];
        const x = toRad(lng - lng0) * Math.cos(toRad((lat + lat0) / 2));
        const y = toRad(lat - lat0);
        const d = Math.sqrt(x * x + y * y) * R;
        dist += d;
      }

      const e = elevations[i] ?? 0;
      elevs.push(e);
      points.push({ x: dist, y: e });
    }

    const minE = Math.min(...elevs);
    const maxE = Math.max(...elevs);

    return { points, minE, maxE, totalDist: dist };
  }, [coords]);

  if (!data) {
    return null;
  }

  const width = 280;
  const height = 80;
  const pad = 6;

  const rangeE = Math.max(1, data.maxE - data.minE);
  const rangeX = Math.max(1, data.totalDist);

  const path = data.points
    .map((p, idx) => {
      const x = pad + (p.x / rangeX) * (width - pad * 2);
      const y = pad + (1 - (p.y - data.minE) / rangeE) * (height - pad * 2);
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
        <span>{Math.round(data.minE)} m</span>
        <span>{Math.round(data.maxE)} m</span>
      </div>
      <svg width={width} height={height} style={{ display: "block", background: "#f6f6f6", borderRadius: 8 }}>
        <path d={path} fill="none" stroke="#111" strokeWidth="2" />
      </svg>
    </div>
  );
}

export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const gpxFileInputRef = useRef(null);
  const geolocateControlRef = useRef(null);

  const waypoints = useRef([]); // [[lng,lat], ...]
  const markers = useRef([]); // maplibre markers
  const routeData = useRef(null); // geojson
  const currentMapStyle = useRef("streets");

  const [distanceKm, setDistanceKm] = useState("0.00");
  const [elevationGainM, setElevationGainM] = useState("0");
  const [routingMode, setRoutingMode] = useState("gravel");
  const [mapStyle, setMapStyle] = useState("streets");
  const [pressedButton, setPressedButton] = useState(null);
  const [importFolderName, setImportFolderName] = useState("");
  const [visibleFolders, setVisibleFolders] = useState([]);
  const [locationState, setLocationState] = useState({
    status: "idle",
    message: "Location off",
  });

  const [routes, setRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw).map((route, index) => normalizeSavedRoute(route, index)).filter(Boolean) : [];
    } catch {
      return [];
    }
  });

  const [importedRoutes, setImportedRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(GPX_LIBRARY_STORAGE_KEY);
      return raw
        ? JSON.parse(raw).map((route, index) => normalizeImportedRoute(route, index)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  });

  const [activeRouteId, setActiveRouteId] = useState(null);
  const [routeName, setRouteName] = useState("My Route");

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  }, [routes]);

  useEffect(() => {
    localStorage.setItem(GPX_LIBRARY_STORAGE_KEY, JSON.stringify(importedRoutes));
  }, [importedRoutes]);

  const availableFolders = useMemo(
    () =>
      Array.from(
        new Set(
          importedRoutes
            .map((route) => route?.folder)
            .filter((folder) => typeof folder === "string" && folder.trim())
        )
      ).sort((a, b) => a.localeCompare(b)),
    [importedRoutes]
  );

  useEffect(() => {
    setVisibleFolders((current) => {
      const next = current.filter((folder) => availableFolders.includes(folder));
      if (next.length) return next;
      return availableFolders;
    });
  }, [availableFolders]);

  const importedRoutesGeoJson = useMemo(
    () => buildImportedRoutesGeoJson(importedRoutes, visibleFolders),
    [importedRoutes, visibleFolders]
  );


  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[mapStyle].style,
      center: [25.2797, 54.6872],
      zoom: 12,
    });

    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserHeading: true,
      showAccuracyCircle: true,
    });

    geolocateControlRef.current = geolocateControl;
    map.addControl(geolocateControl, "top-right");
    if (geolocateControl._container) {
      geolocateControl._container.style.display = "none";
    }

    mapRef.current = map;
    currentMapStyle.current = mapStyle;

    const handleGeolocate = (event) => {
      const accuracy = Number.isFinite(event?.coords?.accuracy) ? Math.round(event.coords.accuracy) : null;
      setLocationState({
        status: "active",
        message: accuracy ? `Location on • ±${accuracy} m` : "Location on",
      });
    };

    const handleGeolocateError = (event) => {
      const denied = event?.code === 1;
      setLocationState({
        status: "error",
        message: denied ? "Location blocked" : "Location unavailable",
      });
    };

    geolocateControl.on("geolocate", handleGeolocate);
    geolocateControl.on("error", handleGeolocateError);

    const ensureRouteLayer = (geojson) => {
      if (!map.getSource("route")) {
        map.addSource("route", { type: "geojson", data: geojson });
        map.addLayer({
          id: "route-hit-area",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#000000",
            "line-width": 18,
            "line-opacity": 0,
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#ff5500",
            "line-width": 4,
          },
        });
      } else {
        map.getSource("route").setData(geojson);
      }
    };

    const ensureImportedRoutesLayer = (geojson) => {
      if (!map.getSource("imported-routes")) {
        map.addSource("imported-routes", { type: "geojson", data: geojson });
        map.addLayer({
          id: "imported-routes",
          type: "line",
          source: "imported-routes",
          paint: {
            "line-color": ["coalesce", ["get", "color"], GPX_ROUTE_COLORS[0]],
            "line-width": 2.5,
            "line-opacity": 0.72,
          },
        });
      } else {
        map.getSource("imported-routes").setData(geojson);
      }
    };

    const clearRouteLayer = () => {
      if (map.getLayer("route")) map.removeLayer("route");
      if (map.getLayer("route-hit-area")) map.removeLayer("route-hit-area");
      if (map.getSource("route")) map.removeSource("route");
    };

    const clearImportedRoutesLayer = () => {
      if (map.getLayer("imported-routes")) map.removeLayer("imported-routes");
      if (map.getSource("imported-routes")) map.removeSource("imported-routes");
    };

    const removeAllMarkers = () => {
      markers.current.forEach((m) => m.remove());
      markers.current = [];
    };

    const renderMarkersFromWaypoints = () => {
      removeAllMarkers();
      waypoints.current.forEach(([lng, lat], idx) => {
        const marker = new maplibregl.Marker({ draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);

        marker.on("dragend", () => {
          const p = marker.getLngLat();
          waypoints.current[idx] = [p.lng, p.lat];
          calculateRoute();
        });

        markers.current.push(marker);
      });
    };

    const calculateElevationGain = (geojson) => {
      const coords = geojson?.features?.[0]?.geometry?.coordinates;
      if (!coords || coords.length < 3) return 0;

      const ELEVATION_THRESHOLD = 3;
      const filtered = getFilteredElevations(coords);

      let totalAscent = 0;

      for (let i = 1; i < filtered.length; i++) {
        const diff = filtered[i] - filtered[i - 1];
        if (diff > ELEVATION_THRESHOLD) {
          totalAscent += diff;
        }
      }

      return totalAscent;
    };

    const snapWaypointsToRoads = async (profile, inputWaypoints, radius) => {
      if (!inputWaypoints.length) return inputWaypoints;
      if (!Number.isFinite(radius) || radius <= 0) return inputWaypoints;

      try {
        const response = await fetch(`https://api.openrouteservice.org/v2/snap/${profile}/json`, {
          method: "POST",
          headers: {
            Authorization: ORS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locations: inputWaypoints,
            radius,
          }),
        });

        const data = await response.json();
        const snapped = data?.locations;
        if (!Array.isArray(snapped)) return inputWaypoints;

        return inputWaypoints.map((point, index) => {
          const candidate = snapped[index];
          if (!candidate?.location) return point;

          const snappedDistance = Number(candidate.snapped_distance);
          return Number.isFinite(snappedDistance) && snappedDistance <= radius ? candidate.location : point;
        });
      } catch (err) {
        console.error("Snapping error:", err);
        return inputWaypoints;
      }
    };

    const calculateRoute = async () => {
      if (waypoints.current.length < 2) return;

      const selectedRoutingMode = ROUTING_MODES[routingMode] || ROUTING_MODES.gravel;
      const profile = selectedRoutingMode.profile;
      let routeWaypoints = waypoints.current;

      if (routingMode === "mainRoads") {
        const snappedWaypoints = await snapWaypointsToRoads(
          profile,
          waypoints.current,
          selectedRoutingMode.snapRadius
        );
        const changed = snappedWaypoints.some((point, index) => !arePointsClose(point, waypoints.current[index]));

        if (changed) {
          waypoints.current = snappedWaypoints.map(([lng, lat]) => [lng, lat]);
          routeWaypoints = waypoints.current;
          renderMarkersFromWaypoints();
        } else {
          routeWaypoints = snappedWaypoints;
        }
      }

      try {
        const response = await fetch(
          `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
          {
            method: "POST",
            headers: {
              Authorization: ORS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              coordinates: routeWaypoints,
              elevation: true,
            }),
          }
        );

        const data = await response.json();
        if (!data.features || !data.features.length) return;

        routeData.current = data;

        // Distance
        const summary = data.features[0].properties?.summary || {};
        setDistanceKm(((summary.distance || 0) / 1000).toFixed(2));

        // Elevation gain
        const gain = calculateElevationGain(data);
        setElevationGainM(gain.toFixed(0));

        ensureRouteLayer(data);
      } catch (err) {
        console.error("Routing error:", err);
      }
    };

    // Expose helpers for other handlers in this effect scope
    map.__gp = {
      calculateRoute,
      clearRouteLayer,
      clearImportedRoutesLayer,
      ensureImportedRoutesLayer,
      removeAllMarkers,
      renderMarkersFromWaypoints,
    };

    map.on("load", () => {
      ensureImportedRoutesLayer(importedRoutesGeoJson);

      map.on("mouseenter", "route-hit-area", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "route-hit-area", () => {
        map.getCanvas().style.cursor = "";
      });

      // 1) Click handling
      map.on("click", (e) => {
        // If user clicked on the route line, insert waypoint at nearest point
        const hits = map.queryRenderedFeatures(e.point, { layers: ["route-hit-area"] });

        if (hits && hits.length && routeData.current) {
          const coords = routeData.current.features[0].geometry.coordinates;
          const nearest = nearestPointOnLine(coords, [e.lngLat.lng, e.lngLat.lat]);

          // only insert if click is close enough (meters^2 threshold)
          // dist2 is in meters^2 because we projected to meters
          if (nearest && nearest.dist2 < 35 * 35) {
            const insertIndex = getWaypointInsertIndex(
              routeData.current,
              nearest.routeSegmentIndex,
              waypoints.current.length
            );
            waypoints.current.splice(insertIndex, 0, nearest.point);
            map.__gp.renderMarkersFromWaypoints();
            map.__gp.calculateRoute();
            return;
          }
        }

        // Otherwise, add as a new endpoint waypoint
        const { lng, lat } = e.lngLat;
        const index = waypoints.current.length;
        waypoints.current.push([lng, lat]);

        const marker = new maplibregl.Marker({ draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);

        marker.on("dragend", () => {
          const p = marker.getLngLat();
          waypoints.current[index] = [p.lng, p.lat];
          map.__gp.calculateRoute();
        });

        markers.current.push(marker);
        map.__gp.calculateRoute();
      });
    });

    return () => {
      geolocateControl.off("geolocate", handleGeolocate);
      geolocateControl.off("error", handleGeolocateError);
      geolocateControlRef.current = null;
      clearRouteLayer();
      clearImportedRoutesLayer();
      removeAllMarkers();
      map.remove();
    };
    // routingMode/mapStyle are intentionally not in deps; handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextStyle = MAP_STYLES[mapStyle]?.style;
    if (!nextStyle) return;
    if (currentMapStyle.current === mapStyle) return;

    map.setStyle(nextStyle);
    map.once("styledata", () => {
      currentMapStyle.current = mapStyle;
      if (importedRoutesGeoJson.features.length) {
        if (!map.getSource("imported-routes")) {
          map.addSource("imported-routes", { type: "geojson", data: importedRoutesGeoJson });
          map.addLayer({
            id: "imported-routes",
            type: "line",
            source: "imported-routes",
            paint: {
              "line-color": ["coalesce", ["get", "color"], GPX_ROUTE_COLORS[0]],
              "line-width": 2.5,
              "line-opacity": 0.72,
            },
          });
        } else {
          map.getSource("imported-routes").setData(importedRoutesGeoJson);
        }
      }

      if (routeData.current) {
        if (!map.getSource("route")) {
          map.addSource("route", { type: "geojson", data: routeData.current });
          map.addLayer({
            id: "route-hit-area",
            type: "line",
            source: "route",
            paint: {
              "line-color": "#000000",
              "line-width": 18,
              "line-opacity": 0,
            },
          });
          map.addLayer({
            id: "route",
            type: "line",
            source: "route",
            paint: { "line-color": "#ff5500", "line-width": 4 },
          });
        } else {
          map.getSource("route").setData(routeData.current);
        }
      }
    });
  }, [importedRoutesGeoJson, mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.__gp) return;

    if (importedRoutesGeoJson.features.length) {
      map.__gp.ensureImportedRoutesLayer(importedRoutesGeoJson);
    } else {
      map.__gp.clearImportedRoutesLayer();
    }
  }, [importedRoutesGeoJson]);

  // When routing mode changes, recalc route if we have one
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.__gp) return;
    if (waypoints.current.length >= 2) {
      map.__gp.calculateRoute();
    }
  }, [routingMode]);

  const undoLast = () => {
    const map = mapRef.current;
    if (!map?.__gp) return;

    if (waypoints.current.length === 0) return;

    waypoints.current.pop();
    const marker = markers.current.pop();
    if (marker) marker.remove();

    if (waypoints.current.length < 2) {
      routeData.current = null;
      setDistanceKm("0.00");
      setElevationGainM("0");
      map.__gp.clearRouteLayer();
      return;
    }

    map.__gp.calculateRoute();
  };

  const clearAll = () => {
    const map = mapRef.current;
    if (!map?.__gp) return;

    waypoints.current = [];
    routeData.current = null;

    setDistanceKm("0.00");
    setElevationGainM("0");

    map.__gp.clearRouteLayer();
    map.__gp.removeAllMarkers();
  };

  const locateUser = () => {
    const geolocateControl = geolocateControlRef.current;
    if (!geolocateControl) return;

    setLocationState({
      status: "pending",
      message: "Requesting location...",
    });

    geolocateControl.trigger();
  };

  const exportGPX = () => {
    if (!routeData.current) return;

    const gpx = buildGpxFromRouteGeoJson(routeData.current, routeName || "Route");
    if (!gpx) return;

    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${(routeName || "route").replace(/\s+/g, "_")}.gpx`;
    a.click();

    URL.revokeObjectURL(url);
  };

  const saveRoute = () => {
    if (!routeData.current || waypoints.current.length < 2) return;

    const entry = {
      id: activeRouteId || uid(),
      name: routeName || "My Route",
      createdAt: new Date().toISOString(),
      routingMode,
      waypoints: waypoints.current,
      routeGeoJson: routeData.current,
      distanceKm,
      elevationGainM,
    };

    setRoutes((prev) => {
      const exists = prev.find((r) => r.id === entry.id);
      if (exists) return prev.map((r) => (r.id === entry.id ? entry : r));
      return [entry, ...prev];
    });

    setActiveRouteId(entry.id);
  };

  const loadRoute = (id) => {
    const map = mapRef.current;
    if (!map?.__gp) return;

    const r = routes.find((x) => x.id === id);
    if (!r) return;

    setActiveRouteId(r.id);
    setRouteName(r.name);
    setRoutingMode(r.routingMode || (r.gravelMode ? "gravel" : "regular"));

    waypoints.current = (r.waypoints || []).map(([lng, lat]) => [lng, lat]);
    routeData.current = r.routeGeoJson || null;

    setDistanceKm(String(r.distanceKm || "0.00"));
    setElevationGainM(String(r.elevationGainM || "0"));

    map.__gp.renderMarkersFromWaypoints();

    if (routeData.current) {
      // draw route layer immediately
      if (!map.getSource("route")) {
        map.addSource("route", { type: "geojson", data: routeData.current });
        map.addLayer({
          id: "route-hit-area",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#000000",
            "line-width": 18,
            "line-opacity": 0,
          },
        });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": "#ff5500", "line-width": 4 },
        });
      } else {
        map.getSource("route").setData(routeData.current);
      }
    }

    // Fit bounds
    if (waypoints.current.length) {
      const lngs = waypoints.current.map((p) => p[0]);
      const lats = waypoints.current.map((p) => p[1]);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: isMobile ? 80 : 120, duration: 500 }
      );
    }
  };

  const deleteRoute = (id) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    if (activeRouteId === id) {
      setActiveRouteId(null);
      setRouteName("My Route");
      clearAll();
    }
  };

  const newRoute = () => {
    setActiveRouteId(null);
    setRouteName("My Route");
    clearAll();
  };

  const toggleFolderVisibility = (folder) => {
    setVisibleFolders((current) =>
      current.includes(folder) ? current.filter((entry) => entry !== folder) : [...current, folder]
    );
  };

  const updateImportedRouteColor = (routeId, color) => {
    setImportedRoutes((current) =>
      current.map((route) => (route.id === routeId ? { ...route, color } : route))
    );
  };

  const handleGpxUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    const folder = importFolderName.trim();
    if (!files.length || !folder) return;

    const parsedRoutes = (
      await Promise.all(
        files.map(async (file, index) => {
          const text = await file.text();
          const parsed = parseGpxText(text);
          if (!parsed) return null;

          return {
            id: uid(),
            folder,
            name: parsed.name || file.name.replace(/\.gpx$/i, ""),
            fileName: file.name,
            importedAt: new Date().toISOString(),
            color: getDefaultRouteColor(index),
            geoJson: parsed.featureCollection,
          };
        })
      )
    ).filter(Boolean);

    if (!parsedRoutes.length) {
      event.target.value = "";
      return;
    }

    setImportedRoutes((current) => [...parsedRoutes, ...current]);
    setVisibleFolders((current) => (current.includes(folder) ? current : [...current, folder]));
    event.target.value = "";
  };

  const getPressHandlers = (buttonId) => ({
    onMouseDown: () => setPressedButton(buttonId),
    onMouseUp: () => setPressedButton(null),
    onMouseLeave: () => setPressedButton((current) => (current === buttonId ? null : current)),
    onTouchStart: () => setPressedButton(buttonId),
    onTouchEnd: () => setPressedButton(null),
  });

  const panelStyle = {
    position: "absolute",
    left: 10,
    right: isMobile ? 10 : "auto",
    top: isMobile ? "auto" : 10,
    bottom: isMobile ? 10 : "auto",
    width: isMobile ? "auto" : 320,
    background: "rgba(255,255,255,0.8)",
    padding: isMobile ? 14 : 16,
    borderRadius: 16,
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  };

  const btn = {
    padding: isMobile ? "12px 14px" : "10px 12px",
    borderRadius: 12,
    border: "1px solid #d7dce3",
    background: "#fff",
    cursor: "pointer",
    fontSize: isMobile ? 16 : 14,
    color: "#24364b",
  };

  const getButtonStyle = (buttonId, emphasis = false) => ({
    ...btn,
    fontWeight: emphasis ? 600 : 500,
    background: pressedButton === buttonId ? "#24364b" : "#fff",
    color: pressedButton === buttonId ? "#fff" : "#24364b",
    borderColor: pressedButton === buttonId ? "#24364b" : "#d7dce3",
  });

  return (
    <>
      <div ref={mapContainer} style={{ width: "100vw", height: "100vh" }} />

      <div style={panelStyle}>
        <input
          ref={gpxFileInputRef}
          type="file"
          accept=".gpx"
          multiple
          onChange={handleGpxUpload}
          style={{ display: "none" }}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route name"
            style={{
              flex: 1,
              padding: isMobile ? 12 : 11,
              borderRadius: 12,
              border: "1px solid #d7dce3",
              fontSize: isMobile ? 16 : 14,
              color: "#24364b",
              background: "#fff",
            }}
          />
          <button
            style={getButtonStyle("new")}
            onClick={newRoute}
            title="Start a fresh route"
            {...getPressHandlers("new")}
          >
            New
          </button>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <button style={getButtonStyle("undo")} onClick={undoLast} {...getPressHandlers("undo")}>
            Undo
          </button>
          <button style={getButtonStyle("clear")} onClick={clearAll} {...getPressHandlers("clear")}>
            Clear
          </button>
          <button
            style={getButtonStyle("save", true)}
            onClick={saveRoute}
            {...getPressHandlers("save")}
          >
            Save
          </button>
          <button style={getButtonStyle("export")} onClick={exportGPX} {...getPressHandlers("export")}>
            Export GPX
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 10,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "#f5f7fa",
                border: "1px solid #e7ebf0",
              }}
            >
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7a8c" }}>
                Distance
              </div>
              <div style={{ marginTop: 4, fontSize: isMobile ? 24 : 22, fontWeight: 700, color: "#24364b" }}>
                {distanceKm}
                <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#5c6c7c" }}>km</span>
              </div>
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                background: "#f5f7fa",
                border: "1px solid #e7ebf0",
              }}
            >
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7a8c" }}>
                Elevation
              </div>
              <div style={{ marginTop: 4, fontSize: isMobile ? 24 : 22, fontWeight: 700, color: "#24364b" }}>
                {elevationGainM}
                <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#5c6c7c" }}>m</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label
              style={{
                display: "grid",
                gap: 6,
                fontSize: 12,
                color: "#6b7a8c",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Routing mode
              <select
                value={routingMode}
                onChange={(e) => setRoutingMode(e.target.value)}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  border: "1px solid #d7dce3",
                  padding: isMobile ? "11px 12px" : "10px 12px",
                  fontSize: isMobile ? 16 : 14,
                  background: "#fff",
                  color: "#24364b",
                }}
              >
                {Object.entries(ROUTING_MODES).map(([value, option]) => (
                  <option key={value} value={value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <ElevationChart routeGeoJson={routeData.current} />

        <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>GPX library</strong>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{importedRoutes.length}</span>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <input
              value={importFolderName}
              onChange={(e) => setImportFolderName(e.target.value)}
              placeholder="Folder name, e.g. 2024"
              style={{
                width: "100%",
                padding: isMobile ? 12 : 11,
                borderRadius: 12,
                border: "1px solid #d7dce3",
                fontSize: isMobile ? 16 : 14,
                color: "#24364b",
                background: "#fff",
                boxSizing: "border-box",
              }}
            />

            <button
              style={getButtonStyle("upload")}
              onClick={() => gpxFileInputRef.current?.click()}
              {...getPressHandlers("upload")}
            >
              Upload GPX files
            </button>
          </div>

          {availableFolders.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  style={getButtonStyle("folders_all")}
                  onClick={() => setVisibleFolders(availableFolders)}
                  {...getPressHandlers("folders_all")}
                >
                  Show all
                </button>
                <button
                  style={getButtonStyle("folders_none")}
                  onClick={() => setVisibleFolders([])}
                  {...getPressHandlers("folders_none")}
                >
                  Hide all
                </button>
              </div>

              <div style={{ display: "grid", gap: 6, maxHeight: 140, overflow: "auto" }}>
                {availableFolders.map((folder) => {
                  const folderRoutes = importedRoutes.filter((route) => route.folder === folder);
                  const count = folderRoutes.length;
                  const checked = visibleFolders.includes(folder);

                  return (
                    <div
                      key={folder}
                      style={{
                        display: "grid",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 12,
                        background: "#f5f7fa",
                        border: "1px solid #e7ebf0",
                        fontSize: 13,
                        color: "#24364b",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFolderVisibility(folder)}
                          />
                          {folder}
                        </span>
                        <span style={{ opacity: 0.65 }}>{count}</span>
                      </label>

                      <div style={{ display: "grid", gap: 6, paddingLeft: 22 }}>
                        {folderRoutes.map((route) => (
                          <div
                            key={route.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr auto",
                              gap: 8,
                              alignItems: "center",
                              fontSize: 12,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 999,
                                  background: route.color || GPX_ROUTE_COLORS[0],
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={route.name}
                              >
                                {route.name}
                              </span>
                            </div>

                            <input
                              type="color"
                              value={route.color || GPX_ROUTE_COLORS[0]}
                              onChange={(event) => updateImportedRouteColor(route.id, event.target.value)}
                              style={{
                                width: 28,
                                height: 28,
                                padding: 0,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                              title={`Change color for ${route.name}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>No imported GPX routes yet.</div>
          )}
        </div>

        <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Saved routes</strong>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{Array.isArray(routes) ? routes.length : 0}</span>
          </div>

          <div style={{ maxHeight: isMobile ? 180 : 220, overflow: "auto", marginTop: 8 }}>
            {!Array.isArray(routes) || routes.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>No saved routes yet.</div>
            ) : (
              routes.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 8,
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid #f2f2f2",
                  }}
                >
                  <button
                    onClick={() => loadRoute(r.id)}
                    style={{
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: isMobile ? 15 : 13,
                    }}
                    title="Load route"
                  >
                    <div style={{ fontWeight: r.id === activeRouteId ? 700 : 600 }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      {r.distanceKm} km • {r.elevationGainM} m
                    </div>
                  </button>

                  <button
                    style={getButtonStyle(`rename_${r.id}`)}
                    onClick={() => {
                      setRouteName(r.name);
                      setActiveRouteId(r.id);
                      // quick save to update name without changing geometry
                      setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, name: routeName } : x)));
                    }}
                    title="Rename from the name field"
                    {...getPressHandlers(`rename_${r.id}`)}
                  >
                    Rename
                  </button>

                  <button
                    style={getButtonStyle(`delete_${r.id}`)}
                    onClick={() => deleteRoute(r.id)}
                    title="Delete route"
                    {...getPressHandlers(`delete_${r.id}`)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: isMobile ? 108 : 10,
          zIndex: 2,
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 14,
          background: "rgba(255,255,255,0.66)",
          boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        {Object.entries(MAP_STYLES).map(([value, option]) => {
          const active = mapStyle === value;

          return (
            <button
              key={value}
              onClick={() => setMapStyle(value)}
              style={{
                border: "none",
                borderRadius: 11,
                minWidth: isMobile ? 62 : 68,
                padding: isMobile ? "8px 10px" : "8px 11px",
                background: active ? "rgba(36,54,75,0.92)" : "rgba(255,255,255,0.44)",
                color: active ? "#fff" : "#24364b",
                cursor: "pointer",
                fontSize: isMobile ? 12 : 12,
                lineHeight: 1,
                fontWeight: active ? 700 : 600,
                boxShadow: active
                  ? "inset 0 0 0 1px rgba(255,255,255,0.08)"
                  : "inset 0 0 0 1px rgba(36,54,75,0.08)",
              }}
              title={option.label}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <button
        onClick={locateUser}
        title={locationState.message}
        aria-label="Center on my location"
        style={{
          position: "absolute",
          right: 10,
          bottom: isMobile ? 108 : 10,
          zIndex: 2,
          width: isMobile ? 42 : 40,
          height: isMobile ? 42 : 40,
          display: "grid",
          placeItems: "center",
          borderRadius: 999,
          border: "1px solid rgba(15, 23, 42, 0.08)",
          background:
            locationState.status === "active" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.6)",
          boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="5"
            stroke={locationState.status === "active" ? "#1d4ed8" : "#24364b"}
            strokeWidth="1.75"
          />
          <circle
            cx="12"
            cy="12"
            r="1.8"
            fill={locationState.status === "active" ? "#1d4ed8" : "#24364b"}
          />
          <path d="M12 2.75V6.1" stroke={locationState.status === "active" ? "#1d4ed8" : "#24364b"} strokeWidth="1.75" strokeLinecap="round" />
          <path d="M12 17.9V21.25" stroke={locationState.status === "active" ? "#1d4ed8" : "#24364b"} strokeWidth="1.75" strokeLinecap="round" />
          <path d="M2.75 12H6.1" stroke={locationState.status === "active" ? "#1d4ed8" : "#24364b"} strokeWidth="1.75" strokeLinecap="round" />
          <path d="M17.9 12H21.25" stroke={locationState.status === "active" ? "#1d4ed8" : "#24364b"} strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}
