import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORAGE_KEY, GPX_LIBRARY_STORAGE_KEY } from "./constants";
import { uid } from "./utils/geo";
import { buildGpxFromRouteGeoJson, parseGpxText } from "./utils/gpx";
import { normalizeImportedRoute, normalizeSavedRoute, buildImportedRoutesGeoJson, getDefaultRouteColor } from "./utils/routes";
import { normalizeFolderName, appendFolderName, loadStoredFolderNames } from "./utils/folders";
import { fetchSearchResults } from "./utils/search";
import { useMap } from "./hooks/useMap";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { listCloudImportedRoutes, listCloudFolders, createCloudFolder, updateCloudImportedRouteColor, updateCloudImportedRoutesFolder, deleteCloudFolder, uploadCloudImportedRoute, isMissingCloudFoldersTableError } from "./utils/cloudRoutes";
import { createStyleHelpers } from "./styles/appStyles";
import { RouteToolbar } from "./components/RouteToolbar";
import { ElevationSheet } from "./components/ElevationSheet";
import { MapStylePicker } from "./components/MapStylePicker";
import { PendingPinDialog } from "./components/PendingPinDialog";
import { QuickMenu } from "./components/QuickMenu";
import { SearchPanel } from "./components/SearchPanel";
import { LibraryPanel } from "./components/LibraryPanel";

export default function App() {
  const appleMapContainerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const gpxFileInputRef = useRef(null);
  const quickMenuRef = useRef(null);
  const styleControlsRef = useRef(null);
  const searchBoxRef = useRef(null);
  const skipNextSearchRef = useRef(false);

  const [routeName, setRouteName] = useState("My Route");
  const [routingMode, setRoutingMode] = useState("gravel");
  const [mapStyle, setMapStyle] = useState("streets");
  const [pressedButton, setPressedButton] = useState(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [visibleFolders, setVisibleFolders] = useState(null);
  const [openFolders, setOpenFolders] = useState([]);
  const [selectedRouteIdsByFolder, setSelectedRouteIdsByFolder] = useState({});
  const [bulkMoveTargets, setBulkMoveTargets] = useState({});
  const [activeRouteId, setActiveRouteId] = useState(null);
  const [speedMode, setSpeedMode] = useState(false);
  const [activeMenuPanel, setActiveMenuPanel] = useState(null);
  const [isStyleMenuOpen, setIsStyleMenuOpen] = useState(false);
  const [isMapModesFlashOn, setIsMapModesFlashOn] = useState(false);
  const [isLocationFlashOn, setIsLocationFlashOn] = useState(false);
  const [cloudAuthEmail, setCloudAuthEmail] = useState("");
  const [cloudAuthMessage, setCloudAuthMessage] = useState(null);
  const [cloudRoutesError, setCloudRoutesError] = useState(null);
  const [libraryError, setLibraryError] = useState(null);
  const [libraryMessage, setLibraryMessage] = useState(null);
  const [isCloudRoutesLoading, setIsCloudRoutesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [showCyclingOverlay, setShowCyclingOverlay] = useState(false);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) setIsSearchDropdownOpen(false);
      if (!styleControlsRef.current?.contains(event.target)) setIsStyleMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => { if (activeMenuPanel !== "search") setIsSearchDropdownOpen(false); }, [activeMenuPanel]);

  useEffect(() => {
    if (!isMapModesFlashOn) return;
    const t = setTimeout(() => setIsMapModesFlashOn(false), 200);
    return () => clearTimeout(t);
  }, [isMapModesFlashOn]);

  useEffect(() => {
    if (!isLocationFlashOn) return;
    const t = setTimeout(() => setIsLocationFlashOn(false), 200);
    return () => clearTimeout(t);
  }, [isLocationFlashOn]);

  useEffect(() => {
    if (skipNextSearchRef.current) { skipNextSearchRef.current = false; return; }
    const query = searchQuery.trim();
    if (!query || query.length < 3) { setSearchResults([]); setSearchError(null); setIsSearchLoading(false); return; }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchLoading(true);
      setSearchError(null);
      try {
        const features = await fetchSearchResults(query, controller.signal);
        setSearchResults(features);
        setIsSearchDropdownOpen(true);
      } catch (error) {
        if (error?.name === "AbortError") return;
        setSearchResults([]);
        setSearchError("Place search unavailable. Check your internet and try again.");
      } finally {
        setIsSearchLoading(false);
      }
    }, 240);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery]);

  const [routes, setRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw).map((r, i) => normalizeSavedRoute(r, i)).filter(Boolean) : [];
    } catch { return []; }
  });

  const [guestImportedRoutes, setGuestImportedRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(GPX_LIBRARY_STORAGE_KEY);
      return raw ? JSON.parse(raw).map((r, i) => normalizeImportedRoute(r, i)).filter(Boolean) : [];
    } catch { return []; }
  });
  const [cloudImportedRoutes, setCloudImportedRoutes] = useState([]);
  const [guestFolders, setGuestFolders] = useState(loadStoredFolderNames);
  const [cloudFolders, setCloudFolders] = useState([]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(routes)); }, [routes]);
  useEffect(() => { localStorage.setItem(GPX_LIBRARY_STORAGE_KEY, JSON.stringify(guestImportedRoutes)); }, [guestImportedRoutes]);

  const { isConfigured: isSupabaseConfigured, isReady: isSupabaseAuthReady, user: supabaseUser, userEmail: supabaseUserEmail, sendMagicLink, signOut: signOutOfSupabase } = useSupabaseAuth();

  const isCloudLibraryActive = isSupabaseConfigured && !!supabaseUser;
  const importedRoutes = isCloudLibraryActive ? cloudImportedRoutes : guestImportedRoutes;
  const explicitFolders = isCloudLibraryActive ? cloudFolders : guestFolders;

  const availableFolders = useMemo(
    () => Array.from(new Set([...explicitFolders, ...importedRoutes.map((r) => normalizeFolderName(r?.folder, ""))].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [explicitFolders, importedRoutes]
  );

  const activeVisibleFolders = useMemo(
    () => visibleFolders === null ? availableFolders : visibleFolders.filter((f) => availableFolders.includes(f)),
    [visibleFolders, availableFolders]
  );

  useEffect(() => {
    setOpenFolders((cur) => cur.filter((f) => availableFolders.includes(f)));
  }, [availableFolders]);

  useEffect(() => {
    setSelectedRouteIdsByFolder((cur) => {
      const next = {};
      let changed = false;
      for (const folder of availableFolders) {
        const validIds = new Set(importedRoutes.filter((r) => r.folder === folder).map((r) => r.id));
        const selectedIds = Array.isArray(cur?.[folder]) ? cur[folder].filter((id) => validIds.has(id)) : [];
        if (selectedIds.length) next[folder] = selectedIds;
        if (selectedIds.join("|") !== (Array.isArray(cur?.[folder]) ? cur[folder].join("|") : "")) changed = true;
      }
      if (!changed && Object.keys(next).length === Object.keys(cur || {}).length) return cur;
      return next;
    });
  }, [availableFolders, importedRoutes]);

  useEffect(() => {
    setBulkMoveTargets((cur) => {
      const next = {};
      let changed = false;
      for (const folder of availableFolders) {
        const currentTarget = typeof cur?.[folder] === "string" ? cur[folder] : "";
        const fallback = availableFolders.find((c) => c !== folder) || "";
        const normalized = currentTarget && currentTarget !== folder && availableFolders.includes(currentTarget) ? currentTarget : fallback;
        if (normalized) next[folder] = normalized;
        if (normalized !== currentTarget) changed = true;
      }
      if (!changed && Object.keys(next).length === Object.keys(cur || {}).length) return cur;
      return next;
    });
  }, [availableFolders]);

  const importedRoutesGeoJson = useMemo(() => buildImportedRoutesGeoJson(importedRoutes, activeVisibleFolders), [importedRoutes, activeVisibleFolders]);

  useEffect(() => {
    if (!isSupabaseConfigured || !isSupabaseAuthReady) return;
    if (!supabaseUser) { setCloudImportedRoutes([]); setCloudFolders([]); setCloudRoutesError(null); return; }
    let isCancelled = false;
    const load = async () => {
      setIsCloudRoutesLoading(true);
      setCloudRoutesError(null);
      try {
        const [routesResult, foldersResult] = await Promise.allSettled([listCloudImportedRoutes(supabaseUser.id), listCloudFolders(supabaseUser.id)]);
        if (isCancelled) return;
        if (routesResult.status === "fulfilled") setCloudImportedRoutes(routesResult.value);
        else throw routesResult.reason;
        if (foldersResult.status === "fulfilled") setCloudFolders(foldersResult.value);
        else {
          console.error("Failed to load cloud GPX folders:", foldersResult.reason);
          setCloudFolders([]);
          if (!isMissingCloudFoldersTableError(foldersResult.reason)) setCloudRoutesError(`Failed to load cloud GPX folders: ${foldersResult.reason?.message || "Unknown error"}`);
        }
      } catch (error) {
        if (!isCancelled) setCloudRoutesError(`Failed to load cloud GPX library: ${error?.message || "Unknown error"}`);
      } finally {
        if (!isCancelled) setIsCloudRoutesLoading(false);
      }
    };
    load();
    return () => { isCancelled = true; };
  }, [isSupabaseConfigured, isSupabaseAuthReady, supabaseUser]);

  const { distanceKm, elevationGainM, elevationLossM, routeGeoJson, locationState, isRouting, routingError, waypointsRef, routeDataRef, undoLast, clearAll, locateUser, routeToDestination, loadRouteOnMap, addWaypoint, getCurrentLocation } = useMap({
    appleMapContainerRef, mapContainerRef, mapStyle, importedRoutesGeoJson, routingMode, isMobile, speedMode, showCyclingOverlay,
    onFirstClick: (lngLat) => setPendingPin(lngLat),
  });

  const showRoutingUi = activeMenuPanel === "route" || waypointsRef.current.length > 0;
  const bottomSheetHeight = isGraphExpanded ? "max(40vh, 300px)" : 68;

  const handleElevationHoverCoordinateChange = useCallback((coordinates) => {
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      setElevationHoverCoordinate(coordinates);
      return;
    }
    clearElevationHoverCoordinate();
  }, [setElevationHoverCoordinate, clearElevationHoverCoordinate]);

  // --- Handlers ---

  const handleLocationNo = () => { if (!pendingPin) return; addWaypoint(pendingPin.lng, pendingPin.lat); setPendingPin(null); };
  const handleLocationYes = async () => {
    if (!pendingPin) return;
    try {
      const loc = await getCurrentLocation();
      if (loc) { addWaypoint(loc[0], loc[1]); addWaypoint(pendingPin.lng, pendingPin.lat); }
    } catch { addWaypoint(pendingPin.lng, pendingPin.lat); }
    finally { setPendingPin(null); }
  };

  const saveRoute = () => {
    if (!routeDataRef.current || waypointsRef.current.length < 2) return;
    const entry = { id: activeRouteId || uid(), name: routeName || "My Route", createdAt: new Date().toISOString(), routingMode, waypoints: waypointsRef.current, routeGeoJson: routeDataRef.current, distanceKm, elevationGainM, elevationLossM };
    setRoutes((prev) => { const exists = prev.find((r) => r.id === entry.id); return exists ? prev.map((r) => r.id === entry.id ? entry : r) : [entry, ...prev]; });
    setActiveRouteId(entry.id);
  };

  const loadRoute = (id) => {
    const r = routes.find((x) => x.id === id);
    if (!r) return;
    setActiveRouteId(r.id); setRouteName(r.name);
    setRoutingMode(r.routingMode || (r.gravelMode ? "gravel" : "regular"));
    loadRouteOnMap(r);
  };

  const deleteRoute = (id) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    if (activeRouteId === id) { setActiveRouteId(null); setRouteName("My Route"); clearAll(); }
  };

  const newRoute = () => { setActiveRouteId(null); setRouteName("My Route"); clearAll(); };

  const exportGPX = () => {
    if (!routeDataRef.current) return;
    const gpx = buildGpxFromRouteGeoJson(routeDataRef.current, routeName || "Route");
    if (!gpx) return;
    const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${(routeName || "route").replace(/\s+/g, "_")}.gpx`; a.click();
    URL.revokeObjectURL(url);
  };

  const addFolderToVisibleList = (folder) => {
    const f = normalizeFolderName(folder);
    setVisibleFolders((cur) => cur === null ? null : cur.includes(f) ? cur : [...cur, f]);
  };

  const openFolder = (folder) => {
    const f = normalizeFolderName(folder);
    setOpenFolders((cur) => cur.includes(f) ? cur : [...cur, f]);
  };

  const toggleFolderOpen = (folder) => {
    const f = normalizeFolderName(folder);
    setOpenFolders((cur) => cur.includes(f) ? cur.filter((e) => e !== f) : [...cur, f]);
  };

  const clearFolderSelection = (folder) => {
    const f = normalizeFolderName(folder);
    setSelectedRouteIdsByFolder((cur) => { if (!cur?.[f]?.length) return cur; const next = { ...cur }; delete next[f]; return next; });
  };

  const toggleRouteSelection = (folder, routeId) => {
    const f = normalizeFolderName(folder);
    setSelectedRouteIdsByFolder((cur) => {
      const existing = Array.isArray(cur?.[f]) ? cur[f] : [];
      const next = existing.includes(routeId) ? existing.filter((id) => id !== routeId) : [...existing, routeId];
      if (!next.length) { const r = { ...cur }; delete r[f]; return r; }
      return { ...cur, [f]: next };
    });
  };

  const selectAllRoutesInFolder = (folder) => {
    const f = normalizeFolderName(folder);
    const ids = importedRoutes.filter((r) => r.folder === f).map((r) => r.id);
    setSelectedRouteIdsByFolder((cur) => ({ ...cur, [f]: ids }));
  };

  const removeFolderFromLocalLists = (folder) => {
    const f = normalizeFolderName(folder);
    setGuestFolders((cur) => cur.filter((e) => e !== f));
    setCloudFolders((cur) => cur.filter((e) => e !== f));
    setOpenFolders((cur) => cur.filter((e) => e !== f));
    setVisibleFolders((cur) => cur === null ? null : cur.filter((e) => e !== f));
    setSelectedRouteIdsByFolder((cur) => { if (!cur?.[f]) return cur; const next = { ...cur }; delete next[f]; return next; });
    setBulkMoveTargets((cur) => { if (!cur?.[f]) return cur; const next = { ...cur }; delete next[f]; return next; });
  };

  const handleCreateFolder = async () => {
    const folder = normalizeFolderName(newFolderName, "");
    if (!folder) { setLibraryMessage(null); setLibraryError("Enter a folder name before creating a folder."); return; }
    setLibraryError(null); setLibraryMessage(null);
    if (availableFolders.includes(folder)) { addFolderToVisibleList(folder); openFolder(folder); setNewFolderName(""); setLibraryMessage(`Folder "${folder}" already exists.`); return; }
    if (isCloudLibraryActive && supabaseUser) {
      setIsCloudRoutesLoading(true);
      try {
        const created = await createCloudFolder({ userId: supabaseUser.id, name: folder });
        setCloudFolders((cur) => appendFolderName(cur, created));
        addFolderToVisibleList(created); openFolder(created); setNewFolderName("");
        setLibraryMessage(`Created folder "${created}".`);
      } catch (error) {
        if (isMissingCloudFoldersTableError(error)) setLibraryError("Cloud folder creation needs the latest Supabase SQL setup. Re-run supabase/setup.sql once, then refresh.");
        else setLibraryError(`Failed to create folder: ${error?.message || "Unknown error"}`);
      } finally { setIsCloudRoutesLoading(false); }
      return;
    }
    setGuestFolders((cur) => appendFolderName(cur, folder));
    addFolderToVisibleList(folder); openFolder(folder); setNewFolderName("");
    setLibraryMessage(`Created folder "${folder}".`);
  };

  const handleGpxUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    const folder = "Imported";
    if (!files.length) { event.target.value = ""; return; }
    setLibraryError(null); setLibraryMessage(null);
    if (isCloudLibraryActive && supabaseUser) {
      setIsCloudRoutesLoading(true); setCloudRoutesError(null);
      try {
        await createCloudFolder({ userId: supabaseUser.id, name: folder, allowMissingTable: true });
        const uploaded = (await Promise.all(files.map((file, i) => uploadCloudImportedRoute({ userId: supabaseUser.id, file, folder, color: getDefaultRouteColor(i), index: i })))).filter(Boolean);
        if (uploaded.length) { setCloudFolders((cur) => appendFolderName(cur, folder)); setCloudImportedRoutes((cur) => [...uploaded, ...cur]); addFolderToVisibleList(folder); openFolder(folder); }
      } catch (error) { setLibraryError(`Failed to upload GPX files: ${error?.message || "Unknown error"}`); }
      finally { setIsCloudRoutesLoading(false); event.target.value = ""; }
      return;
    }
    const parsed = (await Promise.all(files.map(async (file, i) => {
      const text = await file.text();
      const p = parseGpxText(text);
      if (!p) return null;
      return { id: uid(), folder, name: p.name || file.name.replace(/\.gpx$/i, ""), fileName: file.name, importedAt: new Date().toISOString(), color: getDefaultRouteColor(i), geoJson: p.featureCollection };
    }))).filter(Boolean);
    if (!parsed.length) { setLibraryError("None of the selected files were valid GPX files."); event.target.value = ""; return; }
    setGuestFolders((cur) => appendFolderName(cur, folder));
    setGuestImportedRoutes((cur) => [...parsed, ...cur]);
    addFolderToVisibleList(folder); openFolder(folder);
    event.target.value = "";
  };

  const toggleFolderVisibility = (folder) => {
    setVisibleFolders((cur) => { const base = cur === null ? availableFolders : cur; return base.includes(folder) ? base.filter((e) => e !== folder) : [...base, folder]; });
  };

  const updateImportedRouteColor = (routeId, color) => {
    if (isCloudLibraryActive) {
      const prev = cloudImportedRoutes.find((r) => r.id === routeId)?.color;
      setLibraryError(null); setLibraryMessage(null);
      setCloudImportedRoutes((cur) => cur.map((r) => r.id === routeId ? { ...r, color } : r));
      updateCloudImportedRouteColor(routeId, color).catch((error) => {
        setCloudImportedRoutes((cur) => cur.map((r) => r.id === routeId ? { ...r, color: prev || r.color } : r));
        setLibraryError(`Failed to update route color: ${error?.message || "Unknown error"}`);
      });
      return;
    }
    setGuestImportedRoutes((cur) => cur.map((r) => r.id === routeId ? { ...r, color } : r));
  };

  const moveImportedRoutesToFolder = async (routeIds, nextFolder) => {
    const ids = Array.isArray(routeIds) ? Array.from(new Set(routeIds.filter(Boolean))) : [];
    const folder = normalizeFolderName(nextFolder);
    const selected = importedRoutes.filter((e) => ids.includes(e.id));
    if (!selected.length) return;
    const toMove = selected.filter((r) => r.folder !== folder);
    if (!toMove.length) return;
    const movingIds = new Set(toMove.map((r) => r.id));
    setLibraryError(null); setLibraryMessage(null);
    addFolderToVisibleList(folder); openFolder(folder);
    if (isCloudLibraryActive && supabaseUser) {
      const prev = cloudImportedRoutes;
      setCloudImportedRoutes((cur) => cur.map((e) => movingIds.has(e.id) ? { ...e, folder } : e));
      setCloudFolders((cur) => appendFolderName(cur, folder));
      try {
        await createCloudFolder({ userId: supabaseUser.id, name: folder, allowMissingTable: true });
        await updateCloudImportedRoutesFolder(toMove.map((r) => r.id), folder);
        setLibraryMessage(toMove.length === 1 ? `Moved "${toMove[0].name}" to "${folder}".` : `Moved ${toMove.length} routes to "${folder}".`);
      } catch (error) {
        setCloudImportedRoutes(prev);
        setLibraryError(`Failed to move route: ${error?.message || "Unknown error"}`);
        return false;
      }
    } else {
      setGuestFolders((cur) => appendFolderName(cur, folder));
      setGuestImportedRoutes((cur) => cur.map((e) => movingIds.has(e.id) ? { ...e, folder } : e));
      setLibraryMessage(toMove.length === 1 ? `Moved "${toMove[0].name}" to "${folder}".` : `Moved ${toMove.length} routes to "${folder}".`);
    }
    setSelectedRouteIdsByFolder((cur) => {
      const next = { ...cur };
      for (const r of toMove) {
        const rf = normalizeFolderName(r.folder);
        if (next[rf]) { next[rf] = next[rf].filter((id) => id !== r.id); if (!next[rf].length) delete next[rf]; }
      }
      return next;
    });
    return true;
  };

  const removeFolder = async (folder) => {
    const f = normalizeFolderName(folder);
    if (f === "Imported") { setLibraryMessage(null); setLibraryError("The Imported folder cannot be removed."); return; }
    const folderRoutes = importedRoutes.filter((r) => r.folder === f);
    setLibraryError(null); setLibraryMessage(null);
    if (folderRoutes.length) { const ok = await moveImportedRoutesToFolder(folderRoutes.map((r) => r.id), "Imported"); if (!ok) return; }
    if (isCloudLibraryActive && supabaseUser) {
      try { await deleteCloudFolder({ userId: supabaseUser.id, name: f, allowMissingTable: true }); }
      catch (error) { setLibraryError(`Failed to remove folder: ${error?.message || "Unknown error"}`); return; }
    }
    removeFolderFromLocalLists(f);
    setLibraryMessage(folderRoutes.length ? `Moved ${folderRoutes.length} routes to "Imported" and removed "${f}".` : `Removed folder "${f}".`);
  };

  const refreshCloudRoutes = async () => {
    if (!supabaseUser) return;
    setIsCloudRoutesLoading(true); setCloudRoutesError(null);
    try {
      const [r, f] = await Promise.all([listCloudImportedRoutes(supabaseUser.id), listCloudFolders(supabaseUser.id).catch((e) => { console.error(e); return []; })]);
      setCloudImportedRoutes(r); setCloudFolders(f);
    } catch (error) { setCloudRoutesError(`Failed to refresh cloud GPX library: ${error?.message || "Unknown error"}`); }
    finally { setIsCloudRoutesLoading(false); }
  };

  const handleCloudSignIn = async () => {
    setCloudRoutesError(null); setCloudAuthMessage(null);
    try { const email = await sendMagicLink(cloudAuthEmail); setCloudAuthMessage(`Magic link sent to ${email}`); }
    catch (error) { setCloudRoutesError(`Failed to send sign-in link: ${error?.message || "Unknown error"}`); }
  };

  const handleCloudSignOut = async () => {
    setCloudRoutesError(null); setCloudAuthMessage(null);
    try { await signOutOfSupabase(); }
    catch (error) { setCloudRoutesError(`Failed to sign out: ${error?.message || "Unknown error"}`); }
  };

  const getSearchResultLabels = (feature) => {
    const primary = feature?.text || feature?.place_name || "Unnamed place";
    const secondary = feature?.place_name && feature.place_name !== primary ? feature.place_name : "";
    return { primary, secondary };
  };

  const handleSearchSelect = async (feature) => {
    if (!Array.isArray(feature?.center) || feature.center.length < 2) return;
    const label = feature?.place_name || feature?.text || "";
    skipNextSearchRef.current = true;
    setSearchQuery(label); setIsSearchDropdownOpen(false); setSearchError(null);
    if (isMobile) setActiveMenuPanel(null);
    const result = await routeToDestination(feature.center);
    if (!result?.ok) setSearchError(result?.message || "Could not route to that place.");
  };

  const handleSearchKeyDown = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!searchResults.length) return;
    await handleSearchSelect(searchResults[0]);
  };

  const toggleMenuPanel = (panelKey) => {
    setActiveMenuPanel((cur) => cur === panelKey ? null : panelKey);
  };

  const getPressHandlers = (buttonId) => ({
    onMouseDown: () => setPressedButton(buttonId),
    onMouseUp: () => setPressedButton(null),
    onMouseLeave: () => setPressedButton((cur) => cur === buttonId ? null : cur),
    onTouchStart: () => setPressedButton(buttonId),
    onTouchEnd: () => setPressedButton(null),
  });

  // --- Styles ---
  const { getButtonStyle, inputStyle, getMenuIconButtonStyle, expandedMenuFloatingStyle, libraryPanelFloatingStyle, librarySectionStyle, getLibraryBadgeStyle, getLibraryButtonStyle, libraryInputStyle } = createStyleHelpers({ isMobile, pressedButton, activeMenuPanel });

  const libraryProps = {
    isMobile,
    isSupabaseConfigured, isSupabaseAuthReady, supabaseUser, supabaseUserEmail,
    isCloudLibraryActive, isCloudRoutesLoading, cloudRoutesError, cloudAuthEmail, setCloudAuthEmail, cloudAuthMessage,
    refreshCloudRoutes, handleCloudSignIn, handleCloudSignOut,
    importedRoutes, cloudImportedRoutes, routes, activeRouteId,
    availableFolders, activeVisibleFolders, openFolders, selectedRouteIdsByFolder, bulkMoveTargets,
    libraryError, libraryMessage,
    newFolderName, setNewFolderName,
    toggleFolderVisibility, toggleFolderOpen, selectAllRoutesInFolder, clearFolderSelection,
    toggleRouteSelection, moveImportedRoutesToFolder, updateImportedRouteColor,
    setBulkMoveTargets, setVisibleFolders, removeFolder, handleCreateFolder,
    loadRoute, deleteRoute,
    gpxFileInputRef,
    getPressHandlers, pressedButton,
    librarySectionStyle, getLibraryBadgeStyle, getLibraryButtonStyle, libraryInputStyle,
  };

  return (
    <>
      <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
        <div ref={appleMapContainerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0, transition: "opacity 0.18s ease" }} />
        <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
      </div>

      <input ref={gpxFileInputRef} type="file" accept=".gpx" multiple onChange={handleGpxUpload} style={{ display: "none" }} />

      {showRoutingUi && !(isMobile && activeMenuPanel === "search") && (
        <RouteToolbar
          undoLast={undoLast} clearAll={clearAll}
          distanceKm={distanceKm} elevationGainM={elevationGainM}
          isMobile={isMobile} isRouting={isRouting} routingError={routingError}
          saveRoute={saveRoute} exportGPX={exportGPX}
          routeName={routeName} setRouteName={setRouteName}
          newRoute={newRoute}
          routingMode={routingMode} setRoutingMode={setRoutingMode}
          getPressHandlers={getPressHandlers} getButtonStyle={getButtonStyle} inputStyle={inputStyle}
          pressedButton={pressedButton}
          waypointsCount={waypointsRef.current.length}
          bottomSheetHeight={bottomSheetHeight}
        />
      )}

      {showRoutingUi && waypointsRef.current.length > 0 && (
        <ElevationSheet
          routeGeoJson={routeGeoJson} elevationGainM={elevationGainM} elevationLossM={elevationLossM} distanceKm={distanceKm}
          isMobile={isMobile} bottomSheetHeight={bottomSheetHeight}
          isGraphExpanded={isGraphExpanded} setIsGraphExpanded={setIsGraphExpanded}
          onHoverCoordinateChange={handleElevationHoverCoordinateChange}
        />
      )}

      <QuickMenu
        quickMenuRef={quickMenuRef} isMobile={isMobile}
        activeMenuPanel={activeMenuPanel} toggleMenuPanel={toggleMenuPanel}
        speedMode={speedMode} setSpeedMode={setSpeedMode}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        searchResults={searchResults} isSearchLoading={isSearchLoading} searchError={searchError}
        isSearchDropdownOpen={isSearchDropdownOpen} setIsSearchDropdownOpen={setIsSearchDropdownOpen}
        handleSearchSelect={handleSearchSelect} handleSearchKeyDown={handleSearchKeyDown}
        getSearchResultLabels={getSearchResultLabels} searchBoxRef={searchBoxRef}
        libraryProps={libraryProps}
        getMenuIconButtonStyle={getMenuIconButtonStyle}
        expandedMenuFloatingStyle={expandedMenuFloatingStyle}
        libraryPanelFloatingStyle={libraryPanelFloatingStyle}
        inputStyle={inputStyle}
      />

      {isMobile && activeMenuPanel === "library" && (
        <>
          <div
            onClick={() => toggleMenuPanel("library")}
            style={{ position: "fixed", inset: 0, zIndex: 9, background: "rgba(15, 23, 42, 0.4)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
          />
          <div style={{
            position: "fixed",
            bottom: "env(safe-area-inset-bottom, 0px)",
            left: 0, right: 0,
            maxHeight: "min(85dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 48px))",
            overflowY: "auto",
            zIndex: 10,
            borderRadius: "20px 20px 0 0",
            padding: "12px 14px 24px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,249,252,0.96) 100%)",
            boxShadow: "0 -8px 32px rgba(15, 23, 42, 0.18), 0 -2px 8px rgba(15, 23, 42, 0.08)",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(15,23,42,0.18)", margin: "0 auto 14px" }} />
            <LibraryPanel {...libraryProps} />
          </div>
        </>
      )}

      {isMobile && activeMenuPanel === "search" && (
        <div style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          width: "calc(100vw - 40px)",
          maxWidth: 480,
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid rgba(255,255,255,0.55)",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(15,23,42,0.12)",
          padding: "10px 12px",
        }}>
          <SearchPanel
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            searchResults={searchResults} isSearchLoading={isSearchLoading} searchError={searchError}
            isSearchDropdownOpen={isSearchDropdownOpen} setIsSearchDropdownOpen={setIsSearchDropdownOpen}
            handleSearchSelect={handleSearchSelect} handleSearchKeyDown={handleSearchKeyDown}
            getSearchResultLabels={getSearchResultLabels} searchBoxRef={searchBoxRef}
            inputStyle={{ ...inputStyle, background: "rgba(255,255,255,0.65)", border: "1px solid rgba(15,23,42,0.1)", borderRadius: 10 }}
            autoFocus
          />
        </div>
      )}

      <MapStylePicker
        mapStyle={mapStyle} setMapStyle={setMapStyle}
        locateUser={locateUser} locationState={locationState}
        isMobile={isMobile}
        isStyleMenuOpen={isStyleMenuOpen} setIsStyleMenuOpen={setIsStyleMenuOpen}
        isMapModesFlashOn={isMapModesFlashOn} setIsMapModesFlashOn={setIsMapModesFlashOn}
        isLocationFlashOn={isLocationFlashOn} setIsLocationFlashOn={setIsLocationFlashOn}
        styleControlsRef={styleControlsRef}
        showRoutingUi={showRoutingUi} waypointsCount={waypointsRef.current.length} bottomSheetHeight={bottomSheetHeight}
      />

      <PendingPinDialog
        pendingPin={pendingPin}
        handleLocationYes={handleLocationYes} handleLocationNo={handleLocationNo}
        isMobile={isMobile} getButtonStyle={getButtonStyle}
      />

      {mapStyle === "outdoor" && (
        <div
          onClick={() => setShowCyclingOverlay((v) => !v)}
          role="button"
          aria-pressed={showCyclingOverlay}
          style={{
            position: "absolute", bottom: "calc(10px + env(safe-area-inset-bottom, 0px))", right: "calc(10px + env(safe-area-inset-right, 0px))", zIndex: 2,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            borderRadius: 999,
            padding: "10px 16px",
            boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
            display: "flex", alignItems: "center", gap: 10,
            cursor: "pointer",
            userSelect: "none", WebkitTapHighlightColor: "transparent",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: "#24364b" }}>Cycling routes</span>
          <div style={{
            width: 42, height: 26, borderRadius: 999,
            background: showCyclingOverlay ? "#34c759" : "rgba(120,120,128,0.32)",
            position: "relative",
            transition: "background 0.2s ease",
            flexShrink: 0,
          }}>
            <div style={{
              position: "absolute",
              top: 3, left: showCyclingOverlay ? 19 : 3,
              width: 20, height: 20, borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
              transition: "left 0.2s ease",
            }} />
          </div>
        </div>
      )}
    </>
  );
}
