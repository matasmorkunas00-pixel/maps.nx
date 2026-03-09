import { ROUTING_MODES } from "../constants";

const GLASS = {
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.6)",
  boxShadow: "0 4px 24px rgba(15,23,42,0.12)",
};

const ELEM_BG = "rgba(255,255,255,0.45)";
const ELEM_BORDER = "1px solid rgba(15,23,42,0.1)";

const iconBtn = (pressed) => ({
  width: 36,
  height: 36,
  borderRadius: 10,
  border: ELEM_BORDER,
  background: pressed ? "rgba(220,228,238,0.7)" : ELEM_BG,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
  outline: "none",
});

const inputBase = {
  height: 36,
  padding: "0 10px",
  boxSizing: "border-box",
  borderRadius: 10,
  border: ELEM_BORDER,
  background: ELEM_BG,
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
};

export function RouteToolbar({
  undoLast, clearAll, distanceKm, elevationGainM,
  isMobile, isRouting, routingError,
  saveRoute, exportGPX,
  routeName, setRouteName,
  newRoute,
  routingMode, setRoutingMode,
  getPressHandlers,
  pressedButton,
}) {
  if (isMobile) {
    return (
      <div style={{
        position: "absolute",
        top: 10,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 6,
        width: "calc(100vw - 20px)",
        maxWidth: 480,
        animation: "route-stats-fade-in 0.22s ease both",
      }}>
        <div style={{
          ...GLASS,
          borderRadius: 16,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {/* Row 1: actions + stats */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Left: undo + clear */}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={undoLast} aria-label="Undo" style={iconBtn(pressedButton === "undo_icon")} {...getPressHandlers("undo_icon")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 8H4V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 8C5.9 5.9 8.6 4.5 11.7 4.5C17.4 4.5 22 9.1 22 14.8C22 16.2 21.7 17.5 21.2 18.7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
              <button onClick={clearAll} aria-label="Clear route" style={iconBtn(pressedButton === "clear_icon")} {...getPressHandlers("clear_icon")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 7H19" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M9 7V5.8C9 5.36 9.36 5 9.8 5H14.2C14.64 5 15 5.36 15 5.8V7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M8 7L8.6 18.2C8.63 18.66 9.02 19 9.48 19H14.52C14.98 19 15.37 18.66 15.4 18.2L16 7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Center: stats */}
            <div style={{ flex: 1, display: "flex", gap: 6 }}>
              {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(({ label, value, unit }) => (
                <div key={label} style={{
                  flex: 1,
                  background: ELEM_BG,
                  border: ELEM_BORDER,
                  borderRadius: 10,
                  padding: "5px 6px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 8.5, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
                    {value}<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 500, color: "#64748b" }}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: save + export */}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={saveRoute} disabled={isRouting} aria-label="Save route" style={iconBtn(pressedButton === "save_icon")} {...getPressHandlers("save_icon")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button onClick={exportGPX} aria-label="Export GPX" style={iconBtn(pressedButton === "export_icon")} {...getPressHandlers("export_icon")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Row 2: name + mode + new */}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={routeName} onChange={(e) => setRouteName(e.target.value)}
              placeholder="Route name"
              style={{
                flex: 1, minWidth: 0,
                height: 36, padding: "0 10px", boxSizing: "border-box",
                borderRadius: 10, border: ELEM_BORDER,
                background: ELEM_BG,
                fontSize: 14, color: "#0f172a",
                outline: "none",
              }}
            />
            <select
              value={routingMode} onChange={(e) => setRoutingMode(e.target.value)}
              style={{
                height: 36, padding: "0 6px", boxSizing: "border-box",
                borderRadius: 10, border: ELEM_BORDER,
                background: ELEM_BG,
                fontSize: 13, color: "#0f172a",
                flexShrink: 0, maxWidth: 110,
                outline: "none",
              }}
            >
              {Object.entries(ROUTING_MODES).map(([value, opt]) => (
                <option key={value} value={value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={newRoute}
              style={{
                height: 36, padding: "0 12px", borderRadius: 10,
                border: ELEM_BORDER,
                background: ELEM_BG,
                fontSize: 13, fontWeight: 600, color: "#0f172a",
                cursor: "pointer", flexShrink: 0,
                WebkitTapHighlightColor: "transparent",
                outline: "none",
              }}
              {...getPressHandlers("new")}
            >New</button>
          </div>
        </div>

        {routingError && (
          <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 10, ...GLASS, color: "#991b1b", fontSize: 12, border: "1px solid rgba(254,202,202,0.7)" }}>
            {routingError}
          </div>
        )}
        {isRouting && (
          <div style={{ marginTop: 4, fontSize: 12, color: "#334155", textAlign: "center", padding: "4px 0" }}>Calculating route…</div>
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{
      position: "absolute",
      top: 10,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 3,
      maxWidth: "calc(100vw - 180px)",
      pointerEvents: "none",
      animation: "route-stats-fade-in 0.22s ease both",
    }}>
      <div style={{
        ...GLASS,
        borderRadius: 18,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        pointerEvents: "auto",
      }}>
        {/* Left: undo + trash stacked vertically */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={undoLast} title="Undo" aria-label="Undo last route point"
            style={iconBtn(pressedButton === "undo_icon")}
            {...getPressHandlers("undo_icon")}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 8H4V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 8C5.9 5.9 8.6 4.5 11.7 4.5C17.4 4.5 22 9.1 22 14.8C22 16.2 21.7 17.5 21.2 18.7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
          <button onClick={clearAll} title="Clear route" aria-label="Clear route"
            style={iconBtn(pressedButton === "clear_icon")}
            {...getPressHandlers("clear_icon")}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 7H19" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M9 7V5.8C9 5.36 9.36 5 9.8 5H14.2C14.64 5 15 5.36 15 5.8V7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M8 7L8.6 18.2C8.63 18.66 9.02 19 9.48 19H14.52C14.98 19 15.37 18.66 15.4 18.2L16 7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Stats: Distance + Elevation */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(({ label, value, unit }) => (
            <div key={label} style={{
              padding: "8px 14px",
              borderRadius: 12,
              background: ELEM_BG,
              border: ELEM_BORDER,
              minWidth: 110,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 600 }}>{label}</div>
              <div style={{ marginTop: 3, fontSize: 20, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
                {value}<span style={{ marginLeft: 3, fontSize: 12, fontWeight: 500, color: "#64748b" }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right: save + export stacked vertically */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={saveRoute} disabled={isRouting} title="Save route"
            style={iconBtn(pressedButton === "save_icon")}
            {...getPressHandlers("save_icon")}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button onClick={exportGPX} title="Export GPX"
            style={iconBtn(pressedButton === "export_icon")}
            {...getPressHandlers("export_icon")}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: "stretch", background: "rgba(15,23,42,0.1)", margin: "0 2px" }} />

        {/* Route controls: name+new row, then routing select */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={routeName} onChange={(e) => setRouteName(e.target.value)}
              placeholder="Route name"
              style={{ ...inputBase, width: 130 }}
            />
            <button
              onClick={newRoute}
              style={{
                ...inputBase,
                padding: "0 14px",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
                background: pressedButton === "new" ? "rgba(220,228,238,0.7)" : ELEM_BG,
                WebkitTapHighlightColor: "transparent",
              }}
              {...getPressHandlers("new")}
            >New</button>
          </div>
          <select
            value={routingMode} onChange={(e) => setRoutingMode(e.target.value)}
            style={{ ...inputBase, width: "100%" }}
          >
            {Object.entries(ROUTING_MODES).map(([value, opt]) => (
              <option key={value} value={value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {routingError && (
        <div style={{ padding: "8px 10px", borderRadius: 10, ...GLASS, color: "#991b1b", fontSize: 12, pointerEvents: "auto", margin: "8px 10px 0", border: "1px solid rgba(254,202,202,0.7)" }}>
          {routingError}
        </div>
      )}
      {isRouting && (
        <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "8px 0" }}>Calculating route...</div>
      )}
    </div>
  );
}
