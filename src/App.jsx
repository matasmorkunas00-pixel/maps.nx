import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORAGE_KEY, GPX_LIBRARY_STORAGE_KEY, GPX_ROUTE_COLORS, ROUTING_MODES, MAP_STYLES, MAPTILER_API_KEY } from "./constants";
import { uid } from "./utils/geo";
import { buildGpxFromRouteGeoJson, parseGpxText } from "./utils/gpx";
import { normalizeImportedRoute, normalizeSavedRoute, buildImportedRoutesGeoJson, getDefaultRouteColor } from "./utils/routes";
import { ElevationChart } from "./components/ElevationChart";
import { useMap } from "./hooks/useMap";
import { useStrava } from "./hooks/useStrava";

const STREETS_PREVIEW_URL = "/streets-preview.jpg";
const SATELLITE_PREVIEW_URL = "/satelite-preview.jpg";
const SEARCH_RESULT_LIMIT = 8;

function normalizeMapTilerFeatures(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.filter((feature) => Array.isArray(feature?.center) && feature.center.length === 2);
}

function normalizeNominatimFeatures(payload) {
  const items = Array.isArray(payload) ? payload : [];
  return items
    .filter((item) => Number.isFinite(Number(item?.lon)) && Number.isFinite(Number(item?.lat)))
    .map((item) => {
      const primary =
        item?.namedetails?.name ||
        item?.name ||
        (typeof item?.display_name === "string" ? item.display_name.split(",")[0]?.trim() : "") ||
        "Unnamed place";
      return {
        id: `nominatim-${item.place_id || `${item.lon}-${item.lat}`}`,
        center: [Number(item.lon), Number(item.lat)],
        text: primary,
        place_name: item.display_name || primary,
      };
    });
}

function formatDistanceKm(meters) {
  if (!Number.isFinite(meters)) return "-";
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "-";

  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatSpeed(speedMetersPerSecond) {
  if (!Number.isFinite(speedMetersPerSecond)) return "-";
  return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h`;
}

function formatMeters(meters) {
  if (!Number.isFinite(meters)) return "-";
  return `${Math.round(meters).toLocaleString()} m`;
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatActivityDate(dateString) {
  if (!dateString) return "Unknown date";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHeartRate(bpm) {
  if (!Number.isFinite(bpm)) return "-";
  return `${Math.round(bpm)} bpm`;
}

function sampleSeries(values, maxPoints = 72) {
  if (!Array.isArray(values) || values.length <= maxPoints) return values;
  const step = values.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, index) => values[Math.min(values.length - 1, Math.floor(index * step))]);
}

function buildSparkline(values, width = 320, height = 112, padding = 10) {
  if (!Array.isArray(values) || values.length < 2) return null;

  const sampled = sampleSeries(values, 72);
  const minValue = Math.min(...sampled);
  const maxValue = Math.max(...sampled);
  const domainMin = Math.min(minValue, 90);
  const domainMax = Math.max(maxValue, domainMin + 20);
  const range = Math.max(domainMax - domainMin, 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = sampled.map((value, index) => {
    const x = padding + (innerWidth * index) / Math.max(sampled.length - 1, 1);
    const y = height - padding - ((value - domainMin) / range) * innerHeight;
    return [x, y];
  });

  const linePath = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(2)},${(height - padding).toFixed(2)} L${points[0][0].toFixed(2)},${(height - padding).toFixed(2)} Z`;

  return {
    linePath,
    areaPath,
    minValue,
    maxValue,
    latestValue: sampled[sampled.length - 1],
    averageValue: sampled.reduce((sum, value) => sum + value, 0) / sampled.length,
  };
}

export default function App() {
  const appleMapContainerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const gpxFileInputRef = useRef(null);
  const quickMenuRef = useRef(null);
  const styleControlsRef = useRef(null);
  const searchBoxRef = useRef(null);
  const skipNextSearchRef = useRef(false);

  const [routeName, setRouteName] = useState("My Route");
  const [routingMode, setRoutingMode] = useState("gravel");
  const [mapStyle, setMapStyle] = useState("streets");
  const [pressedButton, setPressedButton] = useState(null);
  const [importFolderName, setImportFolderName] = useState("");
  const [visibleFolders, setVisibleFolders] = useState(null);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [speedMode, setSpeedMode] = useState(false);
  const [activeMenuPanel, setActiveMenuPanel] = useState(null);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [visibleStravaTypes, setVisibleStravaTypes] = useState(null);
  const [visibleStravaYears, setVisibleStravaYears] = useState(null);
  const [selectedStravaActivity, setSelectedStravaActivity] = useState(null);
  const [isStravaActivityLoading, setIsStravaActivityLoading] = useState(false);
  const [isMapModesFlashOn, setIsMapModesFlashOn] = useState(false);
  const [isLocationFlashOn, setIsLocationFlashOn] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

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
    const onPointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) {
        setIsSearchDropdownOpen(false);
      }
      if (!quickMenuRef.current?.contains(event.target)) {
        setActiveMenuPanel(null);
      }
      if (!styleControlsRef.current?.contains(event.target)) {
        setIsStyleMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (activeMenuPanel !== "search") setIsSearchDropdownOpen(false);
  }, [activeMenuPanel]);

  useEffect(() => {
    if (!isMapModesFlashOn) return;
    const timer = setTimeout(() => setIsMapModesFlashOn(false), 200);
    return () => clearTimeout(timer);
  }, [isMapModesFlashOn]);

  useEffect(() => {
    if (!isLocationFlashOn) return;
    const timer = setTimeout(() => setIsLocationFlashOn(false), 200);
    return () => clearTimeout(timer);
  }, [isLocationFlashOn]);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchLoading(true);
      setSearchError(null);
      try {
        const providers = [];

        if (MAPTILER_API_KEY) {
          providers.push(async () => {
            const response = await fetch(
              `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_API_KEY}&autocomplete=true&fuzzyMatch=true&limit=${SEARCH_RESULT_LIMIT}&types=address,poi,place,locality,neighborhood,street`,
              { signal: controller.signal }
            );
            if (!response.ok) throw new Error(`MapTiler search failed (${response.status})`);
            const payload = await response.json();
            return normalizeMapTilerFeatures(payload);
          });
        }

        providers.push(async () => {
          const language =
            typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=${SEARCH_RESULT_LIMIT}&addressdetails=1&namedetails=1&extratags=1&accept-language=${encodeURIComponent(language)}`,
            { signal: controller.signal }
          );
          if (!response.ok) throw new Error(`Nominatim search failed (${response.status})`);
          const payload = await response.json();
          return normalizeNominatimFeatures(payload);
        });

        let features = [];
        let allFailed = true;
        for (const runSearch of providers) {
          try {
            const found = await runSearch();
            allFailed = false;
            if (found.length) {
              features = found;
              break;
            }
          } catch (providerError) {
            if (providerError?.name === "AbortError") throw providerError;
          }
        }

        if (allFailed) throw new Error("All search providers failed");
        setSearchResults(features);
        setIsSearchDropdownOpen(true);
      } catch (error) {
        if (error?.name === "AbortError") return;
        setSearchResults([]);
        setSearchError("Place search unavailable. Check your internet and try again.");
      } finally {
        setIsSearchLoading(false);
      }
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const [routes, setRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw).map((r, i) => normalizeSavedRoute(r, i)).filter(Boolean) : [];
    } catch { return []; }
  });

  const [importedRoutes, setImportedRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(GPX_LIBRARY_STORAGE_KEY);
      return raw ? JSON.parse(raw).map((r, i) => normalizeImportedRoute(r, i)).filter(Boolean) : [];
    } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(routes)); }, [routes]);
  useEffect(() => { localStorage.setItem(GPX_LIBRARY_STORAGE_KEY, JSON.stringify(importedRoutes)); }, [importedRoutes]);

  const availableFolders = useMemo(
    () =>
      Array.from(new Set(importedRoutes.map((r) => r?.folder).filter((f) => typeof f === "string" && f.trim()))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [importedRoutes]
  );

  const activeVisibleFolders = useMemo(
    () =>
      visibleFolders === null
        ? availableFolders
        : visibleFolders.filter((folder) => availableFolders.includes(folder)),
    [visibleFolders, availableFolders]
  );

  const importedRoutesGeoJson = useMemo(
    () => buildImportedRoutesGeoJson(importedRoutes, activeVisibleFolders),
    [importedRoutes, activeVisibleFolders]
  );

  const {
    isConnected: stravaConnected,
    athleteName: stravaAthleteName,
    activitiesGeoJson: stravaActivitiesGeoJson,
    isLoading: stravaLoading,
    error: stravaError,
    connect: stravaConnect,
    disconnect: stravaDisconnect,
    loadActivities: stravaLoadActivities,
    loadActivityDetails: stravaLoadActivityDetails,
  } = useStrava();

  const stravaFeatures = useMemo(() => stravaActivitiesGeoJson?.features || [], [stravaActivitiesGeoJson]);

  const availableStravaTypes = useMemo(
    () =>
      Array.from(
        new Set(
          stravaFeatures
            .map((feature) => feature?.properties?.activityType)
            .filter((value) => typeof value === "string" && value.trim())
        )
      ).sort((a, b) => a.localeCompare(b)),
    [stravaFeatures]
  );

  const availableStravaYears = useMemo(
    () =>
      Array.from(
        new Set(
          stravaFeatures
            .map((feature) => feature?.properties?.year)
            .filter((value) => Number.isFinite(value))
        )
      ).sort((a, b) => b - a),
    [stravaFeatures]
  );

  const activeVisibleStravaTypes = useMemo(
    () =>
      visibleStravaTypes === null
        ? availableStravaTypes
        : visibleStravaTypes.filter((type) => availableStravaTypes.includes(type)),
    [visibleStravaTypes, availableStravaTypes]
  );

  const activeVisibleStravaYears = useMemo(
    () =>
      visibleStravaYears === null
        ? availableStravaYears
        : visibleStravaYears.filter((year) => availableStravaYears.includes(year)),
    [visibleStravaYears, availableStravaYears]
  );

  const stravaTypeCounts = useMemo(
    () =>
      stravaFeatures.reduce((counts, feature) => {
        const type = feature?.properties?.activityType;
        if (typeof type === "string" && type.trim()) {
          counts[type] = (counts[type] || 0) + 1;
        }
        return counts;
      }, {}),
    [stravaFeatures]
  );

  const stravaYearCounts = useMemo(
    () =>
      stravaFeatures.reduce((counts, feature) => {
        const year = feature?.properties?.year;
        if (Number.isFinite(year)) {
          counts[year] = (counts[year] || 0) + 1;
        }
        return counts;
      }, {}),
    [stravaFeatures]
  );

  const filteredStravaActivitiesGeoJson = useMemo(() => {
    if (!stravaActivitiesGeoJson) return null;

    return {
      ...stravaActivitiesGeoJson,
      features: stravaFeatures.filter((feature) => {
        const type = feature?.properties?.activityType;
        const year = feature?.properties?.year;
        return activeVisibleStravaTypes.includes(type) && activeVisibleStravaYears.includes(year);
      }),
    };
  }, [
    stravaActivitiesGeoJson,
    stravaFeatures,
    activeVisibleStravaTypes,
    activeVisibleStravaYears,
  ]);

  const filteredStravaCount = filteredStravaActivitiesGeoJson?.features?.length || 0;
  const filteredStravaFeatures = useMemo(
    () => filteredStravaActivitiesGeoJson?.features || [],
    [filteredStravaActivitiesGeoJson]
  );
  const selectedStravaActivityId = selectedStravaActivity?.id ?? null;
  const mapStravaActivitiesGeoJson = useMemo(() => {
    if (!stravaActivitiesGeoJson) return null;
    if (!selectedStravaActivityId) return filteredStravaActivitiesGeoJson;

    const selectedFeature = stravaFeatures.find((feature) => feature?.properties?.id === selectedStravaActivityId);
    return {
      ...stravaActivitiesGeoJson,
      features: selectedFeature ? [selectedFeature] : [],
    };
  }, [
    filteredStravaActivitiesGeoJson,
    selectedStravaActivityId,
    stravaActivitiesGeoJson,
    stravaFeatures,
  ]);
  const sortedFilteredStravaFeatures = useMemo(
    () =>
      [...filteredStravaFeatures].sort((a, b) => {
        const aDate = new Date(a?.properties?.startDateLocal || a?.properties?.startDate || 0).getTime();
        const bDate = new Date(b?.properties?.startDateLocal || b?.properties?.startDate || 0).getTime();
        return bDate - aDate;
      }),
    [filteredStravaFeatures]
  );
  const selectedStravaStats = useMemo(() => {
    if (!selectedStravaActivity) return [];

    return [
      { label: "Distance", value: formatDistanceKm(selectedStravaActivity.distance) },
      { label: "Moving time", value: formatDuration(selectedStravaActivity.moving_time) },
      { label: "Elapsed time", value: formatDuration(selectedStravaActivity.elapsedTime) },
      { label: "Elevation", value: formatMeters(selectedStravaActivity.totalElevationGain) },
      { label: "Avg speed", value: formatSpeed(selectedStravaActivity.averageSpeed) },
      { label: "Max speed", value: formatSpeed(selectedStravaActivity.maxSpeed) },
    ];
  }, [selectedStravaActivity]);
  const selectedStravaDescription = selectedStravaActivity?.description?.trim() || "";
  const selectedStravaHeartrateStream = useMemo(() => {
    if (!Array.isArray(selectedStravaActivity?.heartrateStream)) return [];
    return selectedStravaActivity.heartrateStream.filter((value) => Number.isFinite(value));
  }, [selectedStravaActivity]);
  const selectedStravaHeartRateChart = useMemo(
    () => buildSparkline(selectedStravaHeartrateStream),
    [selectedStravaHeartrateStream]
  );
  const selectedStravaAverageHeartRate = Number.isFinite(selectedStravaActivity?.averageHeartrate)
    ? selectedStravaActivity.averageHeartrate
    : selectedStravaHeartRateChart?.averageValue ?? null;
  const selectedStravaMaxHeartRate = Number.isFinite(selectedStravaActivity?.maxHeartrate)
    ? selectedStravaActivity.maxHeartrate
    : selectedStravaHeartRateChart?.maxValue ?? null;
  const selectedStravaLatestHeartRate = selectedStravaHeartRateChart?.latestValue ?? null;

  const selectedStravaPrimaryPhotoUrl = useMemo(() => {
    const urls = selectedStravaActivity?.primaryPhotoUrls;
    if (!urls || typeof urls !== "object") return null;
    return urls["600"] || urls["2800"] || urls["100"] || Object.values(urls)[0] || null;
  }, [selectedStravaActivity]);
  const selectedStravaPhotoMarkers = useMemo(() => {
    if (!selectedStravaActivity?.id || !selectedStravaPrimaryPhotoUrl) return [];

    const totalPhotoCount = Number.isFinite(selectedStravaActivity.totalPhotoCount)
      ? Math.max(1, selectedStravaActivity.totalPhotoCount)
      : 1;

    return [
      {
        id: `${selectedStravaActivity.id}-primary-photo`,
        imageUrl: selectedStravaPrimaryPhotoUrl,
        totalPhotoCount,
        progress: 0.52,
        showCountBadge: false,
      },
    ];
  }, [selectedStravaActivity, selectedStravaPrimaryPhotoUrl]);

  useEffect(() => {
    if (!selectedStravaActivity) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedStravaActivity(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedStravaActivity]);

  useEffect(() => {
    if (!stravaConnected && selectedStravaActivity) {
      setSelectedStravaActivity(null);
      setIsStravaActivityLoading(false);
    }
  }, [stravaConnected, selectedStravaActivity]);

  const closeStravaActivityModal = () => {
    setSelectedStravaActivity(null);
    setIsStravaActivityLoading(false);
  };

  const openStravaActivity = async (feature) => {
    const summary = feature?.properties;
    if (!summary?.id) return;

    setSelectedStravaActivity(summary);
    setIsStravaActivityLoading(true);

    const details = await stravaLoadActivityDetails(summary.id);
    setSelectedStravaActivity((current) =>
      current?.id === summary.id && details ? { ...current, ...details } : current
    );
    setIsStravaActivityLoading(false);
  };

  const {
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
  } = useMap({
    appleMapContainerRef,
    mapContainerRef,
    mapStyle,
    importedRoutesGeoJson,
    stravaActivitiesGeoJson: mapStravaActivitiesGeoJson,
    selectedStravaActivityId,
    selectedStravaPhotoMarkers,
    routingMode,
    isMobile,
    speedMode,
  });

  // ---------- Route management ----------

  const saveRoute = () => {
    if (!routeDataRef.current || waypointsRef.current.length < 2) return;
    const entry = {
      id: activeRouteId || uid(),
      name: routeName || "My Route",
      createdAt: new Date().toISOString(),
      routingMode,
      waypoints: waypointsRef.current,
      routeGeoJson: routeDataRef.current,
      distanceKm,
      elevationGainM,
    };
    setRoutes((prev) => {
      const exists = prev.find((r) => r.id === entry.id);
      return exists ? prev.map((r) => (r.id === entry.id ? entry : r)) : [entry, ...prev];
    });
    setActiveRouteId(entry.id);
  };

  const loadRoute = (id) => {
    const r = routes.find((x) => x.id === id);
    if (!r) return;
    setActiveRouteId(r.id);
    setRouteName(r.name);
    setRoutingMode(r.routingMode || (r.gravelMode ? "gravel" : "regular"));
    loadRouteOnMap(r);
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

  const exportGPX = () => {
    if (!routeDataRef.current) return;
    const gpx = buildGpxFromRouteGeoJson(routeDataRef.current, routeName || "Route");
    if (!gpx) return;
    const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(routeName || "route").replace(/\s+/g, "_")}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
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

    if (!parsedRoutes.length) { event.target.value = ""; return; }
    setImportedRoutes((current) => [...parsedRoutes, ...current]);
    setVisibleFolders((current) => {
      if (current === null) return null;
      return current.includes(folder) ? current : [...current, folder];
    });
    event.target.value = "";
  };

  const toggleFolderVisibility = (folder) => {
    setVisibleFolders((current) => {
      const base = current === null ? availableFolders : current;
      return base.includes(folder) ? base.filter((entry) => entry !== folder) : [...base, folder];
    });
  };

  const updateImportedRouteColor = (routeId, color) => {
    setImportedRoutes((current) => current.map((r) => (r.id === routeId ? { ...r, color } : r)));
  };

  const getSearchResultLabels = (feature) => {
    const primary = feature?.text || feature?.place_name || "Unnamed place";
    const secondary = feature?.place_name && feature.place_name !== primary ? feature.place_name : "";
    return { primary, secondary };
  };

  const handleSearchSelect = async (feature) => {
    if (!Array.isArray(feature?.center) || feature.center.length < 2) return;
    const label = feature?.place_name || feature?.text || "";
    skipNextSearchRef.current = true;
    setSearchQuery(label);
    setIsSearchDropdownOpen(false);
    setSearchError(null);
    const routeResult = await routeToDestination(feature.center);
    if (!routeResult?.ok) {
      setSearchError(routeResult?.message || "Could not route to that place.");
    }
  };

  const handleSearchKeyDown = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!searchResults.length) return;
    await handleSearchSelect(searchResults[0]);
  };

  const toggleStravaTypeVisibility = (type) => {
    setVisibleStravaTypes((current) => {
      const base = current === null ? availableStravaTypes : current;
      return base.includes(type) ? base.filter((entry) => entry !== type) : [...base, type];
    });
  };

  const toggleStravaYearVisibility = (year) => {
    setVisibleStravaYears((current) => {
      const base = current === null ? availableStravaYears : current;
      return base.includes(year) ? base.filter((entry) => entry !== year) : [...base, year];
    });
  };
  const toggleMenuPanel = (panelKey) => {
    setActiveMenuPanel((current) => (current === panelKey ? null : panelKey));
  };

  // ---------- UI helpers ----------

  const getPressHandlers = (buttonId) => ({
    onMouseDown: () => setPressedButton(buttonId),
    onMouseUp: () => setPressedButton(null),
    onMouseLeave: () => setPressedButton((cur) => (cur === buttonId ? null : cur)),
    onTouchStart: () => setPressedButton(buttonId),
    onTouchEnd: () => setPressedButton(null),
  });

  const btn = {
    padding: isMobile ? "12px 14px" : "10px 12px",
    borderRadius: 12,
    border: "1px solid #d7dce3",
    background: "#fff",
    cursor: "pointer",
    fontSize: isMobile ? 16 : 14,
    color: "#000",
  };

  const getButtonStyle = (buttonId, emphasis = false) => ({
    ...btn,
    fontWeight: emphasis ? 600 : 500,
    background: pressedButton === buttonId ? "#eef2f7" : "#fff",
    color: "#000",
    borderColor: pressedButton === buttonId ? "#000" : "#d7dce3",
  });

  const inputStyle = {
    borderRadius: 12,
    border: "1px solid #d7dce3",
    fontSize: isMobile ? 16 : 14,
    color: "#000",
    background: "#fff",
  };
  const menuIconSize = isMobile ? 46 : 44;
  const menuIconGap = 10;
  const expandedMenuCardStyle = {
    width: isMobile ? "min(calc(100vw - 84px), 308px)" : 308,
    maxHeight: isMobile ? "58vh" : "62vh",
    overflowY: "auto",
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(15, 23, 42, 0.1)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.16)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    animation: "quick-panel-in 0.2s ease both",
    color: "#000",
  };
  const expandedMenuFloatingStyle = {
    ...expandedMenuCardStyle,
    position: "absolute",
    left: menuIconSize + menuIconGap,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 5,
    animation: "quick-panel-float-in 0.2s ease both",
  };
  const getMenuIconButtonStyle = (panelKey) => ({
    width: menuIconSize,
    height: menuIconSize,
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    display: "grid",
    placeItems: "center",
    background: activeMenuPanel === panelKey ? "#dbe2ec" : "rgba(255,255,255,0.92)",
    cursor: "pointer",
    padding: 0,
    transition: "background-color 0.18s ease, transform 0.18s ease",
    outline: "none",
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
    WebkitTapHighlightColor: "transparent",
    transform: activeMenuPanel === panelKey ? "scale(0.97)" : "scale(1)",
  });
  const isStravaActivityOpen = !!selectedStravaActivity && stravaConnected;

  // ---------- Render ----------

  return (
    <>
      <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
        <div
          ref={appleMapContainerRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 0.18s ease",
          }}
        />
        <div
          ref={mapContainerRef}
          style={{
            position: "absolute",
            inset: 0,
          }}
        />
      </div>

      <input ref={gpxFileInputRef} type="file" accept=".gpx" multiple onChange={handleGpxUpload} style={{ display: "none" }} />

      {activeMenuPanel === "route" && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            width: isMobile ? "calc(100vw - 20px)" : 320,
            pointerEvents: "none",
            animation: "route-stats-fade-in 0.22s ease both",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(
              ({ label, value, unit }) => (
                <div
                  key={label}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(245,247,250,0.82)",
                    border: "1px solid rgba(231,235,240,0.85)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#000" }}>{label}</div>
                  <div style={{ marginTop: 4, fontSize: isMobile ? 24 : 22, fontWeight: 700, color: "#000" }}>
                    {value}
                    <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#000" }}>{unit}</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <div
        ref={quickMenuRef}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 3,
          display: isStravaActivityOpen ? "none" : "grid",
          gap: 10,
          alignItems: "start",
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
          <button
            onClick={() => toggleMenuPanel("search")}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Search places"
            style={getMenuIconButtonStyle("search")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#24364b" strokeWidth="1.8" />
              <path d="M16.5 16.5L21 21" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {activeMenuPanel === "search" && (
            <div style={expandedMenuFloatingStyle}>
              <div ref={searchBoxRef} style={{ position: "relative" }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length || searchQuery.trim().length >= 2) setIsSearchDropdownOpen(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search address, shops, tourist places..."
                  style={{ ...inputStyle, width: "100%", padding: isMobile ? "12px 42px 12px 12px" : "11px 40px 11px 12px", boxSizing: "border-box" }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#506176",
                    pointerEvents: "none",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                {isSearchDropdownOpen && (isSearchLoading || searchResults.length > 0 || searchQuery.trim().length >= 2) && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      right: 0,
                      zIndex: 6,
                      borderRadius: 12,
                      border: "1px solid rgba(15, 23, 42, 0.12)",
                      background: "rgba(255,255,255,0.97)",
                      boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)",
                      overflow: "hidden",
                    }}
                  >
                    {isSearchLoading ? (
                      <div style={{ padding: "10px 12px", fontSize: 12, color: "#506176" }}>Searching places...</div>
                    ) : searchResults.length === 0 ? (
                      <div style={{ padding: "10px 12px", fontSize: 12, color: "#506176" }}>No places found</div>
                    ) : (
                      <div style={{ maxHeight: 250, overflowY: "auto" }}>
                        {searchResults.map((feature) => {
                          const { primary, secondary } = getSearchResultLabels(feature);
                          return (
                            <button
                              key={`${feature.id || feature.place_name}-${feature.center[0]}-${feature.center[1]}`}
                              onClick={() => handleSearchSelect(feature)}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                border: "none",
                                background: "transparent",
                                padding: "10px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
                              }}
                            >
                              <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>{primary}</div>
                              {secondary && <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>{secondary}</div>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {searchError && <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{searchError}</div>}
            </div>
          )}
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
          <button
            onClick={() => toggleMenuPanel("route")}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Route tools"
            style={getMenuIconButtonStyle("route")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="6" cy="18" r="2.2" fill="#24364b" />
              <circle cx="18" cy="6" r="2.2" fill="#24364b" />
              <path d="M8.2 17.1C12.8 16 10.3 8.9 15.8 7.2" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {activeMenuPanel === "route" && (
            <div style={expandedMenuFloatingStyle}>
              {routingError && (
                <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12 }}>
                  {routingError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="Route name"
                  style={{ ...inputStyle, flex: 1, padding: isMobile ? 12 : 10 }}
                />
                <button style={getButtonStyle("new")} onClick={newRoute} {...getPressHandlers("new")}>New</button>
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button style={getButtonStyle("undo")} onClick={undoLast} {...getPressHandlers("undo")}>Undo</button>
                <button style={getButtonStyle("clear")} onClick={clearAll} {...getPressHandlers("clear")}>Clear</button>
                <button style={getButtonStyle("save", true)} onClick={saveRoute} disabled={isRouting} {...getPressHandlers("save")}>Save</button>
                <button style={getButtonStyle("export")} onClick={exportGPX} {...getPressHandlers("export")}>Export GPX</button>
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ display: "grid", gap: 5, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>
                  Routing mode
                  <select value={routingMode} onChange={(e) => setRoutingMode(e.target.value)} style={{ ...inputStyle, width: "100%", padding: 10 }}>
                    {Object.entries(ROUTING_MODES).map(([value, opt]) => (
                      <option key={value} value={value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {isRouting && <div style={{ marginTop: 8, fontSize: 12, color: "#334155", textAlign: "center" }}>Calculating route...</div>}
              {routeGeoJson && <div style={{ marginTop: 8 }}><ElevationChart routeGeoJson={routeGeoJson} /></div>}
            </div>
          )}
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
          <button
            onClick={() => toggleMenuPanel("speed")}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Speed mode"
            style={getMenuIconButtonStyle("speed")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M13 2L4 13H10L9 22L20 9H14L13 2Z" fill="#24364b" />
            </svg>
          </button>
          {activeMenuPanel === "speed" && (
            <div style={expandedMenuFloatingStyle}>
              <button
                onClick={() => setSpeedMode((on) => !on)}
                style={{
                  marginTop: 2,
                  width: "100%",
                  padding: isMobile ? "12px 14px" : "10px 12px",
                  borderRadius: 12,
                  border: "2px solid transparent",
                  cursor: "pointer",
                  fontSize: isMobile ? 16 : 14,
                  fontWeight: 700,
                  backgroundImage: speedMode ? "linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00cc00,#0088ff,#8800ff,#ff0000)" : "none",
                  background: speedMode ? undefined : "#fff",
                  color: "#000",
                  textShadow: "none",
                  backgroundSize: "200% 100%",
                  animation: speedMode ? "rainbow-bg 1.6s linear infinite" : "none",
                }}
              >
                {speedMode ? "⚡ Speed Mode ON" : "Enable Speed Mode"}
              </button>
              <div style={{ marginTop: 8, fontSize: 12, color: "#5b6b7e" }}>
                Speed mode keeps route logic the same and applies a colorful visual effect.
              </div>
            </div>
          )}
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
          <button
            onClick={() => toggleMenuPanel("library")}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="GPX library"
            style={getMenuIconButtonStyle("library")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3.5 7.5C3.5 6.4 4.4 5.5 5.5 5.5H10L12 7.5H18.5C19.6 7.5 20.5 8.4 20.5 9.5V16.5C20.5 17.6 19.6 18.5 18.5 18.5H5.5C4.4 18.5 3.5 17.6 3.5 16.5V7.5Z" stroke="#24364b" strokeWidth="1.7" />
            </svg>
          </button>
          {activeMenuPanel === "library" && (
            <div style={expandedMenuFloatingStyle}>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  value={importFolderName}
                  onChange={(e) => setImportFolderName(e.target.value)}
                  placeholder="Folder name, e.g. 2024"
                  style={{ ...inputStyle, width: "100%", padding: isMobile ? 12 : 11, boxSizing: "border-box" }}
                />
                <button style={getButtonStyle("upload")} onClick={() => gpxFileInputRef.current?.click()} {...getPressHandlers("upload")}>
                  Upload GPX files
                </button>
              </div>
              {availableFolders.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button style={getButtonStyle("folders_all")} onClick={() => setVisibleFolders(availableFolders)} {...getPressHandlers("folders_all")}>Show all</button>
                    <button style={getButtonStyle("folders_none")} onClick={() => setVisibleFolders([])} {...getPressHandlers("folders_none")}>Hide all</button>
                  </div>
                  <div style={{ display: "grid", gap: 6, maxHeight: 210, overflow: "auto" }}>
                    {availableFolders.map((folder) => {
                      const folderRoutes = importedRoutes.filter((r) => r.folder === folder);
                      const checked = activeVisibleFolders.includes(folder);
                      return (
                        <div key={folder} style={{ display: "grid", gap: 8, padding: "8px 10px", borderRadius: 12, background: "#f5f7fa", border: "1px solid #e7ebf0", fontSize: 13, color: "#000" }}>
                          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleFolderVisibility(folder)} />
                              {folder}
                            </span>
                            <span style={{ opacity: 0.65 }}>{folderRoutes.length}</span>
                          </label>
                          <div style={{ display: "grid", gap: 6, paddingLeft: 22 }}>
                            {folderRoutes.map((route) => (
                              <div key={route.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", fontSize: 12 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: 999, background: route.color || GPX_ROUTE_COLORS[0], flexShrink: 0 }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={route.name}>{route.name}</span>
                                </div>
                                <input
                                  type="color"
                                  value={route.color || GPX_ROUTE_COLORS[0]}
                                  onChange={(e) => updateImportedRouteColor(route.id, e.target.value)}
                                  style={{ width: 28, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
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
              <div style={{ marginTop: 10, borderTop: "1px solid #e6e8ed", paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>Saved routes</strong>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{routes.length}</span>
                </div>
                <div style={{ maxHeight: 170, overflow: "auto", marginTop: 6 }}>
                  {routes.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>No saved routes yet.</div>
                  ) : (
                    routes.map((r) => (
                      <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #eef1f4" }}>
                        <button
                          onClick={() => loadRoute(r.id)}
                          style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 12 }}
                          title="Load route"
                        >
                          <div style={{ fontWeight: r.id === activeRouteId ? 700 : 600 }}>{r.name}</div>
                          <div style={{ fontSize: 11, opacity: 0.68 }}>{r.distanceKm} km • {r.elevationGainM} m</div>
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
              <div style={{ marginTop: 10, borderTop: "1px solid #e6e8ed", paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FC4C02" aria-hidden="true"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
                    Strava
                  </strong>
                  {stravaConnected && (
                    <span style={{ fontSize: 12, opacity: 0.65 }}>
                      {stravaActivitiesGeoJson ? `${stravaActivitiesGeoJson.features.length} rides` : "0 rides"}
                    </span>
                  )}
                </div>

                {stravaError && (
                  <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 12 }}>
                    {stravaError}
                  </div>
                )}

                {stravaLoading && (
                  <div style={{ marginBottom: 8, fontSize: 12, color: "#6b7a8c", textAlign: "center" }}>
                    {stravaConnected ? "Loading rides…" : "Connecting…"}
                  </div>
                )}

                {!stravaConnected ? (
                  <button
                    style={{
                      ...getButtonStyle("strava_connect"),
                      width: "100%",
                      background: pressedButton === "strava_connect" ? "#e34200" : "#FC4C02",
                      color: "#fff",
                      border: "none",
                      fontWeight: 600,
                    }}
                    onClick={stravaConnect}
                    {...getPressHandlers("strava_connect")}
                  >
                    Connect Strava
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {stravaAthleteName && (
                      <div style={{ fontSize: 12, color: "#6b7a8c" }}>Connected as <strong>{stravaAthleteName}</strong></div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                      <button
                        style={{ ...getButtonStyle("strava_sync"), fontWeight: 600 }}
                        onClick={stravaLoadActivities}
                        disabled={stravaLoading}
                        {...getPressHandlers("strava_sync")}
                      >
                        {stravaLoading ? "Syncing…" : "Sync rides"}
                      </button>
                      <button
                        style={getButtonStyle("strava_disconnect")}
                        onClick={stravaDisconnect}
                        {...getPressHandlers("strava_disconnect")}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      <div
        ref={styleControlsRef}
        style={{
          position: "absolute",
          left: 10,
          bottom: isMobile ? 108 : 10,
          zIndex: 2,
          display: isStravaActivityOpen ? "none" : "grid",
          gap: 8,
        }}
      >
        {isStyleMenuOpen && (
          <div
            style={{
              width: isMobile ? 111 : 117,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
              padding: 6,
              borderRadius: 12,
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              transition: "transform 0.16s ease, opacity 0.16s ease",
            }}
          >
            <button
              onClick={() => setMapStyle("streets")}
              onMouseUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
              style={{
                display: "grid",
                gap: 6,
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: "#24364b",
                outline: "none",
                boxShadow: "none",
                WebkitTapHighlightColor: "transparent",
              }}
              title={MAP_STYLES.streets.label}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: mapStyle === "streets" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)",
                  boxShadow: mapStyle === "streets" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none",
                }}
              >
                <img
                  src={STREETS_PREVIEW_URL}
                  alt="Streets map preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Default</div>
            </button>

            <button
              onClick={() => setMapStyle("satellite")}
              onMouseUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
              style={{
                display: "grid",
                gap: 6,
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: "#24364b",
                outline: "none",
                boxShadow: "none",
                WebkitTapHighlightColor: "transparent",
              }}
              title={MAP_STYLES.satellite.label}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: mapStyle === "satellite" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)",
                  boxShadow: mapStyle === "satellite" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none",
                }}
              >
                <img
                  src={SATELLITE_PREVIEW_URL}
                  alt="Satellite map preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Satellite</div>
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
          }}
        >
          <button
            onClick={() => {
              setIsMapModesFlashOn(true);
              setIsStyleMenuOpen((open) => !open);
            }}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Map style options"
            style={{
              width: isMobile ? 44 : 42,
              height: isMobile ? 44 : 42,
              borderRadius: 999,
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              placeItems: "center",
              background: isMapModesFlashOn ? "#dbe2ec" : "rgba(255,255,255,0.92)",
              cursor: "pointer",
              padding: 0,
              transition: "background-color 0.2s ease",
              outline: "none",
              boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3.75 6.25L8.95 3.6C9.29 3.43 9.69 3.43 10.03 3.6L14 5.62L18.95 3.6C19.71 3.29 20.5 3.84 20.5 4.66V17.75L15.05 20.4C14.71 20.57 14.31 20.57 13.97 20.4L10 18.38L5.05 20.4C4.29 20.71 3.5 20.16 3.5 19.34V6.75C3.5 6.54 3.61 6.35 3.75 6.25Z" fill="#24364b" />
              <path d="M10 3.75V18.25M14 5.62V20.25" stroke="rgba(255,255,255,0.45)" strokeWidth="1.15" />
            </svg>
          </button>

          <button
            onClick={() => {
              setIsLocationFlashOn(true);
              setIsStyleMenuOpen(false);
              locateUser();
            }}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            title={locationState.message}
            aria-label="Center on my location"
            style={{
              width: isMobile ? 44 : 42,
              height: isMobile ? 44 : 42,
              borderRadius: 999,
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              placeItems: "center",
              background: isLocationFlashOn ? "#dbe2ec" : "rgba(255,255,255,0.92)",
              cursor: "pointer",
              padding: 0,
              transition: "background-color 0.2s ease",
              outline: "none",
              boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 4L11 13M20 4L14.5 20L11 13L4 9.5L20 4Z"
                stroke="#24364b"
                strokeWidth="1.9"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>

        </div>
      </div>

      {selectedStravaActivity && stravaConnected && (
        <div
          style={{
            position: "fixed",
            zIndex: 30,
            pointerEvents: "none",
            top: isMobile ? "auto" : 18,
            left: isMobile ? 12 : 18,
            bottom: 12,
            right: isMobile ? 12 : "auto",
            display: "flex",
            alignItems: isMobile ? "flex-end" : "flex-start",
            justifyContent: isMobile ? "center" : "flex-start",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              width: "100%",
              maxWidth: isMobile ? "100%" : 376,
              maxHeight: isMobile ? "52vh" : "calc(100vh - 36px)",
              overflowY: "auto",
              borderRadius: isMobile ? 18 : 20,
              background: "rgba(255,255,255,0.94)",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
              border: "1px solid rgba(255,255,255,0.72)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              padding: isMobile ? 12 : 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      padding: "4px 8px",
                      background: "rgba(252,76,2,0.12)",
                      color: "#FC4C02",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {selectedStravaActivity.activityType || "Other"}
                  </span>
                  {Number.isFinite(selectedStravaActivity.year) && (
                    <span style={{ fontSize: 12, color: "#6b7a8c" }}>{selectedStravaActivity.year}</span>
                  )}
                </div>
                <div style={{ marginTop: 8, fontSize: isMobile ? 18 : 20, fontWeight: 800, color: "#24364b", lineHeight: 1.15 }}>
                  {selectedStravaActivity.name || "Unnamed activity"}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: "#5c6c7c" }}>
                  {formatActivityDate(selectedStravaActivity.startDateLocal || selectedStravaActivity.startDate)}
                </div>
              </div>

              <button
                onClick={closeStravaActivityModal}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  border: "1px solid rgba(15, 23, 42, 0.08)",
                  background: "rgba(255,255,255,0.9)",
                  cursor: "pointer",
                  fontSize: 17,
                  lineHeight: 1,
                  color: "#24364b",
                  flexShrink: 0,
                }}
                aria-label="Close activity details"
              >
                ×
              </button>
            </div>

            {selectedStravaPrimaryPhotoUrl && (
              <div style={{ marginTop: 12 }}>
                <img
                  src={selectedStravaPrimaryPhotoUrl}
                  alt={selectedStravaActivity.name || "Strava activity"}
                  style={{
                    width: "100%",
                    maxHeight: isMobile ? 132 : 148,
                    objectFit: "cover",
                    borderRadius: 14,
                    display: "block",
                    border: "1px solid rgba(231,235,240,0.9)",
                  }}
                />
              </div>
            )}

            {selectedStravaDescription && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(248,250,252,0.8)",
                  border: "1px solid rgba(231,235,240,0.9)",
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: "#425466",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selectedStravaDescription}
              </div>
            )}

            {isStravaActivityLoading && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#6b7a8c" }}>
                Loading activity details...
              </div>
            )}

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {selectedStravaStats.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "8px 9px",
                    borderRadius: 12,
                    background: "rgba(245,247,250,0.82)",
                    border: "1px solid rgba(231,235,240,0.9)",
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7a8c" }}>
                    {stat.label}
                  </div>
                  <div style={{ marginTop: 4, fontSize: isMobile ? 12 : 14, fontWeight: 700, color: "#24364b" }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 12,
                borderRadius: 14,
                background: "rgba(15,23,42,0.94)",
                color: "#fff",
                padding: "12px 12px 10px",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.62)" }}>
                    Heart rate
                  </div>
                  <div style={{ marginTop: 4, fontSize: 24, fontWeight: 800, lineHeight: 1 }}>
                    {formatHeartRate(selectedStravaLatestHeartRate)}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6, textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
                    Avg <strong style={{ color: "#fff" }}>{formatHeartRate(selectedStravaAverageHeartRate)}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
                    Max <strong style={{ color: "#fff" }}>{formatHeartRate(selectedStravaMaxHeartRate)}</strong>
                  </div>
                </div>
              </div>

              {selectedStravaHeartRateChart ? (
                <div style={{ marginTop: 12 }}>
                  <svg viewBox="0 0 320 112" width="100%" height="108" aria-label="Heart rate chart" role="img">
                    <defs>
                      <linearGradient id="stravaHeartRateFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(248,113,113,0.55)" />
                        <stop offset="100%" stopColor="rgba(248,113,113,0.04)" />
                      </linearGradient>
                    </defs>
                    <line x1="10" y1="28" x2="310" y2="28" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                    <line x1="10" y1="56" x2="310" y2="56" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                    <line x1="10" y1="84" x2="310" y2="84" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                    <path d={selectedStravaHeartRateChart.areaPath} fill="url(#stravaHeartRateFill)" />
                    <path
                      d={selectedStravaHeartRateChart.linePath}
                      fill="none"
                      stroke="#fb7185"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : (
                <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                  No heart rate stream recorded for this activity.
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Number.isFinite(selectedStravaActivity.totalPhotoCount) && selectedStravaActivity.totalPhotoCount > 0 && (
                <span style={{ padding: "6px 10px", borderRadius: 999, background: "#fff7ed", color: "#c2410c", fontSize: 12, fontWeight: 600 }}>
                  {formatNumber(selectedStravaActivity.totalPhotoCount)} photos
                </span>
              )}
              {selectedStravaActivity.trainer && (
                <span style={{ padding: "6px 10px", borderRadius: 999, background: "#eef2ff", color: "#3847a8", fontSize: 12, fontWeight: 600 }}>
                  Trainer ride
                </span>
              )}
              {selectedStravaActivity.commute && (
                <span style={{ padding: "6px 10px", borderRadius: 999, background: "#ecfeff", color: "#0f766e", fontSize: 12, fontWeight: 600 }}>
                  Commute
                </span>
              )}
              {selectedStravaActivity.private && (
                <span style={{ padding: "6px 10px", borderRadius: 999, background: "#f3f4f6", color: "#4b5563", fontSize: 12, fontWeight: 600 }}>
                  Private
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
