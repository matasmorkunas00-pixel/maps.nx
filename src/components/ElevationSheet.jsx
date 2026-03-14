import { ElevationChart } from "./ElevationChart";

export function ElevationSheet({
  routeGeoJson, elevationGainM, elevationLossM, distanceKm,
  isMobile, onHoverCoordinateChange, hasCyclingButton, hidden, setHidden,
}) {
  const panelBg = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
  };

  // cycling button: 12px font + 7+7 padding + 2px border = 28px, gap 10px → 38px offset
  const hiddenBottom = hasCyclingButton
    ? "calc(10px + env(safe-area-inset-bottom, 0px) + 38px)"
    : isMobile ? "calc(10px + env(safe-area-inset-bottom, 0px))" : 20;

  const pillStyle = {
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.6)",
    boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "#0f172a",
    cursor: "pointer",
    letterSpacing: 0.1,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        style={{
          ...pillStyle,
          position: "absolute",
          bottom: hiddenBottom,
          right: isMobile ? "50%" : 20,
          transform: isMobile ? "translateX(50%)" : "none",
          zIndex: 4,
        }}
      >
        Show elevation
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: isMobile ? "calc(10px + env(safe-area-inset-bottom, 0px))" : 20,
        left: isMobile ? 12 : 120,
        right: isMobile ? 12 : 20,
        height: isMobile ? "clamp(171px, 19vh, 225px)" : "clamp(200px, 22vh, 260px)",
        ...panelBg,
        borderRadius: 14,
        boxSizing: "border-box",
        pointerEvents: "auto",
        zIndex: 4,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        animation: "slide-up-in 0.4s cubic-bezier(0.4, 0, 0.2, 1) both",
      }}
    >
      {/* Header: stats + hide button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "7px 10px 0", flexShrink: 0, pointerEvents: "auto" }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", letterSpacing: 0.2 }}>{distanceKm} km</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", letterSpacing: 0.2 }}>↑ {elevationGainM} m</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "#64748b", letterSpacing: 0.2 }}>↓ {elevationLossM} m</span>
        <button
          onClick={() => setHidden(true)}
          style={{
            background: "rgba(255,255,255,0.9)",
            border: "none",
            borderRadius: 20,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 500,
            color: "#0f172a",
            cursor: "pointer",
            boxShadow: "0 1px 6px rgba(0,0,0,0.1)",
            letterSpacing: 0.1,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          Hide
        </button>
      </div>

      {/* Chart fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ElevationChart routeGeoJson={routeGeoJson} onHoverCoordinateChange={onHoverCoordinateChange} />
      </div>
    </div>
  );
}
