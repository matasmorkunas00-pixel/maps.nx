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

  const [routeName, setRouteName] = useState("My Route");
  const [routingMode, setRoutingMode] = useState("gravel");
  const [mapStyle, setMapStyle] = useState("streets");
  const [pressedButton, setPressedButton] = useState(null);
  const [importFolderName, setImportFolderName] = useState("");
  const [visibleFolders, setVisibleFolders] = useState([]);
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [speedMode, setSpeedMode] = useState(false);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
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

  const inputStyle = {
    borderRadius: 12,
    border: "1px solid #d7dce3",
    fontSize: isMobile ? 16 : 14,
    color: "#24364b",
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
            color: "#dc2626",
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
            color: speedMode ? "#fff" : "#24364b",
            textShadow: speedMode ? "0 1px 2px rgba(0,0,0,0.4)" : "none",
            backgroundSize: "200% 100%",
            animation: speedMode ? "rainbow-bg 1.6s linear infinite" : "none",
          }}
        >
          {speedMode ? "⚡ Speed Mode ON" : "Speed Mode"}
        </button>

        {isRouting && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7a8c", textAlign: "center" }}>
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
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7a8c" }}>{label}</div>
                  <div style={{ marginTop: 4, fontSize: isMobile ? 24 : 22, fontWeight: 700, color: "#24364b" }}>
                    {value}
                    <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#5c6c7c" }}>{unit}</span>
                  </div>
                </div>
              )
            )}
          </div>

          <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#6b7a8c", textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                    <div key={folder} style={{ display: "grid", gap: 8, padding: "8px 10px", borderRadius: 12, background: "#f5f7fa", border: "1px solid #e7ebf0", fontSize: 13, color: "#24364b" }}>
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

      {/* Map style switcher */}
      <div style={{
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
      }}>
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
                fontSize: 12,
                lineHeight: 1,
                fontWeight: active ? 700 : 600,
                boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : "inset 0 0 0 1px rgba(36,54,75,0.08)",
              }}
              title={option.label}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Location button */}
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
          background: locationState.status === "active" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.6)",
          boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {["M12 2.75V6.1", "M12 17.9V21.25", "M2.75 12H6.1", "M17.9 12H21.25"].map((d) => (
            <path key={d} d={d} stroke={locationState.status === "active" ? "#1d4ed8" : "#24364b"} strokeWidth="1.75" strokeLinecap="round" />
          ))}
          <circle cx="12" cy="12" r="5" stroke={locationState.status === "active" ? "#1d4ed8" : "#24364b"} strokeWidth="1.75" />
          <circle cx="12" cy="12" r="1.8" fill={locationState.status === "active" ? "#1d4ed8" : "#24364b"} />
        </svg>
      </button>
    </>
  );
}