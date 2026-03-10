import { MAP_STYLES, THUNDERFOREST_API_KEY } from "../constants";

const STREETS_PREVIEW_URL = "/streets-preview.jpg";
const SATELLITE_PREVIEW_URL = "/satelite-preview.jpg";
const OUTDOOR_PREVIEW_URL = `https://tile.thunderforest.com/cycle/13/4671/2600.png?apikey=${THUNDERFOREST_API_KEY}`;

export function MapStylePicker({
  mapStyle, setMapStyle,
  locateUser, locationState,
  isMobile,
  isStyleMenuOpen, setIsStyleMenuOpen,
  isMapModesFlashOn, setIsMapModesFlashOn,
  isLocationFlashOn, setIsLocationFlashOn,
  styleControlsRef,
  showRoutingUi, waypointsCount, bottomSheetHeight,
  elevationHidden,
  onStyleMenuOpen,
}) {
  const hiddenByElevation = isMobile && !elevationHidden;
  const previewStyle = (style) => ({
    width: "100%",
    aspectRatio: "1 / 1",
    borderRadius: 12,
    overflow: "hidden",
    border: mapStyle === style ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)",
    boxShadow: mapStyle === style ? "0 0 0 1px rgba(37,99,235,0.28)" : "none",
  });

  const mapBtnStyle = {
    display: "grid", gap: 6, border: "none", background: "transparent", padding: 0,
    cursor: "pointer", color: "#24364b", outline: "none", boxShadow: "none",
    WebkitTapHighlightColor: "transparent",
  };

  const circleBtn = (flash) => ({
    width: isMobile ? 44 : 42,
    height: isMobile ? 44 : 42,
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    display: "grid",
    placeItems: "center",
    background: flash ? "#dbe2ec" : "rgba(255,255,255,0.92)",
    cursor: "pointer",
    padding: 0,
    transition: "background-color 0.2s ease",
    outline: "none",
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
    WebkitTapHighlightColor: "transparent",
  });

  const bottomPos = isMobile && showRoutingUi && waypointsCount > 0
    ? `calc(${bottomSheetHeight} + 4px)`
    : "4px";

  return (
    <div ref={styleControlsRef} style={{
      position: "absolute", left: `calc(10px + env(safe-area-inset-left, 0px))`, bottom: `calc(${bottomPos} + env(safe-area-inset-bottom, 0px))`, zIndex: 5,
      display: "grid", gap: 8,
      transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease",
      opacity: hiddenByElevation ? 0 : 1,
      pointerEvents: hiddenByElevation ? "none" : "auto",
    }}>
      {isStyleMenuOpen && (
        <div style={{
          width: isMobile ? 168 : 176,
          display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8,
          padding: 6, borderRadius: 12,
          background: "rgba(255,255,255,0.94)",
          border: "1px solid rgba(15, 23, 42, 0.08)",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
          backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
          animation: "panel-pop-in 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}>
          <button onClick={() => setMapStyle("streets")} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={mapBtnStyle} title={MAP_STYLES.streets.label}>
            <div style={previewStyle("streets")}><img src={STREETS_PREVIEW_URL} alt="Streets map preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" /></div>
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Default</div>
          </button>
          <button onClick={() => setMapStyle("outdoor")} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={mapBtnStyle} title={MAP_STYLES.outdoor.label}>
            <div style={previewStyle("outdoor")}>
              <img src={OUTDOOR_PREVIEW_URL} alt="Outdoor map preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = STREETS_PREVIEW_URL; }} loading="lazy" />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Cycling</div>
          </button>
          <button onClick={() => setMapStyle("satellite")} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={mapBtnStyle} title={MAP_STYLES.satellite.label}>
            <div style={previewStyle("satellite")}><img src={SATELLITE_PREVIEW_URL} alt="Satellite map preview" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" /></div>
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Satellite</div>
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 8 }}>
        <button
          onClick={() => { setIsMapModesFlashOn(true); const opening = !isStyleMenuOpen; setIsStyleMenuOpen(opening); if (opening) onStyleMenuOpen?.(); }}
          onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()}
          aria-label="Map style options"
          style={circleBtn(isMapModesFlashOn)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.75 6.25L8.95 3.6C9.29 3.43 9.69 3.43 10.03 3.6L14 5.62L18.95 3.6C19.71 3.29 20.5 3.84 20.5 4.66V17.75L15.05 20.4C14.71 20.57 14.31 20.57 13.97 20.4L10 18.38L5.05 20.4C4.29 20.71 3.5 20.16 3.5 19.34V6.75C3.5 6.54 3.61 6.35 3.75 6.25Z" fill="#24364b" />
            <path d="M10 3.75V18.25M14 5.62V20.25" stroke="rgba(255,255,255,0.45)" strokeWidth="1.15" />
          </svg>
        </button>
        <button
          onClick={() => { setIsLocationFlashOn(true); setIsStyleMenuOpen(false); locateUser(); }}
          onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()}
          title={locationState.message} aria-label="Center on my location"
          style={circleBtn(isLocationFlashOn)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 4L11 13M20 4L14.5 20L11 13L4 9.5L20 4Z" stroke="#24364b" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
