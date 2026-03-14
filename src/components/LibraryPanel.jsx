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
  supabaseUserName, supabaseUserAvatarUrl,
  isCloudLibraryActive, isCloudRoutesLoading, cloudRoutesError,
  refreshCloudRoutes, handleSignInWithGoogle, handleCloudSignOut,
  // library data
  importedRoutes, cloudImportedRoutes, routes, activeRouteId,
  availableFolders, activeVisibleFolders, openFolders, selectedRouteIdsByFolder, bulkMoveTargets,
  libraryError, libraryMessage,
  savedRouteRevealTick,
  savedRoutesSort, setSavedRoutesSort,
  newFolderName, setNewFolderName,
  // handlers
  toggleFolderVisibility, toggleFolderOpen, selectAllRoutesInFolder, clearFolderSelection,
  toggleRouteSelection, moveImportedRoutesToFolder, updateImportedRouteColor, deleteImportedRoutes,
  setBulkMoveTargets, setVisibleFolders, removeFolder, handleCreateFolder,
  loadRoute, openRouteContextMenu, activeRouteMenuId,
  focusedImportedRouteId, focusImportedRoute,
  gpxFileInputRef,
  // styles
  getPressHandlers,
  librarySectionStyle, getLibraryBadgeStyle, getLibraryButtonStyle, libraryInputStyle,
}) {
  const activeSavedRouteRef = useRef(null);
  const [activeTab, setActiveTab] = useState("files");
  const [deletingFolder, setDeletingFolder] = useState(null);
  const [openBulkMenuFolder, setOpenBulkMenuFolder] = useState(null);

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

  const sortedImportedRoutes = useMemo(() => {
    const sorted = [...importedRoutes];
    const dateVal = (r) => { const v = Date.parse(r?.importedAt || ""); return Number.isFinite(v) ? v : 0; };
    switch (savedRoutesSort) {
      case "oldest":
        sorted.sort((a, b) => dateVal(a) - dateVal(b));
        break;
      case "distance":
        sorted.sort((a, b) => getRouteNumberValue(b.distanceKm) - getRouteNumberValue(a.distanceKm) || dateVal(b) - dateVal(a));
        break;
      case "elevation":
        sorted.sort((a, b) => getRouteNumberValue(b.elevationGainM) - getRouteNumberValue(a.elevationGainM) || dateVal(b) - dateVal(a));
        break;
      default:
        sorted.sort((a, b) => dateVal(b) - dateVal(a));
        break;
    }
    return sorted;
  }, [importedRoutes, savedRoutesSort]);

  useEffect(() => {
    if (!savedRouteRevealTick) return;
    requestAnimationFrame(() => {
      activeSavedRouteRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [savedRouteRevealTick, activeRouteId, savedRoutesSort]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <strong style={{ fontSize: 16, color: "#18212f", letterSpacing: "-0.02em" }}>GPX Library</strong>
        {isSupabaseConfigured && isSupabaseAuthReady && (
          supabaseUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {supabaseUserAvatarUrl ? (
                <img src={supabaseUserAvatarUrl} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(15,23,42,0.07)" }} />
              ) : (
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                  {(supabaseUserName || supabaseUserEmail || "?")[0].toUpperCase()}
                </div>
              )}
              <button onClick={handleCloudSignOut} style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500, transition: "color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#18212f"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; }}>
                Sign out
              </button>
            </div>
          ) : (
            <button onClick={handleSignInWithGoogle}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", background: "#fff", border: "1px solid #dadce0", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#18212f", boxShadow: "0 1px 3px rgba(15,23,42,0.07)", transition: "box-shadow 0.15s, background 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 3px 10px rgba(15,23,42,0.12)"; e.currentTarget.style.background = "#fafafa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,0.07)"; e.currentTarget.style.background = "#fff"; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in
            </button>
          )
        )}
      </div>

      {cloudRoutesError && (
        <div style={{ fontSize: 12, color: "#991b1b", background: "rgba(254,242,242,0.96)", border: "1px solid rgba(254,202,202,0.95)", borderRadius: 10, padding: "8px 10px" }}>
          {cloudRoutesError}
        </div>
      )}

      {/* Upload */}
      <button style={getLibraryButtonStyle("upload", "primary")} onClick={() => gpxFileInputRef.current?.click()} disabled={isCloudRoutesLoading} {...getPressHandlers("upload")}>
        Upload GPX
      </button>

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "rgba(241,245,249,0.9)", borderRadius: 12, padding: 4 }}>
        {[{ id: "files", label: "Files", count: importedRoutes.length }, { id: "routes", label: "Routes", count: routes.length + importedRoutes.length }].map(({ id, label, count }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "background 0.15s, box-shadow 0.15s, color 0.15s", WebkitTapHighlightColor: "transparent",
              background: activeTab === id ? "#fff" : "transparent",
              color: activeTab === id ? "#18212f" : "#64748b",
              boxShadow: activeTab === id ? "0 1px 4px rgba(15,23,42,0.1)" : "none",
            }}
          >
            {label}
            {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === id ? "#3b82f6" : "#94a3b8", background: activeTab === id ? "rgba(59,130,246,0.1)" : "transparent", borderRadius: 6, padding: "1px 5px", transition: "inherit" }}>{count}</span>}
          </button>
        ))}
      </div>

      {/* Files tab */}
      {activeTab === "files" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder name"
              style={{ ...libraryInputStyle, padding: isMobile ? 12 : 10, boxSizing: "border-box" }} />
            <button style={getLibraryButtonStyle("create_folder", "secondary")} onClick={handleCreateFolder} disabled={isCloudRoutesLoading} {...getPressHandlers("create_folder")}>Create</button>
          </div>

          {libraryError && <div style={{ fontSize: 12, color: "#991b1b", background: "rgba(254,242,242,0.96)", border: "1px solid rgba(254,202,202,0.95)", borderRadius: 10, padding: "8px 10px" }}>{libraryError}</div>}

          {availableFolders.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>No imported GPX files yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 2 }}>
              {availableFolders.map((folder) => {
                const folderRoutes = importedRoutes.filter((r) => r.folder === folder);
                if (!folderRoutes.length) return null;
                const checked = activeVisibleFolders.includes(folder);
                const isOpen = openFolders.includes(folder);
                const selectedRouteIds = Array.isArray(selectedRouteIdsByFolder?.[folder]) ? selectedRouteIdsByFolder[folder] : [];
                const selectedCount = selectedRouteIds.length;
                const allSelected = folderRoutes.length > 0 && selectedCount === folderRoutes.length;
                const moveTargets = availableFolders.filter((c) => c !== folder);
                const bulkMoveTarget = moveTargets.includes(bulkMoveTargets?.[folder]) ? bulkMoveTargets[folder] : (moveTargets[0] || "");

                return (
                  <div key={folder} style={{ borderTop: "1px solid rgba(226,232,240,0.7)" }}>
                    {/* Folder row */}
                    <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto auto", alignItems: "center", gap: 8, padding: "8px 0" }}>
                      {/* Eye toggle */}
                      <button type="button" onClick={() => toggleFolderVisibility(folder)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: checked ? "#3b82f6" : "#cbd5e1", padding: "2px", lineHeight: 0, transition: "color 0.15s", flexShrink: 0 }}
                        title={checked ? "Hide from map" : "Show on map"}>
                        {checked ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        )}
                      </button>
                      <button type="button" onClick={() => toggleFolderOpen(folder)} style={{ display: "flex", alignItems: "center", minWidth: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#18212f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder}</span>
                      </button>
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{folderRoutes.length}</span>
                      {/* Bin icon */}
                      <button type="button" onClick={() => setDeletingFolder(folder)} disabled={isCloudRoutesLoading}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", padding: "2px", lineHeight: 0, transition: "color 0.15s", flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "#cbd5e1"; }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                      </button>
                    </div>
                    {/* Delete confirmation */}
                    {isOpen && deletingFolder === folder && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 8px", flexWrap: "wrap" }}>
                        <button onClick={() => { removeFolder(folder); setDeletingFolder(null); }}
                          style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#1d4ed8"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "#3b82f6"; }}>
                          Delete folder
                        </button>
                        <span style={{ color: "#e2e8f0", fontSize: 12 }}>·</span>
                        <button onClick={() => { deleteImportedRoutes(folderRoutes.map((r) => r.id)); setDeletingFolder(null); }}
                          style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#b91c1c"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "#ef4444"; }}>
                          Delete folder and files
                        </button>
                        <span style={{ color: "#e2e8f0", fontSize: 12 }}>·</span>
                        <button onClick={() => setDeletingFolder(null)}
                          style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#64748b"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; }}>
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Expanded routes */}
                    {isOpen && (
                      <div style={{ display: "grid", gap: 2, paddingLeft: 20, paddingBottom: 6 }}>
                        {folderRoutes.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#94a3b8", padding: "4px 0" }}>Empty folder.</div>
                        ) : (
                          <>
                            {/* Folder action bar */}
                            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 0 3px" }}>
                              <button onClick={() => allSelected ? clearFolderSelection(folder) : selectAllRoutesInFolder(folder)}
                                style={{ fontSize: 12, fontWeight: 600, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: "3px 0", transition: "color 0.15s" }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#18212f"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}>
                                {allSelected ? "Deselect all" : "Select all"}
                              </button>
                              <button onClick={() => setOpenBulkMenuFolder(openBulkMenuFolder === folder ? null : folder)}
                                style={{ fontSize: 16, fontWeight: 700, color: openBulkMenuFolder === folder ? "#18212f" : "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, letterSpacing: 1, transition: "color 0.15s", visibility: selectedCount > 0 ? "visible" : "hidden" }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#18212f"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = openBulkMenuFolder === folder ? "#18212f" : "#94a3b8"; }}>
                                ···
                              </button>
                              {selectedCount > 0 && openBulkMenuFolder === folder && (
                                <div style={{ position: "absolute", top: "100%", right: 0, background: "#fff", border: "1px solid rgba(226,232,240,0.95)", borderRadius: 12, boxShadow: "0 4px 16px rgba(15,23,42,0.1)", padding: "8px 12px", zIndex: 20, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 180 }}>
                                  {moveTargets.length > 0 && (
                                    <>
                                      <select value={bulkMoveTarget} onChange={(e) => setBulkMoveTargets((cur) => ({ ...cur, [folder]: e.target.value }))}
                                        style={{ ...libraryInputStyle, padding: "3px 6px", fontSize: 12, height: "auto" }}>
                                        {moveTargets.map((fo) => <option key={fo} value={fo}>{fo}</option>)}
                                      </select>
                                      <button onClick={() => { moveImportedRoutesToFolder(selectedRouteIds, bulkMoveTarget); setOpenBulkMenuFolder(null); }}
                                        style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                                        onMouseEnter={(e) => { e.currentTarget.style.color = "#1d4ed8"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.color = "#3b82f6"; }}>
                                        Move {selectedCount}
                                      </button>
                                      <span style={{ color: "#e2e8f0", fontSize: 12 }}>·</span>
                                    </>
                                  )}
                                  <button onClick={() => { deleteImportedRoutes(selectedRouteIds); setOpenBulkMenuFolder(null); }}
                                    style={{ fontSize: 12, fontWeight: 600, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "color 0.15s" }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = "#b91c1c"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = "#ef4444"; }}>
                                    Delete {selectedCount}
                                  </button>
                                </div>
                              )}
                            </div>
                            {folderRoutes.map((route) => (
                              <div key={route.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 7, alignItems: "center", padding: "5px 0", borderTop: "1px solid rgba(226,232,240,0.6)" }}>
                                <input type="checkbox" checked={selectedRouteIds.includes(route.id)} onChange={() => toggleRouteSelection(folder, route.id)} />
                                <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, cursor: "pointer" }} onClick={() => toggleRouteSelection(folder, route.id)}>
                                  <span style={{ width: 8, height: 8, borderRadius: 999, background: route.color || GPX_ROUTE_COLORS[0], flexShrink: 0 }} />
                                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#18212f" }} title={route.name}>{route.name}</span>
                                </label>
                                <input type="color" value={route.color || GPX_ROUTE_COLORS[0]} onChange={(e) => updateImportedRouteColor(route.id, e.target.value)} style={{ width: 22, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }} title="Change color" />
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
          )}
        </div>
      )}

      {/* Routes tab */}
      {activeTab === "routes" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{routes.length + importedRoutes.length} {routes.length + importedRoutes.length === 1 ? "route" : "routes"}</span>
            {(routes.length + importedRoutes.length) > 1 && (
              <select value={savedRoutesSort} onChange={(e) => setSavedRoutesSort(e.target.value)}
                style={{ ...libraryInputStyle, padding: "5px 8px", fontSize: 12, cursor: "pointer" }}>
                {SAVED_ROUTE_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>

          {routes.length === 0 && importedRoutes.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "16px 0" }}>No routes yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 2 }}>
              {sortedRoutes.map((r) => (
                <div key={r.id} ref={r.id === activeRouteId ? activeSavedRouteRef : null}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(226,232,240,0.7)" }}>
                  <button onClick={() => loadRoute(r.id)} style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: r.id === activeRouteId ? 700 : 600, color: r.id === activeRouteId ? "#2563eb" : "#18212f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4, marginTop: 1 }}>{r.distanceKm} km ↑{r.elevationGainM} m · {formatSavedRouteDate(r.createdAt)}</div>
                  </button>
                  <button
                    onClick={(e) => openRouteContextMenu(r.id, e.currentTarget.getBoundingClientRect())}
                    title="Options"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", background: activeRouteMenuId === r.id ? "rgba(241,245,249,1)" : "transparent", color: activeRouteMenuId === r.id ? "#18212f" : "#94a3b8", transition: "background 0.15s, color 0.15s", padding: 0, flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(241,245,249,1)"; e.currentTarget.style.color = "#18212f"; }}
                    onMouseLeave={(e) => { if (activeRouteMenuId !== r.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; } }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                    </svg>
                  </button>
                </div>
              ))}
              {sortedImportedRoutes.map((route) => {
                const isFocused = focusedImportedRouteId === route.id;
                return (
                  <div key={route.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", borderTop: "1px solid rgba(226,232,240,0.7)" }}>
                    <button onClick={() => focusImportedRoute(route.id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: route.color || GPX_ROUTE_COLORS[0], flexShrink: 0, boxShadow: isFocused ? `0 0 0 2px ${route.color || GPX_ROUTE_COLORS[0]}40` : "none", transition: "box-shadow 0.15s" }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isFocused ? 700 : 600, color: isFocused ? "#2563eb" : "#18212f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.15s" }}>{route.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4, marginTop: 1 }}>{route.distanceKm} km ↑{route.elevationGainM} m</div>
                      </div>
                    </button>
                    <button onClick={() => deleteImportedRoutes([route.id])}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1", fontSize: 13, padding: "4px 6px", lineHeight: 1, transition: "color 0.15s", flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "#cbd5e1"; }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
