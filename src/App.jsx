import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORAGE_KEY, GPX_LIBRARY_STORAGE_KEY, GPX_ROUTE_COLORS, ROUTING_MODES, MAP_STYLES } from "./constants";
import { uid } from "./utils/geo";
import { buildGpxFromRouteGeoJson, parseGpxText } from "./utils/gpx";
import { normalizeImportedRoute, normalizeSavedRoute, buildImportedRoutesGeoJson, getDefaultRouteColor } from "./utils/routes";
import { ElevationChart } from "./components/ElevationChart";
import { useMap } from "./hooks/useMap";

export default function App() {
  const mapContainerRef = useRef(null);
  const gpxFileInputRef = useRef(null);
  const styleControlsRef = useRef(null);

  const [routeName, setRouteName] = useState("My Route");
  const [routingMode, setRoutingMode] = useState("gravel");
  const [mapStyle, setMapStyle] = useState("streets");
  const [pressedButton, setPressedButton] = useState(null);
  const [importFolderName, setImportFolderName] = useState("");
  const [visibleFolders, setVisibleFolders] = useState([]);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [speedMode, setSpeedMode] = useState(false);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);

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
      if (!styleControlsRef.current?.contains(event.target)) setIsStyleMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

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

  useEffect(() => {
    setVisibleFolders((current) => {
      const next = current.filter((f) => availableFolders.includes(f));
      return next.length ? next : availableFolders;
    });
  }, [availableFolders]);

  const importedRoutesGeoJson = useMemo(
    () => buildImportedRoutesGeoJson(importedRoutes, visibleFolders),
    [importedRoutes, visibleFolders]
  );

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
    loadRouteOnMap,
  } = useMap({ mapContainerRef, mapStyle, importedRoutesGeoJson, routingMode, isMobile, speedMode });

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
    setVisibleFolders((current) => (current.includes(folder) ? current : [...current, folder]));
    event.target.value = "";
  };

  const toggleFolderVisibility = (folder) => {
    setVisibleFolders((current) =>
      current.includes(folder) ? current.filter((e) => e !== folder) : [...current, folder]
    );
  };

  const updateImportedRouteColor = (routeId, color) => {
    setImportedRoutes((current) => current.map((r) => (r.id === routeId ? { ...r, color } : r)));
  };

  // ---------- UI helpers ----------

  const getPressHandlers = (buttonId) => ({
    onMouseDown: () => setPressedButton(buttonId),
    onMouseUp: () => setPressedButton(null),
    onMouseLeave: () => setPressedButton((cur) => (cur === buttonId ? null : cur)),
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
    maxHeight: isMobile ? "70vh" : "calc(100vh - 20px)",
    overflowY: "auto",
    background: "rgba(255,255,255,0.9)",
    padding: isMobile ? 14 : 16,
    borderRadius: 16,
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#000",
  };

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

  // ---------- Render ----------

  return (
    <>
      <div ref={mapContainerRef} style={{ width: "100vw", height: "100vh" }} />

      <div style={panelStyle}>
        <input ref={gpxFileInputRef} type="file" accept=".gpx" multiple onChange={handleGpxUpload} style={{ display: "none" }} />

        {routingError && (
          <div style={{
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#000",
            fontSize: 13,
          }}>
            {routingError}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route name"
            style={{ ...inputStyle, flex: 1, padding: isMobile ? 12 : 11 }}
          />
          <button style={getButtonStyle("new")} onClick={newRoute} title="Start a fresh route" {...getPressHandlers("new")}>
            New
          </button>
        </div>

        <div style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          gap: 8,
        }}>
          <button style={getButtonStyle("undo")} onClick={undoLast} {...getPressHandlers("undo")}>Undo</button>
          <button style={getButtonStyle("clear")} onClick={clearAll} {...getPressHandlers("clear")}>Clear</button>
          <button style={getButtonStyle("save", true)} onClick={saveRoute} disabled={isRouting} {...getPressHandlers("save")}>
            Save
          </button>
          <button style={getButtonStyle("export")} onClick={exportGPX} {...getPressHandlers("export")}>Export GPX</button>
        </div>

        <button
          onClick={() => setSpeedMode((on) => !on)}
          style={{
            marginTop: 8,
            width: "100%",
            padding: isMobile ? "12px 14px" : "10px 12px",
            borderRadius: 12,
            border: "2px solid transparent",
            cursor: "pointer",
            fontSize: isMobile ? 16 : 14,
            fontWeight: 700,
            backgroundImage: speedMode
              ? "linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00cc00,#0088ff,#8800ff,#ff0000)"
              : "none",
            background: speedMode ? undefined : "#fff",
            color: "#000",
            textShadow: "none",
            backgroundSize: "200% 100%",
            animation: speedMode ? "rainbow-bg 1.6s linear infinite" : "none",
          }}
        >
          {speedMode ? "⚡ Speed Mode ON" : "Speed Mode"}
        </button>

        {isRouting && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#000", textAlign: "center" }}>
            Calculating route…
          </div>
        )}

        <div style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 10,
          alignItems: "start",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(
              ({ label, value, unit }) => (
                <div key={label} style={{ padding: "10px 12px", borderRadius: 12, background: "#f5f7fa", border: "1px solid #e7ebf0" }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#000" }}>{label}</div>
                  <div style={{ marginTop: 4, fontSize: isMobile ? 24 : 22, fontWeight: 700, color: "#000" }}>
                    {value}
                    <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#000" }}>{unit}</span>
                  </div>
                </div>
              )
            )}
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#000", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Routing mode
            <select
              value={routingMode}
              onChange={(e) => setRoutingMode(e.target.value)}
              style={{ ...inputStyle, width: "100%", padding: isMobile ? "11px 12px" : "10px 12px" }}
            >
              {Object.entries(ROUTING_MODES).map(([value, opt]) => (
                <option key={value} value={value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>

        <ElevationChart routeGeoJson={routeGeoJson} />

        {/* GPX library */}
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

              <div style={{ display: "grid", gap: 6, maxHeight: 140, overflow: "auto" }}>
                {availableFolders.map((folder) => {
                  const folderRoutes = importedRoutes.filter((r) => r.folder === folder);
                  const checked = visibleFolders.includes(folder);
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
        </div>

        {/* Saved routes */}
        <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Saved routes</strong>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{routes.length}</span>
          </div>

          <div style={{ maxHeight: isMobile ? 180 : 220, overflow: "auto", marginTop: 8 }}>
            {routes.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>No saved routes yet.</div>
            ) : (
              routes.map((r) => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f2f2f2" }}>
                  <button
                    onClick={() => loadRoute(r.id)}
                    style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: isMobile ? 15 : 13 }}
                    title="Load route"
                  >
                    <div style={{ fontWeight: r.id === activeRouteId ? 700 : 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{r.distanceKm} km • {r.elevationGainM} m</div>
                  </button>

                  <button
                    style={getButtonStyle(`rename_${r.id}`)}
                    onClick={() => { setRouteName(r.name); setActiveRouteId(r.id); }}
                    title="Load name into editor, then Save to apply"
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
        ref={styleControlsRef}
        style={{
          position: "absolute",
          left: 10,
          bottom: isMobile ? 108 : 10,
          zIndex: 2,
          display: "grid",
          gap: 8,
        }}
      >
        {isStyleMenuOpen && (
          <div
            style={{
              width: isMobile ? "min(92vw, 420px)" : 360,
              display: "grid",
              gap: 14,
              padding: isMobile ? 14 : 16,
              borderRadius: 24,
              background:
                "radial-gradient(circle at 12% 8%, rgba(59,130,246,0.16), transparent 42%), linear-gradient(160deg, rgba(15,23,42,0.96) 0%, rgba(30,41,59,0.95) 100%)",
              border: "1px solid rgba(148, 163, 184, 0.32)",
              boxShadow: "0 18px 40px rgba(2, 6, 23, 0.45)",
              color: "#e2e8f0",
            }}
          >
            <div style={{ fontSize: isMobile ? 30 : 34, fontWeight: 700, lineHeight: 1, textAlign: "center" }}>
              Map Modes
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <button
                onClick={() => { setMapStyle("streets"); setIsStyleMenuOpen(false); }}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  display: "grid",
                  gap: 8,
                  color: "#e2e8f0",
                }}
                title={MAP_STYLES.streets.label}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 22,
                    overflow: "hidden",
                    border: mapStyle === "streets" ? "3px solid #38bdf8" : "1px solid rgba(148, 163, 184, 0.38)",
                    boxShadow: mapStyle === "streets" ? "0 0 0 2px rgba(56,189,248,0.22)" : "none",
                    backgroundImage:
                      "linear-gradient(140deg, #2b4261 0%, #3e5976 35%, #2d455f 70%, #1f2f45 100%)",
                    position: "relative",
                  }}
                >
                  <div style={{ position: "absolute", inset: 0, opacity: 0.42, background: "repeating-linear-gradient(45deg, transparent 0 14px, rgba(148,163,184,0.35) 14px 17px)" }} />
                  <div style={{ position: "absolute", inset: 0, opacity: 0.85, background: "radial-gradient(circle at 70% 35%, rgba(16,185,129,0.45), transparent 34%), radial-gradient(circle at 20% 80%, rgba(251,191,36,0.3), transparent 30%)" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.15 }}>Streets</div>
              </button>

              <button
                onClick={() => { setMapStyle("satellite"); setIsStyleMenuOpen(false); }}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  display: "grid",
                  gap: 8,
                  color: "#e2e8f0",
                }}
                title={MAP_STYLES.satellite.label}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 22,
                    overflow: "hidden",
                    border: mapStyle === "satellite" ? "3px solid #38bdf8" : "1px solid rgba(148, 163, 184, 0.38)",
                    boxShadow: mapStyle === "satellite" ? "0 0 0 2px rgba(56,189,248,0.22)" : "none",
                    backgroundImage:
                      "linear-gradient(130deg, #7c8f66 0%, #9aa87b 26%, #8f9d78 44%, #c6ba91 62%, #a9b89f 80%, #6d825f 100%)",
                    position: "relative",
                  }}
                >
                  <div style={{ position: "absolute", inset: 0, opacity: 0.3, background: "repeating-linear-gradient(20deg, transparent 0 12px, rgba(55,65,81,0.34) 12px 14px)" }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.15 }}>Satellite</div>
              </button>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 6,
            borderRadius: 14,
            background: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        >
          <button
            onClick={() => setIsStyleMenuOpen((open) => !open)}
            aria-label="Map style options"
            style={{
              width: isMobile ? 44 : 42,
              height: isMobile ? 44 : 42,
              borderRadius: 999,
              border: "none",
              display: "grid",
              placeItems: "center",
              background: "#fff",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3.75 6.25L8.95 3.6C9.29 3.43 9.69 3.43 10.03 3.6L14 5.62L18.95 3.6C19.71 3.29 20.5 3.84 20.5 4.66V17.75L15.05 20.4C14.71 20.57 14.31 20.57 13.97 20.4L10 18.38L5.05 20.4C4.29 20.71 3.5 20.16 3.5 19.34V6.75C3.5 6.54 3.61 6.35 3.75 6.25Z" fill="#24364b" />
              <path d="M10 3.75V18.25M14 5.62V20.25" stroke="rgba(255,255,255,0.45)" strokeWidth="1.15" />
            </svg>
          </button>

          <button
            onClick={locateUser}
            title={locationState.message}
            aria-label="Center on my location"
            style={{
              width: isMobile ? 44 : 42,
              height: isMobile ? 44 : 42,
              borderRadius: 999,
              border: "none",
              display: "grid",
              placeItems: "center",
              background: "#fff",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 4L11 13M20 4L14.5 20L11 13L4 9.5L20 4Z"
                stroke={locationState.status === "active" ? "#0f172a" : "#24364b"}
                strokeWidth="1.9"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
