import { useState } from "react";
import { ElevationChart } from "./ElevationChart";

export function ElevationSheet({
  routeGeoJson, elevationGainM, elevationLossM, distanceKm,
  isMobile, bottomSheetHeight, isGraphExpanded, setIsGraphExpanded,
  onHoverCoordinateChange,
}) {
  const [hidden, setHidden] = useState(false);

  const buttonBase = {
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "none",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    color: "#0f172a",
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
    letterSpacing: 0.1,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  if (hidden && !isMobile) {
    return (
      <button
        onClick={() => setHidden(false)}
        style={{
          ...buttonBase,
          position: "absolute",
          bottom: 20,
          right: 20,
          zIndex: 4,
        }}
      >
        Show elevation
      </button>
    );
  }

  return (
    <div
      onClick={() => isMobile && setIsGraphExpanded((v) => !v)}
      style={{
        position: "absolute",
        bottom: isMobile ? 0 : 20,
        left: isMobile ? 0 : 120,
        right: isMobile ? 0 : 20,
        height: isMobile ? bottomSheetHeight : "clamp(200px, 22vh, 260px)",
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: isMobile ? 0 : 14,
        borderBottomRightRadius: isMobile ? 0 : 14,
        boxSizing: "border-box",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
        pointerEvents: "auto",
        transition: "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 4,
        cursor: isMobile ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {isMobile && (
        <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 36, height: 3, background: "rgba(0,0,0,0.15)", borderRadius: 2 }} />
      )}
      {isMobile && !isGraphExpanded && (
        <div style={{ display: "flex", gap: 24, fontSize: 13, fontWeight: 500, color: "#0f172a", padding: "24px 16px", justifyContent: "center", alignItems: "center" }}>
          <span>{distanceKm} km</span>
          <span>↑ {elevationGainM} m</span>
          <span>↓ {elevationLossM} m</span>
        </div>
      )}
      <div style={{ width: "100%", height: "100%", opacity: !isMobile || isGraphExpanded ? 1 : 0, transition: "opacity 0.2s ease", pointerEvents: !isMobile || isGraphExpanded ? "auto" : "none" }}>
        <ElevationChart routeGeoJson={routeGeoJson} elevationGainM={elevationGainM} elevationLossM={elevationLossM} onHoverCoordinateChange={onHoverCoordinateChange} />
      </div>
      {!isMobile && (
        <button
          onClick={() => setHidden(true)}
          style={{
            ...buttonBase,
            position: "absolute",
            bottom: 8,
            right: 10,
            zIndex: 5,
            fontSize: 11,
            padding: "5px 11px",
          }}
        >
          Hide
        </button>
      )}
    </div>
  );
}
