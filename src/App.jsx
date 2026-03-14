import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORAGE_KEY, GPX_LIBRARY_STORAGE_KEY, resolveRoutingMode } from "./constants";
import { uid } from "./utils/geo";
import { buildGpxFromRouteGeoJson, parseGpxText } from "./utils/gpx";
import { normalizeImportedRoute, normalizeSavedRoute, buildImportedRoutesGeoJson, getDefaultRouteColor } from "./utils/routes";
import { normalizeFolderName, appendFolderName, loadStoredFolderNames } from "./utils/folders";
import { fetchSearchResults } from "./utils/search";
import { useMap } from "./hooks/useMap";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { listCloudImportedRoutes, listCloudFolders, createCloudFolder, updateCloudImportedRouteColor, updateCloudImportedRoutesFolder, deleteCloudImportedRoutes, deleteCloudFolder, uploadCloudImportedRoute, isMissingCloudFoldersTableError, listCloudSavedRoutes, upsertCloudSavedRoute, deleteCloudSavedRoute, updateCloudSavedRouteName } from "./utils/cloudRoutes";
import { createStyleHelpers } from "./styles/appStyles";
import { RouteToolbar } from "./components/RouteToolbar";
import { ElevationSheet } from "./components/ElevationSheet";
import { PendingPinDialog } from "./components/PendingPinDialog";
import { QuickMenu } from "./components/QuickMenu";
import { SearchPanel } from "./components/SearchPanel";
import { LibraryPanel } from "./components/LibraryPanel";
import { UndoButton } from "./components/UndoButton";

export default function App() {
  const appleMapContainerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const gpxFileInputRef = useRef(null);
  const quickMenuRef = useRef(null);
  const styleControlsRef = useRef(null);
  const searchBoxRef = useRef(null);
  const skipNextSearchRef = useRef(false);

  const [routeName, setRouteName] = useState("My Route");
  const [routingMode, setRoutingMode] = useState("default");
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
  const [cloudRoutesError, setCloudRoutesError] = useState(null);
  const [libraryError, setLibraryError] = useState(null);
  const [libraryMessage, setLibraryMessage] = useState(null);
  const [savedRouteRevealTick, setSavedRouteRevealTick] = useState(0);
  const [savedRoutesSort, setSavedRoutesSort] = useState("newest");
  const [isCloudRoutesLoading, setIsCloudRoutesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [showCyclingOverlay, setShowCyclingOverlay] = useState(false);
  const [elevationHidden, setElevationHidden] = useState(false);
  const [panelAnimatingOut, setPanelAnimatingOut] = useState(null);
  const panelAnimOutTimer = useRef(null);
  const [routeContextMenu, setRouteContextMenu] = useState(null); // { id, top, right }
  const [pendingOverwriteEntry, setPendingOverwriteEntry] = useState(null);
  const [pendingDeleteRouteId, setPendingDeleteRouteId] = useState(null);

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
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => { if (activeMenuPanel !== "search") setIsSearchDropdownOpen(false); }, [activeMenuPanel]);

  useEffect(() => {
    if (activeMenuPanel !== "library" || isMobile) return;
    const handleClick = (e) => {
      if (!quickMenuRef.current?.contains(e.target)) {
        e.stopPropagation();
        setActiveMenuPanel(null);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [activeMenuPanel, isMobile]);

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

  const [guestRoutes, setGuestRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw).map((r, i) => normalizeSavedRoute(r, i)).filter(Boolean) : [];
    } catch { return []; }
  });
  const [cloudSavedRoutes, setCloudSavedRoutes] = useState([]);

  const [guestImportedRoutes, setGuestImportedRoutes] = useState(() => {
    try {
      const raw = localStorage.getItem(GPX_LIBRARY_STORAGE_KEY);
      return raw ? JSON.parse(raw).map((r, i) => normalizeImportedRoute(r, i)).filter(Boolean) : [];
    } catch { return []; }
  });
  const [cloudImportedRoutes, setCloudImportedRoutes] = useState([]);
  const [guestFolders, setGuestFolders] = useState(loadStoredFolderNames);
  const [cloudFolders, setCloudFolders] = useState([]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(guestRoutes)); }, [guestRoutes]);
  useEffect(() => { localStorage.setItem(GPX_LIBRARY_STORAGE_KEY, JSON.stringify(guestImportedRoutes)); }, [guestImportedRoutes]);

  const { isConfigured: isSupabaseConfigured, isReady: isSupabaseAuthReady, user: supabaseUser, userEmail: supabaseUserEmail, userName: supabaseUserName, userAvatarUrl: supabaseUserAvatarUrl, signInWithGoogle, signOut: signOutOfSupabase } = useSupabaseAuth();

  const isCloudLibraryActive = isSupabaseConfigured && !!supabaseUser;
  const routes = isCloudLibraryActive ? cloudSavedRoutes : guestRoutes;
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

  const [focusedImportedRouteId, setFocusedImportedRouteId] = useState(null);

  const focusImportedRoute = useCallback((routeId) => {
    setFocusedImportedRouteId((cur) => cur === routeId ? null : routeId);
    if (routeId) {
      const route = importedRoutes.find((r) => r.id === routeId);
      if (route?.folder) {
        setVisibleFolders((cur) => {
          if (cur === null) return null;
          return cur.includes(route.folder) ? cur : [...cur, route.folder];
        });
      }
    }
  }, [importedRoutes]);

  const isEditorMode = activeMenuPanel === "route";
  const importedRoutesGeoJson = useMemo(() => buildImportedRoutesGeoJson(importedRoutes, activeVisibleFolders, focusedImportedRouteId, isEditorMode), [importedRoutes, activeVisibleFolders, focusedImportedRouteId, isEditorMode]);

  useEffect(() => {
    if (!isSupabaseConfigured || !isSupabaseAuthReady) return;
    if (!supabaseUser) { setCloudImportedRoutes([]); setCloudFolders([]); setCloudSavedRoutes([]); setCloudRoutesError(null); return; }
    let isCancelled = false;
    const load = async () => {
      setIsCloudRoutesLoading(true);
      setCloudRoutesError(null);
      try {
        const [routesResult, foldersResult, savedRoutesResult] = await Promise.allSettled([listCloudImportedRoutes(supabaseUser.id), listCloudFolders(supabaseUser.id), listCloudSavedRoutes(supabaseUser.id)]);
        if (isCancelled) return;
        if (routesResult.status === "fulfilled") setCloudImportedRoutes(routesResult.value);
        else throw routesResult.reason;
        if (foldersResult.status === "fulfilled") setCloudFolders(foldersResult.value);
        else {
          console.error("Failed to load cloud GPX folders:", foldersResult.reason);
          setCloudFolders([]);
          if (!isMissingCloudFoldersTableError(foldersResult.reason)) setCloudRoutesError(`Failed to load cloud GPX folders: ${foldersResult.reason?.message || "Unknown error"}`);
        }
        if (savedRoutesResult.status === "fulfilled") setCloudSavedRoutes(savedRoutesResult.value);
        else console.error("Failed to load cloud saved routes:", savedRoutesResult.reason);
      } catch (error) {
        if (!isCancelled) setCloudRoutesError(`Failed to load cloud GPX library: ${error?.message || "Unknown error"}`);
      } finally {
        if (!isCancelled) setIsCloudRoutesLoading(false);
      }
    };
    load();
    return () => { isCancelled = true; };
  }, [isSupabaseConfigured, isSupabaseAuthReady, supabaseUser]);

  const { distanceKm, elevationGainM, elevationLossM, routeGeoJson, locationState, isRouting, routingError, waypointsRef, waypointsCount, routeDataRef, undoLast, clearAll, locateUser, routeToDestination, loadRouteOnMap, addWaypoint, setElevationHoverCoordinate, clearElevationHoverCoordinate, getCurrentLocation, clearPendingPinMarker } = useMap({
    appleMapContainerRef, mapContainerRef, mapStyle, importedRoutesGeoJson, routingMode, isMobile, speedMode, showCyclingOverlay,
    onFirstClick: (lngLat) => { setPendingPin(lngLat); setActiveMenuPanel(null); },
  });

  const showRoutingUi = activeMenuPanel === "route" || waypointsCount > 0;
  const bottomSheetHeight = isGraphExpanded ? "max(40vh, 300px)" : "68px";

  const handleElevationHoverCoordinateChange = useCallback((coordinates) => {
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      setElevationHoverCoordinate(coordinates);
      return;
    }
    clearElevationHoverCoordinate();
  }, [setElevationHoverCoordinate, clearElevationHoverCoordinate]);

  // --- Handlers ---

  const handleLocationNo = () => { if (!pendingPin) return; clearPendingPinMarker(); addWaypoint(pendingPin.lng, pendingPin.lat); setPendingPin(null); };
  const handleLocationCancel = () => { clearPendingPinMarker(); setPendingPin(null); };
  const handleLocationYes = async () => {
    if (!pendingPin) return;
    clearPendingPinMarker();
    try {
      const loc = await getCurrentLocation();
      if (loc) { addWaypoint(loc[0], loc[1]); addWaypoint(pendingPin.lng, pendingPin.lat); }
    } catch { addWaypoint(pendingPin.lng, pendingPin.lat); }
    finally { setPendingPin(null); }
  };

  const doSaveRoute = (entry) => {
    const updater = (prev) => { const exists = prev.find((r) => r.id === entry.id); return exists ? prev.map((r) => r.id === entry.id ? entry : r) : [entry, ...prev]; };
    if (isCloudLibraryActive && supabaseUser) {
      setCloudSavedRoutes(updater);
      upsertCloudSavedRoute(supabaseUser.id, entry).catch((err) => console.error("Failed to sync route to cloud:", err));
    } else {
      setGuestRoutes(updater);
    }
    setActiveRouteId(entry.id);
    setSavedRouteRevealTick((cur) => cur + 1);
    setIsStyleMenuOpen(false);
    if (isMobile) setIsGraphExpanded(false);
    setActiveMenuPanel("library");
  };

  const saveRoute = () => {
    if (!routeDataRef.current || waypointsRef.current.length < 2) return;
    const entry = { id: activeRouteId || uid(), name: routeName || "My Route", createdAt: new Date().toISOString(), routingMode, waypoints: waypointsRef.current, routeGeoJson: routeDataRef.current, distanceKm, elevationGainM, elevationLossM };
    if (routes.some((r) => r.id === entry.id)) { setPendingOverwriteEntry(entry); return; }
    doSaveRoute(entry);
  };

  const confirmOverwrite = () => { if (!pendingOverwriteEntry) return; doSaveRoute(pendingOverwriteEntry); setPendingOverwriteEntry(null); };
  const cancelOverwrite = () => setPendingOverwriteEntry(null);

  const loadRoute = (id) => {
    const r = routes.find((x) => x.id === id);
    if (!r) return;
    setActiveRouteId(r.id); setRouteName(r.name);
    setRoutingMode(resolveRoutingMode(r.routingMode || (r.gravelMode ? "gravel" : "regular")));
    loadRouteOnMap(r);
  };

  const deleteRoute = (id) => {
    if (isCloudLibraryActive && supabaseUser) {
      setCloudSavedRoutes((prev) => prev.filter((r) => r.id !== id));
      deleteCloudSavedRoute(id).catch((err) => console.error("Failed to delete route from cloud:", err));
    } else {
      setGuestRoutes((prev) => prev.filter((r) => r.id !== id));
    }
    if (activeRouteId === id) { setActiveRouteId(null); setRouteName("My Route"); clearAll(); }
  };

  const newRoute = () => { setActiveRouteId(null); setRouteName("My Route"); clearAll(); };

  // Wrap clearAll so the toolbar's Clear button also resets the active route ID,
  // preventing the next Save from overwriting a previously-saved route.
  const handleClearAll = useCallback(() => {
    setActiveRouteId(null);
    setRouteName("My Route");
    clearAll();
  }, [clearAll]);

  const renameRoute = useCallback((id, newName) => {
    const name = (newName || "").trim() || "My Route";
    const updater = (prev) => prev.map((r) => r.id === id ? { ...r, name } : r);
    if (isCloudLibraryActive && supabaseUser) {
      setCloudSavedRoutes(updater);
      updateCloudSavedRouteName(id, name).catch((err) => console.error("Failed to rename route in cloud:", err));
    } else {
      setGuestRoutes(updater);
    }
    if (activeRouteId === id) setRouteName(name);
  }, [isCloudLibraryActive, supabaseUser, activeRouteId]);

  const exportRouteById = useCallback((id) => {
    const r = routes.find((x) => x.id === id);
    if (!r?.routeGeoJson) return;
    const gpx = buildGpxFromRouteGeoJson(r.routeGeoJson, r.name || "Route");
    if (!gpx) return;
    const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${(r.name || "route").replace(/\s+/g, "_")}.gpx`; a.click();
    URL.revokeObjectURL(url);
  }, [routes]);

  const openRouteContextMenu = useCallback((id, rect) => {
    const menuHeight = 128;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= menuHeight + 8 ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
    setRouteContextMenu({ id, top, right: Math.max(8, window.innerWidth - rect.right) });
  }, []);

  const shareRouteById = useCallback(async (id) => {
    const r = routes.find((x) => x.id === id);
    if (!r?.routeGeoJson) return;
    const gpx = buildGpxFromRouteGeoJson(r.routeGeoJson, r.name || "Route");
    if (!gpx) return;
    const fileName = `${(r.name || "route").replace(/[^a-zA-Z0-9_.-]/g, "_")}.gpx`;
    const file = new File([gpx], fileName, { type: "application/gpx+xml" });
    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title: r.name, files: [file] }); }
      catch (err) { if (err?.name !== "AbortError") exportRouteById(id); }
    } else {
      exportRouteById(id);
    }
  }, [routes, exportRouteById]);

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
    const isClosing = openFolders.includes(f);
    setOpenFolders((cur) => isClosing ? cur.filter((e) => e !== f) : [...cur, f]);
    if (isClosing) {
      setSelectedRouteIdsByFolder((cur) => { if (!cur?.[f]?.length) return cur; const next = { ...cur }; delete next[f]; return next; });
    }
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
    if (!files.length) { event.target.value = ""; return; }
    setLibraryError(null); setLibraryMessage(null);

    const currentYear = String(new Date().getFullYear());
    const getFolderForParsed = (parsed) => {
      if (parsed?.activityDate instanceof Date) return String(parsed.activityDate.getFullYear());
      return currentYear;
    };

    const BATCH_SIZE = 5;

    if (isCloudLibraryActive && supabaseUser) {
      setIsCloudRoutesLoading(true); setCloudRoutesError(null);
      try {
        const createdFolders = new Set();
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);
          const uploaded = (await Promise.all(batch.map(async (file, batchIdx) => {
            try {
              const text = await file.text();
              const parsed = parseGpxText(text);
              const folder = getFolderForParsed(parsed);
              if (!createdFolders.has(folder)) {
                await createCloudFolder({ userId: supabaseUser.id, name: folder, allowMissingTable: true });
                createdFolders.add(folder);
              }
              return await uploadCloudImportedRoute({ userId: supabaseUser.id, file, folder, color: getDefaultRouteColor(i + batchIdx), index: i + batchIdx });
            } catch { return null; }
          }))).filter(Boolean);
          if (uploaded.length) {
            const folders = [...new Set(uploaded.map((r) => r.folder))];
            setCloudFolders((cur) => folders.reduce((acc, f) => appendFolderName(acc, f), cur));
            setCloudImportedRoutes((cur) => [...uploaded, ...cur]);
            folders.forEach((f) => { addFolderToVisibleList(f); });
          }
        }
      } catch (error) { setLibraryError(`Failed to upload GPX files: ${error?.message || "Unknown error"}`); }
      finally { setIsCloudRoutesLoading(false); event.target.value = ""; }
      return;
    }

    const parsed = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (file, batchIdx) => {
        const text = await file.text();
        const p = parseGpxText(text);
        if (!p) return null;
        return normalizeImportedRoute({ id: uid(), folder: getFolderForParsed(p), name: p.name || file.name.replace(/\.gpx$/i, ""), fileName: file.name, importedAt: new Date().toISOString(), color: getDefaultRouteColor(i + batchIdx), geoJson: p.featureCollection }, i + batchIdx);
      }));
      parsed.push(...results.filter(Boolean));
    }

    if (!parsed.length) { setLibraryError("None of the selected files were valid GPX files."); event.target.value = ""; return; }
    const folders = [...new Set(parsed.map((r) => r.folder))];
    setGuestFolders((cur) => folders.reduce((acc, f) => appendFolderName(acc, f), cur));
    setGuestImportedRoutes((cur) => [...parsed, ...cur]);
    folders.forEach((f) => { addFolderToVisibleList(f); });
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

  const deleteImportedRoutes = async (routeIds) => {
    const ids = Array.isArray(routeIds) ? routeIds.filter(Boolean) : [];
    if (!ids.length) return;
    const toDelete = importedRoutes.filter((r) => ids.includes(r.id));
    if (!toDelete.length) return;
    setLibraryError(null);
    if (isCloudLibraryActive && supabaseUser) {
      const prev = cloudImportedRoutes;
      setCloudImportedRoutes((cur) => cur.filter((r) => !ids.includes(r.id)));
      try {
        await deleteCloudImportedRoutes(toDelete);
      } catch (error) {
        setCloudImportedRoutes(prev);
        setLibraryError(`Failed to delete: ${error?.message || "Unknown error"}`);
        return;
      }
    } else {
      setGuestImportedRoutes((cur) => cur.filter((r) => !ids.includes(r.id)));
    }
    setSelectedRouteIdsByFolder((cur) => {
      const next = { ...cur };
      for (const r of toDelete) {
        if (next[r.folder]) {
          next[r.folder] = next[r.folder].filter((id) => !ids.includes(id));
          if (!next[r.folder].length) delete next[r.folder];
        }
      }
      return next;
    });
    setFocusedImportedRouteId((cur) => (ids.includes(cur) ? null : cur));
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
      const [r, f, s] = await Promise.all([listCloudImportedRoutes(supabaseUser.id), listCloudFolders(supabaseUser.id).catch((e) => { console.error(e); return []; }), listCloudSavedRoutes(supabaseUser.id).catch((e) => { console.error(e); return []; })]);
      setCloudImportedRoutes(r); setCloudFolders(f); setCloudSavedRoutes(s);
    } catch (error) { setCloudRoutesError(`Failed to refresh cloud GPX library: ${error?.message || "Unknown error"}`); }
    finally { setIsCloudRoutesLoading(false); }
  };

  const handleSignInWithGoogle = async () => {
    setCloudRoutesError(null);
    try { await signInWithGoogle(); }
    catch (error) { setCloudRoutesError(`Failed to sign in: ${error?.message || "Unknown error"}`); }
  };

  const handleCloudSignOut = async () => {
    setCloudRoutesError(null);
    try { await signOutOfSupabase(); }
    catch (error) { setCloudRoutesError(`Failed to sign out: ${error?.message || "Unknown error"}`); }
  };

  const getSearchResultLabels = (feature) => {
    const primary = feature?.text || feature?.place_name || "Unnamed place";
    const secondary = feature?.place_name && feature.place_name !== primary ? feature.place_name : "";
    return { primary, secondary };
  };

  const closeMobilePanel = useCallback((panelKey) => {
    setPanelAnimatingOut(panelKey);
    clearTimeout(panelAnimOutTimer.current);
    panelAnimOutTimer.current = setTimeout(() => setPanelAnimatingOut(null), 280);
  }, []);

  const handleEditRoute = useCallback((id) => {
    loadRoute(id);
    if (isMobile && activeMenuPanel === "library") closeMobilePanel("library");
    setActiveMenuPanel(null);
    setRouteContextMenu(null);
  }, [loadRoute, isMobile, activeMenuPanel, closeMobilePanel]);

  const handleSearchSelect = async (feature) => {
    if (!Array.isArray(feature?.center) || feature.center.length < 2) return;
    const label = feature?.place_name || feature?.text || "";
    skipNextSearchRef.current = true;
    setSearchQuery(label); setIsSearchDropdownOpen(false); setSearchError(null);
    if (isMobile) { closeMobilePanel("search"); setActiveMenuPanel(null); }
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
    const opening = activeMenuPanel !== panelKey;
    if (isMobile) {
      if (!opening) {
        closeMobilePanel(panelKey);
      } else if (activeMenuPanel) {
        closeMobilePanel(activeMenuPanel);
      }
    }
    setActiveMenuPanel(opening ? panelKey : null);
    setIsStyleMenuOpen(false);
    if (isMobile && opening && panelKey === "library") setIsGraphExpanded(false);
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
    isCloudLibraryActive, isCloudRoutesLoading, cloudRoutesError,
    supabaseUserName, supabaseUserAvatarUrl,
    refreshCloudRoutes, handleSignInWithGoogle, handleCloudSignOut,
    importedRoutes, cloudImportedRoutes, routes, activeRouteId,
    availableFolders, activeVisibleFolders, openFolders, selectedRouteIdsByFolder, bulkMoveTargets,
    libraryError, libraryMessage,
    savedRouteRevealTick,
    savedRoutesSort, setSavedRoutesSort,
    newFolderName, setNewFolderName,
    toggleFolderVisibility, toggleFolderOpen, selectAllRoutesInFolder, clearFolderSelection,
    toggleRouteSelection, moveImportedRoutesToFolder, updateImportedRouteColor, deleteImportedRoutes,
    setBulkMoveTargets, setVisibleFolders, removeFolder, handleCreateFolder,
    loadRoute,
    openRouteContextMenu, activeRouteMenuId: routeContextMenu?.id ?? null,
    focusedImportedRouteId, focusImportedRoute,
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

      {showRoutingUi && !(isMobile && (activeMenuPanel === "search" || activeMenuPanel === "library")) && (
        <RouteToolbar
          undoLast={undoLast} clearAll={handleClearAll}
          distanceKm={distanceKm} elevationGainM={elevationGainM}
          isMobile={isMobile} isRouting={isRouting} routingError={routingError}
          saveRoute={saveRoute} exportGPX={exportGPX}
          routeName={routeName} setRouteName={setRouteName}
          newRoute={newRoute}
          routingMode={routingMode} setRoutingMode={setRoutingMode}
          getPressHandlers={getPressHandlers}
          pressedButton={pressedButton}
          waypointsCount={waypointsCount}
          bottomSheetHeight={bottomSheetHeight}
          mobileVisible={!isMobile || activeMenuPanel === "route"}
        />
      )}

      <UndoButton
        onUndo={undoLast}
        show={showRoutingUi && waypointsCount > 0 && !(isMobile && activeMenuPanel === "library")}
        elevationHidden={elevationHidden || !routeGeoJson}
        isMobile={isMobile}
        hasCyclingButton={!isMobile && mapStyle === "outdoor"}
      />

      {showRoutingUi && waypointsCount > 0 && routeGeoJson && !(isMobile && activeMenuPanel === "library") && (
        <ElevationSheet
          routeGeoJson={routeGeoJson} elevationGainM={elevationGainM} elevationLossM={elevationLossM} distanceKm={distanceKm}
          isMobile={isMobile}
          onHoverCoordinateChange={handleElevationHoverCoordinateChange}
          hasCyclingButton={!isMobile && mapStyle === "outdoor"}
          hidden={elevationHidden} setHidden={setElevationHidden}
        />
      )}


      {isStyleMenuOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setIsStyleMenuOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 4, background: "transparent" }}
        />
      )}

      <QuickMenu
        quickMenuRef={quickMenuRef} isMobile={isMobile}
        activeMenuPanel={activeMenuPanel} toggleMenuPanel={toggleMenuPanel}
        isGraphExpanded={isGraphExpanded} bottomSheetHeight={bottomSheetHeight}
        showRoutingUi={showRoutingUi} waypointsCount={waypointsCount}
        elevationHidden={elevationHidden}
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
        mapStyle={mapStyle} setMapStyle={setMapStyle}
        locateUser={locateUser} locationState={locationState}
        isStyleMenuOpen={isStyleMenuOpen} setIsStyleMenuOpen={setIsStyleMenuOpen}
        isMapModesFlashOn={isMapModesFlashOn} setIsMapModesFlashOn={setIsMapModesFlashOn}
        isLocationFlashOn={isLocationFlashOn} setIsLocationFlashOn={setIsLocationFlashOn}
        onStyleMenuOpen={() => setActiveMenuPanel(null)}
        styleControlsRef={styleControlsRef}
      />

      {isMobile && (activeMenuPanel === "library" || panelAnimatingOut === "library") && (
        <>
          <div
            onClick={() => activeMenuPanel === "library" && toggleMenuPanel("library")}
            style={{
              position: "fixed", inset: 0, zIndex: 9,
              background: "rgba(15, 23, 42, 0.4)",
              backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
              animation: `${panelAnimatingOut === "library" ? "overlay-fade-out" : "overlay-fade-in"} 0.26s ease both`,
              pointerEvents: panelAnimatingOut === "library" ? "none" : "auto",
            }}
          />
          <div style={{
            position: "fixed",
            bottom: 0,
            left: 0, right: 0,
            maxHeight: "min(85dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 48px))",
            overflowY: "auto",
            zIndex: 10,
            borderRadius: "20px 20px 0 0",
            padding: "12px 14px calc(24px + env(safe-area-inset-bottom, 0px))",
            background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,249,252,0.96) 100%)",
            boxShadow: "0 -8px 32px rgba(15, 23, 42, 0.18), 0 -2px 8px rgba(15, 23, 42, 0.08)",
            animation: `${panelAnimatingOut === "library" ? "slide-down-out" : "slide-up-in"} 0.28s cubic-bezier(0.32, 0.72, 0, 1) both`,
            pointerEvents: panelAnimatingOut === "library" ? "none" : "auto",
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(15,23,42,0.18)", margin: "0 auto 14px" }} />
            <LibraryPanel {...libraryProps} />
          </div>
        </>
      )}

      {isMobile && (activeMenuPanel === "search" || panelAnimatingOut === "search") && (
        <div style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          left: "50%",
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
          animation: `${panelAnimatingOut === "search" ? "fade-drop-out" : "fade-drop-in"} 0.22s ease both`,
          pointerEvents: panelAnimatingOut === "search" ? "none" : "auto",
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

<PendingPinDialog
        pendingPin={pendingPin}
        handleLocationYes={handleLocationYes} handleLocationNo={handleLocationNo}
        handleLocationCancel={handleLocationCancel}
        isMobile={isMobile} getButtonStyle={getButtonStyle}
        getCurrentLocation={getCurrentLocation}
      />

      {mapStyle === "outdoor" && (
        <div
          onClick={() => elevationHidden && setShowCyclingOverlay((v) => !v)}
          role="button"
          aria-pressed={showCyclingOverlay}
          style={{
            position: "absolute",
            bottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
            right: 20,
            opacity: elevationHidden ? 1 : 0,
            pointerEvents: elevationHidden ? "auto" : "none",
            transition: "opacity 0.2s ease",
            zIndex: 4,
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.6)",
            borderRadius: 20,
            padding: "7px 14px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
            display: "flex", alignItems: "center", gap: 8,
            cursor: "pointer",
            userSelect: "none", WebkitTapHighlightColor: "transparent",
            lineHeight: 1,
            overflow: "hidden",
          }}
        >
          {isMobile ? (
            <span
              key={showCyclingOverlay ? "on" : "off"}
              style={{
                fontSize: 12, fontWeight: 500, letterSpacing: 0.1, color: "#0f172a",
                display: "inline-block",
                animation: "panel-pop-in 0.16s cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              {`Routes ${showCyclingOverlay ? "on" : "off"}`}
            </span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: 0.1, color: "#0f172a" }}>
              Cycling routes
            </span>
          )}
          {!isMobile && (
            <div style={{
              width: 32, height: 18, borderRadius: 999,
              background: showCyclingOverlay ? "#34c759" : "rgba(120,120,128,0.32)",
              position: "relative",
              transition: "background 0.2s ease",
              flexShrink: 0,
            }}>
              <div style={{
                position: "absolute",
                top: 2, left: showCyclingOverlay ? 14 : 2,
                width: 14, height: 14, borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
                transition: "left 0.2s ease",
              }} />
            </div>
          )}
        </div>
      )}

      {/* ── Route context menu (position:fixed, escapes all overflow/transform containers) ── */}
      {routeContextMenu && (() => {
        return (
          <>
            <div onPointerDown={() => setRouteContextMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
            <div style={{ position: "fixed", top: routeContextMenu.top, right: routeContextMenu.right, zIndex: 200, background: "#fff", border: "1px solid rgba(226,232,240,0.9)", borderRadius: 14, boxShadow: "0 8px 32px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.07)", minWidth: 160, overflow: "hidden", animation: "panel-pop-in 0.16s cubic-bezier(0.34,1.56,0.64,1) both" }}>
              {[
                { label: "Edit", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, color: "#18212f", hoverBg: "rgba(241,245,249,0.9)", onClick: () => { handleEditRoute(routeContextMenu.id); setRouteContextMenu(null); } },
                { label: "Share", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>, color: "#18212f", hoverBg: "rgba(241,245,249,0.9)", onClick: () => { shareRouteById(routeContextMenu.id); setRouteContextMenu(null); } },
                null, // divider
                { label: "Delete", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>, color: "#ef4444", hoverBg: "rgba(254,242,242,0.8)", onClick: () => { setPendingDeleteRouteId(routeContextMenu.id); setRouteContextMenu(null); } },
              ].map((item, i) => item === null ? (
                <div key={`div-${i}`} style={{ height: 1, background: "rgba(226,232,240,0.7)", margin: "2px 0" }} />
              ) : (
                <button key={item.label}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={item.onClick}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500, color: item.color, textAlign: "left", transition: "background 0.1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = item.hoverBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color: item.color === "#ef4444" ? "#ef4444" : "#64748b", flexShrink: 0, display: "flex" }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </>
        );
      })()}

      {/* ── Overwrite confirmation dialog ── */}
      {pendingOverwriteEntry && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: "24px 22px", width: "min(320px, calc(100vw - 40px))", boxShadow: "0 24px 64px rgba(15,23,42,0.18)", animation: "panel-pop-in 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#18212f", marginBottom: 8 }}>Overwrite route?</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 22 }}>
              Do you want to overwrite <strong style={{ color: "#18212f" }}>"{pendingOverwriteEntry.name}"</strong> with your current route?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelOverwrite} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(226,232,240,0.9)", background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer", transition: "background 0.12s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>Cancel</button>
              <button onClick={confirmOverwrite} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#2563eb", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", transition: "background 0.12s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#1d4ed8"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#2563eb"; }}>Overwrite</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {pendingDeleteRouteId && (() => {
        const delRoute = routes.find((r) => r.id === pendingDeleteRouteId);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
            <div style={{ background: "#fff", borderRadius: 18, padding: "24px 22px", width: "min(320px, calc(100vw - 40px))", boxShadow: "0 24px 64px rgba(15,23,42,0.18)", animation: "panel-pop-in 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#18212f", marginBottom: 8 }}>Delete route?</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 22 }}>
                <strong style={{ color: "#18212f" }}>"{delRoute?.name}"</strong> will be permanently deleted and cannot be recovered.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPendingDeleteRouteId(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(226,232,240,0.9)", background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer", transition: "background 0.12s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}>No, keep it</button>
                <button onClick={() => { deleteRoute(pendingDeleteRouteId); setPendingDeleteRouteId(null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#ef4444", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", transition: "background 0.12s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#dc2626"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#ef4444"; }}>Yes, delete</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
