import { MENU_ICON_SIZE } from "../styles/appStyles";
import { SearchPanel } from "./SearchPanel";
import { LibraryPanel } from "./LibraryPanel";

export function QuickMenu({
  quickMenuRef, isMobile,
  activeMenuPanel, toggleMenuPanel,
  speedMode, setSpeedMode,
  isGraphExpanded, bottomSheetHeight, showRoutingUi, waypointsCount, elevationHidden,
  // search
  searchQuery, setSearchQuery, searchResults, isSearchLoading, searchError,
  isSearchDropdownOpen, setIsSearchDropdownOpen,
  handleSearchSelect, handleSearchKeyDown, getSearchResultLabels, searchBoxRef,
  // library
  libraryProps,
  // styles
  getMenuIconButtonStyle, expandedMenuFloatingStyle, libraryPanelFloatingStyle,
  inputStyle,
}) {
  // On mobile: sit just above the style picker buttons (2×44px + 10px gap = 98px) + 12px gap
  // Style picker bottom matches MapStylePicker: bottomPos + env(safe-area-inset-bottom)
  const stylePickerBottom = isMobile && showRoutingUi && waypointsCount > 0
    ? `calc(${bottomSheetHeight} + 4px + env(safe-area-inset-bottom, 0px))`
    : `calc(4px + env(safe-area-inset-bottom, 0px))`;
  // When elevation sheet is visible, push menu above it (sheet height + 10px gap matches icon gap)
  const elevationSheetVisible = isMobile && showRoutingUi && waypointsCount > 0 && !elevationHidden;
  const mobileBottom = isMobile
    ? elevationSheetVisible
      ? `calc(clamp(171px, 19vh, 225px) + 20px + env(safe-area-inset-bottom, 0px) + 108px)`
      : `calc(${stylePickerBottom} + 108px)`
    : undefined;
  const topPos = !isMobile && isGraphExpanded
    ? `calc((100dvh - ${bottomSheetHeight}) / 2)`
    : "50%";

  return (
    <div
      ref={quickMenuRef}
      style={{
        position: "absolute",
        ...(isMobile
          ? { bottom: mobileBottom, top: "auto", transform: "none" }
          : { top: topPos, transform: "translateY(-50%)" }
        ),
        left: "calc(14px + env(safe-area-inset-left, 0px))",
        zIndex: 5,
        display: "grid",
        gap: 10,
        alignItems: "start",
        transition: "bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Search */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => toggleMenuPanel("search")} style={getMenuIconButtonStyle("search")} aria-label="Search places">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="#24364b" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {activeMenuPanel === "search" && !isMobile && (
          <div style={{
            ...expandedMenuFloatingStyle,
            width: 300,
          }}>
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
            width: MENU_ICON_SIZE,
            height: MENU_ICON_SIZE,
            borderRadius: 999,
            border: "1px solid rgba(15, 23, 42, 0.08)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            padding: 0,
            transition: "background-color 0.18s ease, transform 0.18s ease",
            outline: "none",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
            WebkitTapHighlightColor: "transparent",
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
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: MENU_ICON_SIZE }}>
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
    </div>
  );
}
