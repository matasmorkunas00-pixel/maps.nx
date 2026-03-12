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
  newRoute,
  routingMode, setRoutingMode,
  getPressHandlers,
  pressedButton,
  saveFeedbackTick,
  mobileVisible,
}) {
  // isMounted deferred by one frame so CSS transition animates from hidden → visible on mount
  const [isMounted, setIsMounted] = useState(false);
  const [isSaveConfirmed, setIsSaveConfirmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!saveFeedbackTick) return;
    setIsSaveConfirmed(true);
    const id = setTimeout(() => setIsSaveConfirmed(false), 1400);
    return () => clearTimeout(id);
  }, [saveFeedbackTick]);

  const isShown = isMounted && (isMobile ? (mobileVisible ?? true) : true);
  const saveLabel = isSaveConfirmed ? "Route saved" : "Save route";

  const getToolbarButtonStyle = (buttonId, stretch = false) => {
    const pressed = pressedButton === buttonId;
    const base = iconBtn(pressed, stretch);
    if (buttonId !== "save_icon") return base;
    return {
      ...base,
      position: "relative",
      overflow: "visible",
      border: isSaveConfirmed ? "1px solid rgba(34,197,94,0.42)" : base.border,
      background: isSaveConfirmed
        ? (pressed ? "rgba(220,252,231,0.96)" : "linear-gradient(180deg, rgba(240,253,244,0.98) 0%, rgba(220,252,231,0.94) 100%)")
        : base.background,
      boxShadow: isSaveConfirmed ? "0 0 0 4px rgba(34,197,94,0.12), 0 10px 24px rgba(22,101,52,0.16)" : "none",
      transform: pressed ? "scale(0.9)" : isSaveConfirmed ? "scale(1.03)" : "scale(1)",
    };
  };

  const getActionButtonStyle = (buttonId) => ({ ...getToolbarButtonStyle(buttonId), flex: 1, width: "auto", height: 40 });

  const renderSaveIcon = () => (
    isSaveConfirmed ? (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: "panel-pop-in 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
        <path d="M5.5 12.5L9.5 16.5L18.5 7.5" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  );

  const renderSavePulse = (isCompact = false) => (
    isSaveConfirmed ? (
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: isCompact ? -4 : -5,
          borderRadius: isCompact ? 12 : 14,
          border: "1px solid rgba(34,197,94,0.35)",
          animation: "save-ring 0.9s ease-out both",
          pointerEvents: "none",
        }}
      />
    ) : null
  );

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
          {/* Row 1: route name + new + routing mode */}
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
            <button
              onClick={newRoute}
              style={{
                height: 36, padding: "0 16px", borderRadius: 10,
                border: ELEM_BORDER,
                background: pressedButton === "new" ? "rgba(210,220,232,0.88)" : ELEM_BG,
                ...ELEM_BLUR,
                fontSize: 13, fontWeight: 600, color: "#0f172a",
                cursor: "pointer", flexShrink: 0,
                WebkitTapHighlightColor: "transparent", outline: "none",
              }}
              {...getPressHandlers("new")}
            >New</button>
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
              { key: "save_icon", onClick: saveRoute, label: saveLabel, disabled: isRouting, svg: renderSaveIcon() },
              { key: "export_icon", onClick: exportGPX, label: "Export GPX", svg: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg> },
            ].map(({ key, onClick, label, disabled, svg }) => (
              <button key={key} onClick={onClick} disabled={disabled} aria-label={label}
                title={label}
                style={getActionButtonStyle(key)}
                {...getPressHandlers(key)}>
                {key === "save_icon" && renderSavePulse(true)}
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
          <button onClick={saveRoute} disabled={isRouting} title={saveLabel} aria-label={saveLabel}
            style={getToolbarButtonStyle("save_icon")}
            {...getPressHandlers("save_icon")}>
            {renderSavePulse()}
            {renderSaveIcon()}
          </button>
          <button onClick={exportGPX} title="Export GPX"
            style={getToolbarButtonStyle("export_icon")}
            {...getPressHandlers("export_icon")}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Route controls: name+new row, then routing select */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          <div style={{ display: "flex", gap: 8 }}>
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
