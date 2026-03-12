import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MENU_ICON_SIZE } from "../styles/appStyles";
import { SearchPanel } from "./SearchPanel";
import { LibraryPanel } from "./LibraryPanel";
import { THUNDERFOREST_API_KEY } from "../constants";

const STREETS_PREVIEW_URL = "/streets-preview.jpg";
const SATELLITE_PREVIEW_URL = "/satelite-preview.jpg";
const OUTDOOR_PREVIEW_URL = `https://tile.thunderforest.com/cycle/13/4671/2600.png?apikey=${THUNDERFOREST_API_KEY}`;

export function QuickMenu({
  quickMenuRef, isMobile,
  activeMenuPanel, toggleMenuPanel,
  speedMode, setSpeedMode,
  isGraphExpanded, bottomSheetHeight,
  // search
  searchQuery, setSearchQuery, searchResults, isSearchLoading, searchError,
  isSearchDropdownOpen, setIsSearchDropdownOpen,
  handleSearchSelect, handleSearchKeyDown, getSearchResultLabels, searchBoxRef,
  // library
  libraryProps,
  // styles
  getMenuIconButtonStyle, expandedMenuFloatingStyle, libraryPanelFloatingStyle,
  inputStyle,
  // map style + location
  mapStyle, setMapStyle,
  locateUser, locationState,
  isStyleMenuOpen, setIsStyleMenuOpen,
  isMapModesFlashOn, setIsMapModesFlashOn,
  isLocationFlashOn, setIsLocationFlashOn,
  onStyleMenuOpen,
  styleControlsRef,
}) {
  const mapStyleBtnRef = useRef(null);
  const [popupEl, setPopupEl] = useState(null);
  const [popupPos, setPopupPos] = useState({ top: -9999, left: -9999, visible: false });

  // After the popup mounts and after the button is known, measure both and compute exact position
  useLayoutEffect(() => {
    if (!isStyleMenuOpen || !popupEl || !mapStyleBtnRef.current) {
      setPopupPos({ top: -9999, left: -9999, visible: false });
      return;
    }
    const btn = mapStyleBtnRef.current.getBoundingClientRect();
    const popupH = popupEl.offsetHeight;
    setPopupPos({
      top: btn.top + btn.height / 2 - popupH / 2,
      left: btn.right + 10,
      visible: true,
    });
  }, [isStyleMenuOpen, popupEl]);

  const topPos = !isMobile && isGraphExpanded
    ? `calc((100dvh - ${bottomSheetHeight}) / 2)`
    : "50%";

  const circleBtn = (flash) => ({
    width: MENU_ICON_SIZE,
    height: MENU_ICON_SIZE,
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

  // Portal popup — rendered into body so it is outside every transformed ancestor.
  // useLayoutEffect measures the button and popup after render and sets exact pixel coords.
  const popup = isStyleMenuOpen ? createPortal(
    <div
      ref={setPopupEl}
      className="map-style-popup"
      style={{
        position: "fixed",
        top: popupPos.top,
        left: popupPos.left,
        visibility: popupPos.visible ? "visible" : "hidden",
        width: 176,
        display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8,
        padding: 6, borderRadius: 12,
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        animation: popupPos.visible ? "panel-pop-in 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both" : "none",
        zIndex: 9999,
      }}
    >
      <button onClick={() => { setMapStyle("streets"); setIsStyleMenuOpen(false); }} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={mapBtnStyle} title="Default">
        <div style={previewStyle("streets")}><img src={STREETS_PREVIEW_URL} alt="Streets" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" /></div>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Default</div>
      </button>
      <button onClick={() => { setMapStyle("outdoor"); setIsStyleMenuOpen(false); }} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={mapBtnStyle} title="Cycling">
        <div style={previewStyle("outdoor")}><img src={OUTDOOR_PREVIEW_URL} alt="Cycling" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = STREETS_PREVIEW_URL; }} loading="lazy" /></div>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Cycling</div>
      </button>
      <button onClick={() => { setMapStyle("satellite"); setIsStyleMenuOpen(false); }} onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()} style={mapBtnStyle} title="Satellite">
        <div style={previewStyle("satellite")}><img src={SATELLITE_PREVIEW_URL} alt="Satellite" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" /></div>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Satellite</div>
      </button>
    </div>,
    document.body
  ) : null;

  return (
    <div
      ref={quickMenuRef}
      style={{
        position: "absolute",
        top: topPos,
        transform: "translateY(-50%)",
        left: "calc(14px + env(safe-area-inset-left, 0px))",
        zIndex: 5,
        display: "grid",
        gap: 10,
        alignItems: "start",
        transition: "top 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {activeMenuPanel === "library" && !isMobile && (
        <div
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMenuPanel("library");
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            background: "transparent",
          }}
        />
      )}

      {/* Search */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => toggleMenuPanel("search")} style={getMenuIconButtonStyle("search")} aria-label="Search places">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="#24364b" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {activeMenuPanel === "search" && !isMobile && (
          <div style={{ ...expandedMenuFloatingStyle, width: 300 }}>
            <SearchPanel
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              searchResults={searchResults} isSearchLoading={isSearchLoading} searchError={searchError}
              isSearchDropdownOpen={isSearchDropdownOpen} setIsSearchDropdownOpen={setIsSearchDropdownOpen}
              handleSearchSelect={handleSearchSelect} handleSearchKeyDown={handleSearchKeyDown}
              getSearchResultLabels={getSearchResultLabels}
              searchBoxRef={searchBoxRef}
              inputStyle={inputStyle}
            />
          </div>
        )}
      </div>

      {/* Route tools */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => toggleMenuPanel("route")} style={getMenuIconButtonStyle("route")} aria-label="Route tools">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="6" cy="18" r="2.2" fill="#24364b" />
            <circle cx="18" cy="6" r="2.2" fill="#24364b" />
            <path d="M8.2 17.1C12.8 16 10.3 8.9 15.8 7.2" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Speed mode */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: MENU_ICON_SIZE }}>
        <button
          onClick={() => setSpeedMode((on) => !on)}
          onMouseUp={(e) => e.currentTarget.blur()}
          onTouchEnd={(e) => e.currentTarget.blur()}
          aria-label="Speed mode"
          style={{
            width: MENU_ICON_SIZE, height: MENU_ICON_SIZE, borderRadius: 999,
            border: "1px solid rgba(15, 23, 42, 0.08)", display: "grid", placeItems: "center",
            cursor: "pointer", padding: 0, outline: "none",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
            WebkitTapHighlightColor: "transparent",
            transition: "background-color 0.18s ease, transform 0.18s ease",
            transform: speedMode ? "scale(0.97)" : "scale(1)",
            background: speedMode ? undefined : "rgba(255,255,255,0.92)",
            backgroundImage: speedMode ? "linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00cc00,#0088ff,#8800ff,#ff0000)" : "none",
            backgroundSize: speedMode ? "200% 100%" : "auto",
            animation: speedMode ? "rainbow-bg 1.6s linear infinite" : "none",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M13 2L4 13H10L9 22L20 9H14L13 2Z" fill={speedMode ? "#fff" : "#24364b"} />
          </svg>
        </button>
      </div>

      {/* Library */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: MENU_ICON_SIZE, zIndex: activeMenuPanel === "library" && !isMobile ? 21 : "auto" }}>
        <button
          onClick={() => toggleMenuPanel("library")}
          onMouseUp={(e) => e.currentTarget.blur()}
          onTouchEnd={(e) => e.currentTarget.blur()}
          aria-label="GPX library"
          style={getMenuIconButtonStyle("library")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3.5 7.5C3.5 6.4 4.4 5.5 5.5 5.5H10L12 7.5H18.5C19.6 7.5 20.5 8.4 20.5 9.5V16.5C20.5 17.6 19.6 18.5 18.5 18.5H5.5C4.4 18.5 3.5 17.6 3.5 16.5V7.5Z" stroke="#24364b" strokeWidth="1.7" />
          </svg>
        </button>
        {activeMenuPanel === "library" && !isMobile && (
          <div style={{ ...libraryPanelFloatingStyle, overflowY: "auto" }}>
            <LibraryPanel {...libraryProps} />
          </div>
        )}
      </div>

      {/* Map style */}
      <div ref={styleControlsRef} style={{ display: "flex", alignItems: "center", height: MENU_ICON_SIZE }}>
        {popup}
        <button
          ref={mapStyleBtnRef}
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
      </div>

      {/* Location */}
      <div style={{ display: "flex", alignItems: "center", height: MENU_ICON_SIZE }}>
        <button
          onClick={() => { setIsLocationFlashOn(true); setIsStyleMenuOpen(false); locateUser(); }}
          onMouseUp={(e) => e.currentTarget.blur()} onTouchEnd={(e) => e.currentTarget.blur()}
          title={locationState?.message} aria-label="Center on my location"
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
