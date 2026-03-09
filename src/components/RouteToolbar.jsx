import { ROUTING_MODES } from "../constants";

export function RouteToolbar({
  undoLast, clearAll, distanceKm, elevationGainM,
  isMobile, isRouting, routingError,
  saveRoute, exportGPX,
  routeName, setRouteName,
  newRoute,
  routingMode, setRoutingMode,
  getPressHandlers, getButtonStyle, inputStyle,
  waypointsCount, bottomSheetHeight,
}) {
  return (
    <div style={{
      position: "absolute",
      top: isMobile ? "auto" : 10,
      bottom: isMobile ? (waypointsCount > 0 ? bottomSheetHeight + 10 : 10) : "auto",
      left: isMobile ? 0 : "50%",
      transform: isMobile ? "none" : "translateX(-50%)",
      zIndex: 3,
      width: isMobile ? "100%" : "auto",
      maxWidth: isMobile ? "100vw" : "calc(100vw - 180px)",
      pointerEvents: "none",
      animation: "route-stats-fade-in 0.22s ease both",
      transition: "bottom 0.25s ease",
    }}>
      <div style={{
        display: "flex", gap: 8, alignItems: "center",
        justifyContent: isMobile ? "flex-start" : "center",
        pointerEvents: "auto",
        ...(isMobile && { overflowX: "auto", padding: "0 10px", whiteSpace: "nowrap" }),
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, padding: "10px 0" }}>
          <button onClick={undoLast} title="Undo" aria-label="Undo last route point"
            style={{ ...getButtonStyle("undo_icon"), width: 44, height: 44, display: "grid", placeItems: "center", padding: 0 }}
            {...getPressHandlers("undo_icon")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 8H4V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 8C5.9 5.9 8.6 4.5 11.7 4.5C17.4 4.5 22 9.1 22 14.8C22 16.2 21.7 17.5 21.2 18.7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
          <button onClick={clearAll} title="Clear route" aria-label="Clear route"
            style={{ ...getButtonStyle("clear_icon"), width: 44, height: 44, display: "grid", placeItems: "center", padding: 0 }}
            {...getPressHandlers("clear_icon")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 7H19" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M9 7V5.8C9 5.36 9.36 5 9.8 5H14.2C14.64 5 15 5.36 15 5.8V7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M8 7L8.6 18.2C8.63 18.66 9.02 19 9.48 19H14.52C14.98 19 15.37 18.66 15.4 18.2L16 7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(({ label, value, unit }) => (
              <div key={label} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(245,247,250,0.82)", border: "1px solid rgba(231,235,240,0.85)", backdropFilter: "blur(8px)", minWidth: 120 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#000" }}>{label}</div>
                <div style={{ marginTop: 4, fontSize: 22, fontWeight: 700, color: "#000" }}>
                  {value}<span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#000" }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button onClick={saveRoute} disabled={isRouting} title="Save route"
            style={{ ...getButtonStyle("save_icon"), width: 44, height: 44, display: "grid", placeItems: "center", padding: 0 }}
            {...getPressHandlers("save_icon")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button onClick={exportGPX} title="Export GPX"
            style={{ ...getButtonStyle("export_icon"), width: 44, height: 44, display: "grid", placeItems: "center", padding: 0 }}
            {...getPressHandlers("export_icon")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <input value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Route name"
            style={{ ...inputStyle, padding: "0 10px", height: 44, boxSizing: "border-box", width: 140 }} />
          <button style={{ ...getButtonStyle("new"), height: 44, padding: "0 12px" }} onClick={newRoute} {...getPressHandlers("new")}>New</button>
        </div>

        <div style={{ flexShrink: 0, paddingRight: 10 }}>
          <select value={routingMode} onChange={(e) => setRoutingMode(e.target.value)}
            style={{ ...inputStyle, padding: "0 10px", height: 44, boxSizing: "border-box" }}>
            {Object.entries(ROUTING_MODES).map(([value, opt]) => (
              <option key={value} value={value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {routingError && (
        <div style={{ padding: "8px 10px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, pointerEvents: "auto", margin: "8px 10px 0" }}>
          {routingError}
        </div>
      )}
      {isRouting && (
        <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "8px 0" }}>Calculating route...</div>
      )}
    </div>
  );
}
