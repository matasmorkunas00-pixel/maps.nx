import { useEffect, useMemo, useRef, useState } from "react";
import { GPX_ROUTE_COLORS } from "../constants";

const SAVED_ROUTE_SORT_OPTIONS = [
  { value: "newest", label: "Newest first", description: "Most recently saved routes first." },
  { value: "oldest", label: "Oldest first", description: "Routes saved longest ago first." },
  { value: "distance", label: "Longest first", description: "Sort by distance from longest to shortest." },
  { value: "elevation", label: "Highest climb", description: "Sort by elevation gain from highest to lowest." },
];

function getRouteDateValue(route) {
  const value = Date.parse(route?.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function getRouteNumberValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSavedRouteDate(createdAt) {
  const value = Date.parse(createdAt || "");
  if (!Number.isFinite(value)) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function LibraryPanel({
  isMobile,
  // cloud auth
  isSupabaseConfigured, isSupabaseAuthReady, supabaseUser, supabaseUserEmail,
  isCloudLibraryActive, isCloudRoutesLoading, cloudRoutesError, cloudAuthEmail, setCloudAuthEmail, cloudAuthMessage,
  refreshCloudRoutes, handleCloudSignIn, handleCloudSignOut,
  // library data
  importedRoutes, cloudImportedRoutes, routes, activeRouteId,
  availableFolders, activeVisibleFolders, openFolders, selectedRouteIdsByFolder, bulkMoveTargets,
  libraryError, libraryMessage,
  savedRouteRevealTick,
  savedRoutesSort, setSavedRoutesSort,
  newFolderName, setNewFolderName,
  // handlers
  toggleFolderVisibility, toggleFolderOpen, selectAllRoutesInFolder, clearFolderSelection,
  toggleRouteSelection, moveImportedRoutesToFolder, updateImportedRouteColor,
  setBulkMoveTargets, setVisibleFolders, removeFolder, handleCreateFolder,
  loadRoute, deleteRoute,
  gpxFileInputRef,
  // styles
  getPressHandlers,
  librarySectionStyle, getLibraryBadgeStyle, getLibraryButtonStyle, libraryInputStyle,
}) {
  const activeSavedRouteRef = useRef(null);
  const savedRoutesSortMenuRef = useRef(null);
  const [isSavedRoutesSortMenuOpen, setIsSavedRoutesSortMenuOpen] = useState(false);

  const activeSavedRoutesSort = SAVED_ROUTE_SORT_OPTIONS.find((option) => option.value === savedRoutesSort) || SAVED_ROUTE_SORT_OPTIONS[0];
  const sortedRoutes = useMemo(() => {
    const sorted = [...routes];
    switch (savedRoutesSort) {
      case "oldest":
        sorted.sort((a, b) => getRouteDateValue(a) - getRouteDateValue(b));
        break;
      case "distance":
        sorted.sort((a, b) => getRouteNumberValue(b.distanceKm) - getRouteNumberValue(a.distanceKm) || getRouteDateValue(b) - getRouteDateValue(a));
        break;
      case "elevation":
        sorted.sort((a, b) => getRouteNumberValue(b.elevationGainM) - getRouteNumberValue(a.elevationGainM) || getRouteDateValue(b) - getRouteDateValue(a));
        break;
      default:
        sorted.sort((a, b) => getRouteDateValue(b) - getRouteDateValue(a));
        break;
    }
    return sorted;
  }, [routes, savedRoutesSort]);

  useEffect(() => {
    if (!savedRouteRevealTick) return;
    requestAnimationFrame(() => {
      activeSavedRouteRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [savedRouteRevealTick, activeRouteId, savedRoutesSort]);

  useEffect(() => {
    if (!isSavedRoutesSortMenuOpen) return;
    const handlePointerDown = (event) => {
      if (!savedRoutesSortMenuRef.current?.contains(event.target)) setIsSavedRoutesSortMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isSavedRoutesSortMenuOpen]);

  const sortTriggerStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    minHeight: isMobile ? 44 : 40,
    minWidth: isMobile ? "100%" : 190,
    padding: isMobile ? "10px 12px" : "9px 11px",
    borderRadius: 15,
    border: `1px solid ${isSavedRoutesSortMenuOpen ? "rgba(148,163,184,0.72)" : "rgba(203,213,225,0.95)"}`,
    background: isSavedRoutesSortMenuOpen ? "rgba(241,245,249,0.96)" : "rgba(255,255,255,0.94)",
    boxShadow: isSavedRoutesSortMenuOpen ? "0 16px 28px rgba(15,23,42,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.82)",
    cursor: routes.length > 1 ? "pointer" : "default",
    textAlign: "left",
    color: "#18212f",
    WebkitTapHighlightColor: "transparent",
    transition: "border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
  };

  const sortMenuStyle = {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    zIndex: 5,
    width: isMobile ? "min(100%, 280px)" : 270,
    padding: 6,
    borderRadius: 17,
    background: "rgba(255,255,255,0.98)",
    border: "1px solid rgba(226,232,240,0.96)",
    boxShadow: "0 22px 42px rgba(15,23,42,0.16)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    animation: "panel-pop-in 0.16s cubic-bezier(0.34, 1.56, 0.64, 1) both",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "grid", gap: 3 }}>
          <strong style={{ fontSize: 16, color: "#18212f", letterSpacing: "-0.02em" }}>GPX Library</strong>
          <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>Upload, sort, and manage route folders.</span>
        </div>
      </div>

      {/* Cloud sync */}
      <div style={librarySectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <strong style={{ fontSize: 13, color: "#24364b" }}>Cloud sync</strong>
          {isSupabaseConfigured && isSupabaseAuthReady && supabaseUserEmail
            ? <span style={getLibraryBadgeStyle("active")}>Signed in</span>
            : <span style={getLibraryBadgeStyle("neutral")}>Optional</span>
          }
        </div>

        {!isSupabaseConfigured ? (
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable per-user sync.
          </div>
        ) : !isSupabaseAuthReady ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>Checking your session...</div>
        ) : supabaseUser ? (
          <>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
              Syncing as <strong>{supabaseUserEmail}</strong>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={getLibraryButtonStyle("cloud_refresh", "secondary")} onClick={refreshCloudRoutes} disabled={isCloudRoutesLoading} {...getPressHandlers("cloud_refresh")}>
                {isCloudRoutesLoading ? "Syncing..." : "Refresh"}
              </button>
              <button style={getLibraryButtonStyle("cloud_signout", "subtle")} onClick={handleCloudSignOut} {...getPressHandlers("cloud_signout")}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              value={cloudAuthEmail}
              onChange={(e) => setCloudAuthEmail(e.target.value)}
              placeholder="Email for cloud sync"
              style={{ ...libraryInputStyle, width: "100%", padding: isMobile ? 12 : 11, boxSizing: "border-box" }}
            />
            <button style={getLibraryButtonStyle("cloud_signin", "secondary")} onClick={handleCloudSignIn} {...getPressHandlers("cloud_signin")}>
              Send sign-in link
            </button>
          </>
        )}

        {cloudAuthMessage && (
          <div style={{ fontSize: 12, color: "#166534", background: "rgba(240,253,244,0.96)", border: "1px solid rgba(187,247,208,0.95)", borderRadius: 12, padding: "9px 10px" }}>
            {cloudAuthMessage}
          </div>
        )}
        {cloudRoutesError && (
          <div style={{ fontSize: 12, color: "#991b1b", background: "rgba(254,242,242,0.96)", border: "1px solid rgba(254,202,202,0.95)", borderRadius: 12, padding: "9px 10px" }}>
            {cloudRoutesError}
          </div>
        )}
      </div>

      {/* Create folder + upload */}
      <div style={librarySectionStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder"
            style={{ ...libraryInputStyle, width: "100%", padding: isMobile ? 12 : 11, boxSizing: "border-box" }}
          />
          <button style={getLibraryButtonStyle("create_folder", "secondary")} onClick={handleCreateFolder} disabled={isCloudRoutesLoading} {...getPressHandlers("create_folder")}>
            Create
          </button>
        </div>
        <button style={getLibraryButtonStyle("upload", "primary")} onClick={() => gpxFileInputRef.current?.click()} disabled={isCloudRoutesLoading} {...getPressHandlers("upload")}>
          Upload GPX
        </button>
      </div>

      {libraryMessage && (
        <div style={{ fontSize: 12, color: "#166534", background: "rgba(240,253,244,0.96)", border: "1px solid rgba(187,247,208,0.95)", borderRadius: 12, padding: "9px 10px" }}>
          {libraryMessage}
        </div>
      )}
      {libraryError && (
        <div style={{ fontSize: 12, color: "#991b1b", background: "rgba(254,242,242,0.96)", border: "1px solid rgba(254,202,202,0.95)", borderRadius: 12, padding: "9px 10px" }}>
          {libraryError}
        </div>
      )}

      {/* Folders */}
      <div style={librarySectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 3 }}>
            <strong style={{ fontSize: 13, color: "#24364b" }}>Folders</strong>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {isCloudLibraryActive ? `${cloudImportedRoutes.length} routes synced` : `${importedRoutes.length} local routes`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={getLibraryButtonStyle("folders_all", "subtle")} onClick={() => setVisibleFolders(availableFolders)} {...getPressHandlers("folders_all")}>Show all</button>
            <button style={getLibraryButtonStyle("folders_none", "subtle")} onClick={() => setVisibleFolders([])} {...getPressHandlers("folders_none")}>Hide all</button>
          </div>
        </div>

        {availableFolders.length > 0 ? (
          <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto", paddingRight: 2 }}>
            {availableFolders.map((folder) => {
              const folderRoutes = importedRoutes.filter((r) => r.folder === folder);
              const checked = activeVisibleFolders.includes(folder);
              const isOpen = openFolders.includes(folder);
              const selectedRouteIds = Array.isArray(selectedRouteIdsByFolder?.[folder]) ? selectedRouteIdsByFolder[folder] : [];
              const selectedCount = selectedRouteIds.length;
              const allSelected = folderRoutes.length > 0 && selectedCount === folderRoutes.length;
              const moveTargets = availableFolders.filter((c) => c !== folder);
              const bulkMoveTarget = moveTargets.includes(bulkMoveTargets?.[folder]) ? bulkMoveTargets[folder] : (moveTargets[0] || "");

              return (
                <div key={folder} style={{ display: "grid", gap: 10, padding: "10px 11px", borderRadius: 15, background: "rgba(255,255,255,0.9)", border: "1px solid rgba(226,232,240,0.95)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto auto", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleFolderVisibility(folder)} onClick={(e) => e.stopPropagation()} />
                    <button type="button" onClick={() => toggleFolderOpen(folder)} style={{ display: "flex", alignItems: "center", minWidth: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#18212f", fontSize: 13, fontWeight: 700, textAlign: "left" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder}</span>
                    </button>
                    <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{folderRoutes.length}</span>
                    {folder !== "Imported" && (
                      <button type="button" onClick={() => removeFolder(folder)} disabled={isCloudRoutesLoading}
                        style={getLibraryButtonStyle(`remove_folder_${folder}`, "danger")} {...getPressHandlers(`remove_folder_${folder}`)}
                        title={folderRoutes.length ? `Move all files to Imported and remove ${folder}` : `Remove ${folder}`}>
                        Remove
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div style={{ display: "grid", gap: 8, padding: "10px 10px 10px 30px", borderRadius: 13, background: "rgba(248,250,252,0.82)", border: "1px solid rgba(226,232,240,0.92)" }}>
                      {folderRoutes.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#64748b" }}>No routes in this folder yet.</div>
                      ) : (
                        <>
                          <div style={{ display: "grid", gap: 8, paddingBottom: 2 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                              <button style={getLibraryButtonStyle(`folder_select_all_${folder}`, "subtle")} onClick={() => selectAllRoutesInFolder(folder)} disabled={allSelected} {...getPressHandlers(`folder_select_all_${folder}`)}>Select all</button>
                              <button style={getLibraryButtonStyle(`folder_clear_${folder}`, "subtle")} onClick={() => clearFolderSelection(folder)} disabled={!selectedCount} {...getPressHandlers(`folder_clear_${folder}`)}>Clear</button>
                              <span style={getLibraryBadgeStyle(selectedCount ? "active" : "neutral")}>
                                {selectedCount ? `${selectedCount} selected` : "No selection"}
                              </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                              <select
                                value={bulkMoveTarget}
                                onChange={(e) => setBulkMoveTargets((cur) => ({ ...cur, [folder]: e.target.value }))}
                                style={{ ...libraryInputStyle, padding: "8px 10px", fontSize: 12, width: "100%" }}
                                disabled={!moveTargets.length}
                                title={`Choose where to move selected routes from ${folder}`}
                              >
                                {moveTargets.length === 0 ? (
                                  <option value="">No other folders available</option>
                                ) : moveTargets.map((fo) => <option key={fo} value={fo}>{fo}</option>)}
                              </select>
                              <button style={getLibraryButtonStyle(`folder_move_${folder}`, "secondary")} onClick={() => moveImportedRoutesToFolder(selectedRouteIds, bulkMoveTarget)} disabled={!selectedCount || !bulkMoveTarget} {...getPressHandlers(`folder_move_${folder}`)}>
                                Move
                              </button>
                            </div>
                          </div>
                          {folderRoutes.map((route) => (
                            <div key={route.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "6px 0", fontSize: 12, borderTop: "1px solid rgba(226,232,240,0.75)" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <input type="checkbox" checked={selectedRouteIds.includes(route.id)} onChange={() => toggleRouteSelection(folder, route.id)} />
                                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: 999, background: route.color || GPX_ROUTE_COLORS[0], flexShrink: 0 }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#18212f" }} title={route.name}>{route.name}</span>
                                </span>
                              </label>
                              <input type="color" value={route.color || GPX_ROUTE_COLORS[0]} onChange={(e) => updateImportedRouteColor(route.id, e.target.value)} style={{ width: 28, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }} title={`Change color for ${route.name}`} />
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#64748b" }}>No imported GPX routes yet.</div>
        )}
      </div>

      {/* Saved routes */}
      <div style={librarySectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13, color: "#24364b" }}>Saved routes</strong>
              <span style={getLibraryBadgeStyle("neutral")}>{routes.length}</span>
            </div>
            <span style={{ fontSize: 12, color: "#64748b" }}>Sorted by {activeSavedRoutesSort.label.toLowerCase()}.</span>
          </div>
          <div ref={savedRoutesSortMenuRef} style={{ position: "relative", width: isMobile ? "100%" : "auto" }}>
            <button
              type="button"
              onClick={() => routes.length > 1 && setIsSavedRoutesSortMenuOpen((open) => !open)}
              disabled={routes.length <= 1}
              style={sortTriggerStyle}
              {...getPressHandlers("saved_routes_sort")}
            >
              <span style={{ width: 30, height: 30, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(226,232,240,0.72)", color: "#24364b", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 6H19M10 12H19M14 18H19" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M6 18V6M6 18L3.5 15.5M6 18L8.5 15.5" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ display: "grid", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>Sort</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: routes.length > 1 ? "#18212f" : "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {routes.length > 1 ? activeSavedRoutesSort.label : "Not enough routes"}
                </span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, transform: isSavedRoutesSortMenuOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s ease" }}>
                <path d="M6 9L12 15L18 9" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isSavedRoutesSortMenuOpen && (
              <div style={sortMenuStyle}>
                {SAVED_ROUTE_SORT_OPTIONS.map((option) => {
                  const isActive = option.value === activeSavedRoutesSort.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => { setSavedRoutesSort(option.value); setIsSavedRoutesSortMenuOpen(false); }}
                      style={{
                        width: "100%",
                        display: "grid",
                        gap: 2,
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 13,
                        border: `1px solid ${isActive ? "rgba(148,163,184,0.45)" : "transparent"}`,
                        background: isActive ? "rgba(241,245,249,0.92)" : "transparent",
                        color: "#18212f",
                        cursor: "pointer",
                        transition: "background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease",
                      }}
                      {...getPressHandlers(`saved_routes_sort_${option.value}`)}
                    >
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{option.label}</span>
                        {isActive && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5.5 12.5L9.5 16.5L18.5 7.5" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span style={{ fontSize: 11, lineHeight: 1.45, color: "#64748b" }}>{option.description}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div style={{ maxHeight: 180, overflow: "auto", display: "grid", gap: 4, paddingRight: 2 }}>
          {sortedRoutes.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748b" }}>No saved routes yet.</div>
          ) : sortedRoutes.map((r) => (
            <div key={r.id} ref={r.id === activeRouteId ? activeSavedRouteRef : null} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(226,232,240,0.78)" }}>
              <button onClick={() => loadRoute(r.id)} style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 12 }} title="Load route">
                <div style={{ fontWeight: r.id === activeRouteId ? 700 : 600, color: "#18212f" }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.45 }}>{r.distanceKm} km | {r.elevationGainM} m | {formatSavedRouteDate(r.createdAt)}</div>
              </button>
              <button style={getLibraryButtonStyle(`delete_${r.id}`, "danger")} onClick={() => deleteRoute(r.id)} title="Delete route" {...getPressHandlers(`delete_${r.id}`)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
