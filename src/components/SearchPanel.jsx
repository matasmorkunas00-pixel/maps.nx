export function SearchPanel({
  searchQuery, setSearchQuery,
  searchResults, isSearchLoading, searchError,
  isSearchDropdownOpen, setIsSearchDropdownOpen,
  handleSearchSelect, handleSearchKeyDown,
  getSearchResultLabels,
  searchBoxRef,
  inputStyle,
  autoFocus,
}) {
  return (
    <div ref={searchBoxRef} style={{ position: "relative" }}>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => { if (searchResults.length || searchQuery.trim().length >= 3) setIsSearchDropdownOpen(true); }}
        onKeyDown={handleSearchKeyDown}
        placeholder="Search"
        autoFocus={autoFocus}
        style={{ ...inputStyle, width: "100%", padding: "11px 40px 11px 12px", boxSizing: "border-box" }}
      />
      <div aria-hidden="true" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#506176", pointerEvents: "none" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      {isSearchDropdownOpen && (isSearchLoading || searchResults.length > 0 || searchQuery.trim().length >= 3) && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 6,
          borderRadius: 12, border: "1px solid rgba(15, 23, 42, 0.12)",
          background: "rgba(255,255,255,0.97)", boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)", overflow: "hidden",
        }}>
          {isSearchLoading ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#506176" }}>Searching places...</div>
          ) : searchResults.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#506176" }}>No places found</div>
          ) : (
            <div style={{ maxHeight: 250, overflowY: "auto" }}>
              {searchResults.map((feature) => {
                const { primary, secondary } = getSearchResultLabels(feature);
                return (
                  <button
                    key={`${feature.id || feature.place_name}-${feature.center[0]}-${feature.center[1]}`}
                    onClick={() => handleSearchSelect(feature)}
                    style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid rgba(15, 23, 42, 0.06)" }}
                  >
                    <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>{primary}</div>
                    {secondary && <div style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>{secondary}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {searchError && <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{searchError}</div>}
    </div>
  );
}
