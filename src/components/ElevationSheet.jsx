import { ElevationChart } from "./ElevationChart";

export function ElevationSheet({
  routeGeoJson, elevationGainM, elevationLossM, distanceKm,
  isMobile, bottomSheetHeight, isGraphExpanded, setIsGraphExpanded,
  onHoverCoordinateChange,
}) {
  return (
    <div
      onClick={() => isMobile && setIsGraphExpanded((v) => !v)}
      style={{
        position: "absolute",
        bottom: isMobile ? 0 : 20,
        left: isMobile ? 0 : 120,
        right: isMobile ? 0 : 20,
        height: isMobile ? bottomSheetHeight : "calc(100vh / 6)",
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: isMobile ? 0 : 14,
        borderBottomRightRadius: isMobile ? 0 : 14,
        boxSizing: "border-box",
        boxShadow: "0 -5px 20px rgba(0,0,0,0.1)",
        pointerEvents: "auto",
        transition: "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        zIndex: 4,
        cursor: isMobile ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {isMobile && (
        <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 40, height: 4, background: "rgba(0,0,0,0.2)", borderRadius: 2 }} />
      )}
      {isMobile && !isGraphExpanded && (
        <div style={{ display: "flex", gap: 24, fontSize: 14, fontWeight: 500, color: "#0f172a", padding: "24px 16px", justifyContent: "center", alignItems: "center" }}>
          <span>{distanceKm} km</span>
          <span>↑ {elevationGainM} m</span>
          <span>↓ {elevationLossM} m</span>
        </div>
      )}
      <div style={{ width: "100%", height: "100%", opacity: !isMobile || isGraphExpanded ? 1 : 0, transition: "opacity 0.2s ease", pointerEvents: !isMobile || isGraphExpanded ? "auto" : "none" }}>
        <ElevationChart routeGeoJson={routeGeoJson} elevationGainM={elevationGainM} elevationLossM={elevationLossM} onHoverCoordinateChange={onHoverCoordinateChange} />
      </div>
    </div>
  );
}
