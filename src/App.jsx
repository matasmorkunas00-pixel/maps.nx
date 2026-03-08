import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORAGE_KEY, GPX_LIBRARY_STORAGE_KEY, GPX_ROUTE_COLORS, ROUTING_MODES, MAP_STYLES, MAPTILER_API_KEY } from "./constants";
import { uid } from "./utils/geo";
import { buildGpxFromRouteGeoJson, parseGpxText } from "./utils/gpx";
import { normalizeImportedRoute, normalizeSavedRoute, buildImportedRoutesGeoJson, getDefaultRouteColor } from "./utils/routes";
import { ElevationChart } from "./components/ElevationChart";
import { useMap } from "./hooks/useMap";

const STREETS_PREVIEW_URL = "/streets-preview.jpg";
const SATELLITE_PREVIEW_URL = "/satelite-preview.jpg";
const OUTDOOR_PREVIEW_URL = `https://api.maptiler.com/maps/outdoor-v2/static/25.2797,54.6872,13/160x160.png?key=${MAPTILER_API_KEY}`;
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
  const [isMapModesFlashOn, setIsMapModesFlashOn] = useState(false);
  const [isLocationFlashOn, setIsLocationFlashOn] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) {
        setIsSearchDropdownOpen(false);
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
    distanceKm,
    elevationGainM,
    elevationLossM,
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
    addWaypoint,
    getCurrentLocation,
  } = useMap({
    appleMapContainerRef,
    mapContainerRef,
    mapStyle,
    importedRoutesGeoJson,
    routingMode,
    isMobile,
    speedMode,
    onFirstClick: (lngLat) => setPendingPin(lngLat),
  });

  const showRoutingUi = activeMenuPanel === "route" || waypointsRef.current.length > 0;

  const handleLocationNo = () => {
    if (!pendingPin) return;
    addWaypoint(pendingPin.lng, pendingPin.lat);
    setPendingPin(null);
  };

  const handleLocationYes = async () => {
    if (!pendingPin) return;
    try {
      const userLocation = await getCurrentLocation();
      if (userLocation) {
        addWaypoint(userLocation[0], userLocation[1]);
        addWaypoint(pendingPin.lng, pendingPin.lat);
      }
    } catch (error) {
      console.error("Could not get user location", error);
      addWaypoint(pendingPin.lng, pendingPin.lat);
    } finally {
      setPendingPin(null);
    }
  };

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
      elevationLossM,
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
    if (isMobile) {
      setIsMobileMenuOpen(false);
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

    const parsedRoutes = (await Promise.all(
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
    )).filter(Boolean);

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
    if(isMobile) setIsMobileMenuOpen(false);
  };

  const handleSearchKeyDown = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!searchResults.length) return;
    await handleSearchSelect(searchResults[0]);
  };

  const toggleMenuPanel = (panelKey) => {
    setActiveMenuPanel((current) => {
      const next = current === panelKey ? null : panelKey;
      if (isMobile && next) {
        setIsMobileMenuOpen(false);
      }
      return next;
    });
  };

  const getPressHandlers = (buttonId) => ({
    onMouseDown: () => setPressedButton(buttonId),
    onMouseUp: () => setPressedButton(null),
    onMouseLeave: () => setPressedButton((cur) => (cur === buttonId ? null : cur)),
    onTouchStart: () => setPressedButton(buttonId),
    onTouchEnd: () => setPressedButton(null),
  });

  const btn = { padding: isMobile ? "12px 14px" : "10px 12px", borderRadius: 12, border: "1px solid #d7dce3", background: "#fff", cursor: "pointer", fontSize: isMobile ? 16 : 14, color: "#000" };
  const getButtonStyle = (buttonId, emphasis = false) => ({ ...btn, height: isMobile ? 44 : 'auto', fontWeight: emphasis ? 600 : 500, background: pressedButton === buttonId ? "#eef2f7" : "#fff", color: "#000", borderColor: pressedButton === buttonId ? "#000" : "#d7dce3", flex: isMobile ? '1 1 0%' : 'auto' });
  const inputStyle = { borderRadius: 12, border: "1px solid #d7dce3", fontSize: isMobile ? 16 : 14, color: "#000", background: "#fff" };
  const menuIconSize = 44;
  const bottomSheetHeight = isGraphExpanded ? 'max(40vh, 300px)' : 68;

  const expandedMenuCardStyle = {
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(15, 23, 42, 0.1)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.16)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    color: "#000",
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

  return (
    <>
      <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
        <div ref={appleMapContainerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, transition: "opacity 0.18s ease" }}/>
        <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
      </div>

      {isMobile && <button onClick={() => setIsMobileMenuOpen(v => !v)} aria-label="Open menu" style={{ position: 'absolute', top: 10, left: 10, zIndex: 5, width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(15, 23, 42, 0.08)', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.92)', boxShadow: '0 10px 26px rgba(15, 23, 42, 0.12)', cursor: 'pointer' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6H20M4 12H20M4 18H20" stroke="#24364b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
      {isMobile && isMobileMenuOpen && <div onClick={() => setIsMobileMenuOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 4 }} />}

      <input ref={gpxFileInputRef} type="file" accept=".gpx" multiple onChange={handleGpxUpload} style={{ display: "none" }} />

      {showRoutingUi && (
        <div style={{ position: "absolute", top: isMobile ? 'auto' : 10, bottom: isMobile ? (waypointsRef.current.length > 0 ? bottomSheetHeight + 10 : 10) : 'auto', left: isMobile ? 0 : "50%", transform: isMobile ? "none" : "translateX(-50%)", zIndex: 3, width: isMobile ? "100%" : "auto", maxWidth: isMobile ? "100vw" : "calc(100vw - 180px)", pointerEvents: "none", animation: "route-stats-fade-in 0.22s ease both", transition: 'bottom 0.25s ease' }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: isMobile ? "flex-start" : "center", pointerEvents: "auto", ...(isMobile && { overflowX: 'auto', padding: '0 10px', whiteSpace: 'nowrap' }) }}>
            <div style={{ display: "flex", gap: 8, alignItems: 'center', flexShrink: 0, padding: '10px 0' }}>
              <button onClick={undoLast} title="Undo" aria-label="Undo last route point" style={{ ...getButtonStyle("undo_icon"), width: 44, height: 44, display: 'grid', placeItems: 'center', padding: 0 }} {...getPressHandlers("undo_icon")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 8H4V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 8C5.9 5.9 8.6 4.5 11.7 4.5C17.4 4.5 22 9.1 22 14.8C22 16.2 21.7 17.5 21.2 18.7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /></svg></button>
              <button onClick={clearAll} title="Clear route" aria-label="Clear route" style={{ ...getButtonStyle("clear_icon"), width: 44, height: 44, display: 'grid', placeItems: 'center', padding: 0 }} {...getPressHandlers("clear_icon")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7H19" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /><path d="M9 7V5.8C9 5.36 9.36 5 9.8 5H14.2C14.64 5 15 5.36 15 5.8V7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /><path d="M8 7L8.6 18.2C8.63 18.66 9.02 19 9.48 19H14.52C14.98 19 15.37 18.66 15.4 18.2L16 7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /></svg></button>
            </div>
            {!isMobile && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(({ label, value, unit }) => (<div key={label} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(245,247,250,0.82)", border: "1px solid rgba(231,235,240,0.85)", backdropFilter: "blur(8px)", minWidth: 120 }}><div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#000" }}>{label}</div><div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, color: "#000" }}>{value}<span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#000" }}>{unit}</span></div></div>))}
            </div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <button onClick={saveRoute} disabled={isRouting} title="Save route" style={{ ...getButtonStyle("save_icon"), width: 44, height: 44, display: 'grid', placeItems: 'center', padding: 0 }} {...getPressHandlers("save_icon")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
                <button onClick={exportGPX} title="Export GPX" style={{ ...getButtonStyle("export_icon"), width: 44, height: 44, display: 'grid', placeItems: 'center', padding: 0 }} {...getPressHandlers("export_icon")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Route name" style={{ ...inputStyle, padding: '0 10px', height: 44, boxSizing: "border-box", width: 140 }}/>
                <button style={{...getButtonStyle("new"), height: 44, padding: "0 12px"}} onClick={newRoute} {...getPressHandlers("new")}>New</button>
            </div>
             <div style={{ flexShrink: 0, paddingRight: 10 }}><select value={routingMode} onChange={(e) => setRoutingMode(e.target.value)} style={{ ...inputStyle, padding: '0 10px', height: 44, boxSizing: "border-box" }}>{Object.entries(ROUTING_MODES).map(([value, opt]) => (<option key={value} value={value}>{opt.label}</option>))}</select></div>
          </div>
          {routingError && <div style={{ padding: "8px 10px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, pointerEvents: "auto", margin: '8px 10px 0' }}>{routingError}</div>}
          {isRouting && <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: '8px 0' }}>Calculating route...</div>}
        </div>
      )}

      {showRoutingUi && waypointsRef.current.length > 0 && (
        <div onClick={() => isMobile && setIsGraphExpanded(v => !v)} style={{ position: "absolute", bottom: isMobile ? 0 : 20, left: isMobile ? 0 : 120, right: isMobile ? 0 : 20, height: isMobile ? bottomSheetHeight : "calc(100vh / 6)", background: "rgba(255, 255, 255, 0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: isMobile ? 0 : 14, borderBottomRightRadius: isMobile ? 0 : 14, boxSizing: "border-box", boxShadow: "0 -5px 20px rgba(0,0,0,0.1)", pointerEvents: "auto", transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 4, cursor: isMobile ? 'pointer' : 'default', overflow: 'hidden' }}>
          {isMobile && <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 40, height: 4, background: 'rgba(0,0,0,0.2)', borderRadius: 2 }} />}
          {isMobile && !isGraphExpanded && <div style={{ display: 'flex', gap: 24, fontSize: 14, fontWeight: 500, color: '#0f172a', padding: '24px 16px', justifyContent: 'center', alignItems: 'center' }}><span>{distanceKm} km</span><span>↑ {elevationGainM} m</span><span>↓ {elevationLossM} m</span></div>}
          <div style={{ width: '100%', height: '100%', opacity: !isMobile || isGraphExpanded ? 1 : 0, transition: 'opacity 0.2s ease' }}><ElevationChart routeGeoJson={routeGeoJson} elevationGainM={elevationGainM} elevationLossM={elevationLossM} /></div>
        </div>
      )}

      <div ref={quickMenuRef} style={{ position: "absolute", top: isMobile ? 0 : "50%", left: isMobile ? 0 : 10, transform: isMobile ? (isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)') : "translateY(-50%)", zIndex: 5, display: "grid", gap: 10, alignItems: "start", transition: 'transform 0.25s ease', ...(isMobile && { padding: '70px 10px 10px', height: '100%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderRight: '1px solid rgba(15, 23, 42, 0.1)', boxShadow: '5px 0 20px rgba(0,0,0,0.1)', width: 'min(calc(100vw - 60px), 320px)', }) }}>
        <div style={{ position: "relative", display: "flex", flexDirection: 'column', gap: 10 }}>
          <button onClick={() => toggleMenuPanel("search")} style={getMenuIconButtonStyle("search")} aria-label="Search places"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="#24364b" strokeWidth="1.8" /><path d="M16.5 16.5L21 21" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
          {activeMenuPanel === "search" && <div style={{ ...expandedMenuCardStyle, ...(isMobile && {position: 'absolute', top: menuIconSize + 10, left: 0, width: '100%'}) }}>
            <div ref={searchBoxRef} style={{ position: "relative" }}>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => { if (searchResults.length || searchQuery.trim().length >= 2) setIsSearchDropdownOpen(true); }} onKeyDown={handleSearchKeyDown} placeholder="Search address, shops, tourist places..." style={{ ...inputStyle, width: "100%", padding: "11px 40px 11px 12px", boxSizing: "border-box" }} />
              <div aria-hidden="true" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#506176", pointerEvents: "none" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></div>
              {isSearchDropdownOpen && (isSearchLoading || searchResults.length > 0 || searchQuery.trim().length >= 2) && <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 6, borderRadius: 12, border: "1px solid rgba(15, 23, 42, 0.12)", background: "rgba(255,255,255,0.97)", boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)", overflow: "hidden" }}>
                {isSearchLoading ? <div style={{ padding: "10px 12px", fontSize: 12, color: "#506176" }}>Searching places...</div> : searchResults.length === 0 ? <div style={{ padding: "10px 12px", fontSize: 12, color: "#506176" }}>No places found</div> : <div style={{ maxHeight: 250, overflowY: "auto" }}>
                  {searchResults.map((feature) => {
                    const { primary, secondary } = getSearchResultLabels(feature);
                    return <button key={`${feature.id || feature.place_name}-${feature.center[0]}-${feature.center[1]}`} onClick={() => handleSearchSelect(feature)} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid rgba(15, 23, 42, 0.06)" }}><div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>{primary}</div>{secondary && <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>{secondary}</div>}</button>;
                  })}
                </div>}
              </div>}
            </div>
            {searchError && <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{searchError}</div>}
          </div>}
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: 'column', gap: 10 }}>
          <button onClick={() => toggleMenuPanel("route")} style={getMenuIconButtonStyle("route")} aria-label="Route tools"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="6" cy="18" r="2.2" fill="#24364b" /><circle cx="18" cy="6" r="2.2" fill="#24364b" /><path d="M8.2 17.1C12.8 16 10.3 8.9 15.8 7.2" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setSpeedMode((on) => !on)} aria-label="Speed mode" style={{ ...getMenuIconButtonStyle('speed'), background: speedMode ? undefined : 'rgba(255,255,255,0.92)', backgroundImage: speedMode ? 'linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00cc00,#0088ff,#8800ff,#ff0000)' : 'none', backgroundSize: speedMode ? '200% 100%' : 'auto', animation: speedMode ? 'rainbow-bg 1.6s linear infinite' : 'none' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2L4 13H10L9 22L20 9H14L13 2Z" fill={speedMode ? "#fff" : "#24364b"} /></svg></button>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: 'column', gap: 10 }}>
          <button onClick={() => toggleMenuPanel("library")} style={getMenuIconButtonStyle("library")} aria-label="GPX library"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 7.5C3.5 6.4 4.4 5.5 5.5 5.5H10L12 7.5H18.5C19.6 7.5 20.5 8.4 20.5 9.5V16.5C20.5 17.6 19.6 18.5 18.5 18.5H5.5C4.4 18.5 3.5 17.6 3.5 16.5V7.5Z" stroke="#24364b" strokeWidth="1.7" /></svg></button>
          {activeMenuPanel === "library" && <div style={{ ...expandedMenuCardStyle, ...(isMobile && {position: 'absolute', top: menuIconSize + 10, left: 0, width: '100%'}) }}>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={importFolderName} onChange={(e) => setImportFolderName(e.target.value)} placeholder="Folder name, e.g. 2024" style={{ ...inputStyle, width: "100%", padding: 11, boxSizing: "border-box" }} />
              <button style={getButtonStyle("upload")} onClick={() => gpxFileInputRef.current?.click()} {...getPressHandlers("upload")}>Upload GPX files</button>
            </div>
            {availableFolders.length > 0 ? <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button style={getButtonStyle("folders_all")} onClick={() => setVisibleFolders(availableFolders)} {...getPressHandlers("folders_all")}>Show all</button>
                <button style={getButtonStyle("folders_none")} onClick={() => setVisibleFolders([])} {...getPressHandlers("folders_none")}>Hide all</button>
              </div>
              <div style={{ display: "grid", gap: 6, maxHeight: 210, overflow: "auto" }}>
                {availableFolders.map((folder) => {
                  const folderRoutes = importedRoutes.filter((r) => r.folder === folder);
                  const checked = activeVisibleFolders.includes(folder);
                  return <div key={folder} style={{ display: "grid", gap: 8, padding: "8px 10px", borderRadius: 12, background: "#f5f7fa", border: "1px solid #e7ebf0", fontSize: 13, color: "#000" }}>
                    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={checked} onChange={() => toggleFolderVisibility(folder)} />{folder}</span>
                      <span style={{ opacity: 0.65 }}>{folderRoutes.length}</span>
                    </label>
                    <div style={{ display: "grid", gap: 6, paddingLeft: 22 }}>
                      {folderRoutes.map((route) => <div key={route.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", fontSize: 12 }}><div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: route.color || GPX_ROUTE_COLORS[0], flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={route.name}>{route.name}</span></div><input type="color" value={route.color || GPX_ROUTE_COLORS[0]} onChange={(e) => updateImportedRouteColor(route.id, e.target.value)} style={{ width: 28, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }} title={`Change color for ${route.name}`}/></div>)}
                    </div>
                  </div>;
                })}
              </div>
            </div> : <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>No imported GPX routes yet.</div>}
            <div style={{ marginTop: 10, borderTop: "1px solid #e6e8ed", paddingTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong style={{ fontSize: 13 }}>Saved routes</strong><span style={{ fontSize: 12, opacity: 0.7 }}>{routes.length}</span></div>
              <div style={{ maxHeight: 170, overflow: "auto", marginTop: 6 }}>
                {routes.length === 0 ? <div style={{ fontSize: 12, opacity: 0.7 }}>No saved routes yet.</div> : routes.map((r) => <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #eef1f4" }}>
                  <button onClick={() => loadRoute(r.id)} style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 12 }} title="Load route">
                    <div style={{ fontWeight: r.id === activeRouteId ? 700 : 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.68 }}>{r.distanceKm} km • {r.elevationGainM} m</div>
                  </button>
                  <button style={getButtonStyle(`delete_${r.id}`)} onClick={() => deleteRoute(r.id)} title="Delete route" {...getPressHandlers(`delete_${r.id}`)}>Delete</button>
                </div>)}
              </div>
            </div>
          </div>}
        </div>
      </div>

      <div ref={styleControlsRef} style={{ position: "absolute", left: 10, bottom: isMobile ? (showRoutingUi && waypointsRef.current.length > 0 ? bottomSheetHeight + 10 : 10) : 10, zIndex: 2, display: "grid", gap: 8, transition: 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)'}}>
        {isStyleMenuOpen && (
          <div style={{ width: isMobile ? 168 : 176, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: 6, borderRadius: 12, background: "rgba(255,255,255,0.94)", border: "1px solid rgba(15, 23, 42, 0.08)", boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", transition: "transform 0.16s ease, opacity 0.16s ease" }}>
            <button onClick={() => setMapStyle("streets")} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={{ display: "grid", gap: 6, border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "#24364b", outline: "none", boxShadow: "none", WebkitTapHighlightColor: "transparent" }} title={MAP_STYLES.streets.label}><div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", border: mapStyle === "streets" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)", boxShadow: mapStyle === "streets" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none" }}><img src={STREETS_PREVIEW_URL} alt="Streets map preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" /></div><div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Default</div></button>
            <button onClick={() => setMapStyle("outdoor")} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={{ display: "grid", gap: 6, border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "#24364b", outline: "none", boxShadow: "none", WebkitTapHighlightColor: "transparent" }} title={MAP_STYLES.outdoor.label}><div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", border: mapStyle === "outdoor" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)", boxShadow: mapStyle === "outdoor" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none" }}><img src={OUTDOOR_PREVIEW_URL} alt="Outdoor map preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = STREETS_PREVIEW_URL; }} loading="lazy" /></div><div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Cycling</div></button>
            <button onClick={() => setMapStyle("satellite")} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={{ display: "grid", gap: 6, border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "#24364b", outline: "none", boxShadow: "none", WebkitTapHighlightColor: "transparent" }} title={MAP_STYLES.satellite.label}><div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", border: mapStyle === "satellite" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)", boxShadow: mapStyle === "satellite" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none" }}><img src={SATELLITE_PREVIEW_URL} alt="Satellite map preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" /></div><div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Satellite</div></button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setIsMapModesFlashOn(true); setIsStyleMenuOpen((open) => !open); }} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} aria-label="Map style options" style={{ width: isMobile ? 44 : 42, height: isMobile ? 44 : 42, borderRadius: 999, border: "1px solid rgba(15, 23, 42, 0.08)", display: "grid", placeItems: "center", background: isMapModesFlashOn ? "#dbe2ec" : "rgba(255,255,255,0.92)", cursor: "pointer", padding: 0, transition: "background-color 0.2s ease", outline: "none", boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)", WebkitTapHighlightColor: "transparent" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.75 6.25L8.95 3.6C9.29 3.43 9.69 3.43 10.03 3.6L14 5.62L18.95 3.6C19.71 3.29 20.5 3.84 20.5 4.66V17.75L15.05 20.4C14.71 20.57 14.31 20.57 13.97 20.4L10 18.38L5.05 20.4C4.29 20.71 3.5 20.16 3.5 19.34V6.75C3.5 6.54 3.61 6.35 3.75 6.25Z" fill="#24364b" /><path d="M10 3.75V18.25M14 5.62V20.25" stroke="rgba(255,255,255,0.45)" strokeWidth="1.15" /></svg></button>
          <button onClick={() => { setIsLocationFlashOn(true); setIsStyleMenuOpen(false); locateUser(); }} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} title={locationState.message} aria-label="Center on my location" style={{ width: isMobile ? 44 : 42, height: isMobile ? 44 : 42, borderRadius: 999, border: "1px solid rgba(15, 23, 42, 0.08)", display: "grid", placeItems: "center", background: isLocationFlashOn ? "#dbe2ec" : "rgba(255,255,255,0.92)", cursor: "pointer", padding: 0, transition: "background-color 0.2s ease", outline: "none", boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)", WebkitTapHighlightColor: "transparent" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 4L11 13M20 4L14.5 20L11 13L4 9.5L20 4Z" stroke="#24364b" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" /></svg></button>
        </div>
      </div>

      {pendingPin && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(255,255,255,0.95)', padding: '20px', borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.15)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', zIndex: 10, textAlign: 'center', border: '1px solid rgba(15, 23, 42, 0.1)', width: isMobile ? 'min(calc(100vw - 40px), 300px)' : 'auto' }}>
          <p style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: '#0f172a' }}>Start route from current location?</p>
          <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
            <button onClick={handleLocationYes} style={getButtonStyle('loc_yes', true)}>Yes</button>
            <button onClick={handleLocationNo} style={getButtonStyle('loc_no')}>No</button>
          </div>
        </div>
      )}
    </>
  );
}
