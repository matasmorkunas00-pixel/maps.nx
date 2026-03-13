import { useEffect, useState } from "react";
import { ROUTING_MODES } from "../constants";

const GLASS = {
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.6)",
  boxShadow: "0 4px 24px rgba(15,23,42,0.12)",
};

const ELEM_BG = "rgba(255,255,255,0.82)";
const ELEM_BLUR = { backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" };
const ELEM_BORDER = "1px solid rgba(15,23,42,0.1)";

const iconBtn = (pressed, stretch = false) => ({
  ...(stretch ? { alignSelf: "stretch", height: "auto", aspectRatio: "1" } : { width: 36, height: 36 }),
  borderRadius: 10,
  border: ELEM_BORDER,
  background: pressed ? "rgba(210,220,232,0.88)" : ELEM_BG,
  ...ELEM_BLUR,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
  outline: "none",
  transition: "background-color 0.15s ease, transform 0.15s ease, border-color 0.18s ease, box-shadow 0.18s ease",
  transform: pressed ? "scale(0.9)" : "scale(1)",
});

const inputBase = {
  height: 36,
  padding: "0 10px",
  boxSizing: "border-box",
  borderRadius: 10,
  border: ELEM_BORDER,
  background: ELEM_BG,
  ...ELEM_BLUR,
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
};

export function RouteToolbar({
  undoLast, clearAll, distanceKm, elevationGainM,
  isMobile, isRouting, routingError,
  saveRoute, exportGPX,
  routeName, setRouteName,
  routingMode, setRoutingMode,
  getPressHandlers,
  pressedButton,
  mobileVisible,
}) {
  // isMounted deferred by one frame so CSS transition animates from hidden → visible on mount
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isShown = isMounted && (isMobile ? (mobileVisible ?? true) : true);

  if (isMobile) {
    return (
      <>
        {/* Top toolbar — animated show/hide via CSS transition */}
        <div style={{
          position: "absolute",
          top: 10,
          left: "50%",
          zIndex: 6,
          width: "calc(100vw - 20px)",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          opacity: isShown ? 1 : 0,
          transform: isShown
            ? "translateX(-50%) translateY(0) scale(1)"
            : "translateX(-50%) translateY(-12px) scale(0.97)",
          pointerEvents: isShown ? "auto" : "none",
          transition: isShown
            ? "opacity 0.22s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
            : "opacity 0.18s ease, transform 0.2s ease",
        }}>
          {/* Row 1: route name + routing mode */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={routeName} onChange={(e) => setRouteName(e.target.value)}
              placeholder="Route name"
              style={{
                flex: 1, minWidth: 0,
                height: 36, padding: "0 10px", boxSizing: "border-box",
                borderRadius: 10, border: ELEM_BORDER,
                background: ELEM_BG, ...ELEM_BLUR,
                fontSize: 14, color: "#0f172a", outline: "none",
              }}
            />
            <select
              value={routingMode} onChange={(e) => setRoutingMode(e.target.value)}
              style={{
                height: 36, padding: "0 8px", boxSizing: "border-box",
                borderRadius: 10, border: ELEM_BORDER,
                background: ELEM_BG, ...ELEM_BLUR,
                fontSize: 13, color: "#0f172a",
                outline: "none", flexShrink: 0,
              }}
            >
              {Object.entries(ROUTING_MODES).map(([value, opt]) => (
                <option key={value} value={value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Row 2: icon buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { key: "undo_icon", onClick: undoLast, label: "Undo", svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 8H4V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 8C5.9 5.9 8.6 4.5 11.7 4.5C17.4 4.5 22 9.1 22 14.8C22 16.2 21.7 17.5 21.2 18.7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /></svg> },
              { key: "clear_icon", onClick: clearAll, label: "Clear route", svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 7H19" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /><path d="M9 7V5.8C9 5.36 9.36 5 9.8 5H14.2C14.64 5 15 5.36 15 5.8V7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /><path d="M8 7L8.6 18.2C8.63 18.66 9.02 19 9.48 19H14.52C14.98 19 15.37 18.66 15.4 18.2L16 7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" /></svg> },
              { key: "save_icon", onClick: saveRoute, label: "Save route", disabled: isRouting, svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg> },
              { key: "export_icon", onClick: exportGPX, label: "Export GPX", svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg> },
            ].map(({ key, onClick, label, disabled, svg }) => (
              <button key={key} onClick={onClick} disabled={disabled} aria-label={label}
                style={{ ...iconBtn(pressedButton === key), flex: 1, width: "auto", height: 40 }}
                {...getPressHandlers(key)}>
                {svg}
              </button>
            ))}
          </div>

          {/* Row 3: stats */}
          <div style={{ display: "flex", gap: 8 }}>
            {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(({ label, value, unit }) => (
              <div key={label} style={{
                flex: 1,
                height: 58,
                background: ELEM_BG,
                ...ELEM_BLUR,
                border: ELEM_BORDER,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ marginTop: 2, fontSize: 22, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
                  {value}<span style={{ marginLeft: 3, fontSize: 13, fontWeight: 500, color: "#64748b" }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>

          {routingError && (
            <div style={{ padding: "8px 12px", borderRadius: 10, background: ELEM_BG, ...ELEM_BLUR, color: "#991b1b", fontSize: 12, border: "1px solid rgba(254,202,202,0.7)" }}>
              {routingError}
            </div>
          )}
          {isRouting && (
            <div style={{ fontSize: 12, color: "#334155", textAlign: "center", padding: "2px 0" }}>Calculating route…</div>
          )}
        </div>

      </>
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
        display: "flex",
        alignItems: "stretch",
        gap: 8,
        pointerEvents: "auto",
      }}>
        {/* Left: undo + trash stacked vertically */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
        <div style={{ display: "flex", gap: 8, alignSelf: "stretch" }}>
          {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(({ label, value, unit }) => (
            <div key={label} style={{
              padding: "8px 14px",
              borderRadius: 12,
              background: ELEM_BG,
              ...ELEM_BLUR,
              border: ELEM_BORDER,
              minWidth: 110,
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 600 }}>{label}</div>
              <div style={{ marginTop: 3, fontSize: 20, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>
                {value}<span style={{ marginLeft: 3, fontSize: 12, fontWeight: 500, color: "#64748b" }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right: save + export stacked vertically */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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

        {/* Route controls: name + routing select */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          <input
            value={routeName} onChange={(e) => setRouteName(e.target.value)}
            placeholder="Route name"
            style={{ ...inputBase, width: 160 }}
          />
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
