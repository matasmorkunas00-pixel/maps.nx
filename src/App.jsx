import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORAGE_KEY, GPX_LIBRARY_STORAGE_KEY, GPX_FOLDER_STORAGE_KEY, GPX_ROUTE_COLORS, ROUTING_MODES, MAP_STYLES, MAPTILER_API_KEY } from "./constants";
import { uid } from "./utils/geo";
import { buildGpxFromRouteGeoJson, parseGpxText } from "./utils/gpx";
import { normalizeImportedRoute, normalizeSavedRoute, buildImportedRoutesGeoJson, getDefaultRouteColor } from "./utils/routes";
import { ElevationChart } from "./components/ElevationChart";
import { useMap } from "./hooks/useMap";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { listCloudImportedRoutes, listCloudFolders, createCloudFolder, updateCloudImportedRouteColor, updateCloudImportedRouteFolder, uploadCloudImportedRoute, isMissingCloudFoldersTableError } from "./utils/cloudRoutes";

const STREETS_PREVIEW_URL = "/streets-preview.jpg";
const SATELLITE_PREVIEW_URL = "/satelite-preview.jpg";
const OUTDOOR_PREVIEW_URL = `https://api.maptiler.com/maps/outdoor-v2/static/25.2797,54.6872,13/160x160.png?key=${MAPTILER_API_KEY}`;
const SEARCH_RESULT_LIMIT = 8;

function normalizeMapTilerFeatures(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.filter((feature) => Array.isArray(feature?.center) && feature.center.length === 2);
}

function normalizeNominatimFeatures(payload) {
  const items = Array.isArray(payload) ? payload : [];
  return items
    .filter((item) => Number.isFinite(Number(item?.lon)) && Number.isFinite(Number(item?.lat)))
    .map((item) => {
      const primary =
        item?.namedetails?.name ||
        item?.name ||
        (typeof item?.display_name === "string" ? item.display_name.split(",")[0]?.trim() : "") ||
        "Unnamed place";
      return {
        id: `nominatim-${item.place_id || `${item.lon}-${item.lat}`}`,
        center: [Number(item.lon), Number(item.lat)],
        text: primary,
        place_name: item.display_name || primary,
      };
    });
}

function normalizeFolderName(value, fallback = "Imported") {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function appendFolderName(currentFolders, folderName) {
  const normalizedFolder = normalizeFolderName(folderName, "");
  if (!normalizedFolder) return Array.isArray(currentFolders) ? currentFolders : [];

  const folders = Array.isArray(currentFolders)
    ? currentFolders
      .map((folder) => normalizeFolderName(folder, ""))
      .filter(Boolean)
    : [];

  return folders.includes(normalizedFolder) ? folders : [...folders, normalizedFolder];
}

function loadStoredFolderNames() {
  try {
    const raw = localStorage.getItem(GPX_FOLDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.from(new Set((Array.isArray(parsed) ? parsed : []).map((folder) => normalizeFolderName(folder, "")).filter(Boolean)));
  } catch {
    return [];
  }
}

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
  const [importFolderName, setImportFolderName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [visibleFolders, setVisibleFolders] = useState(null);
  const [openFolders, setOpenFolders] = useState([]);
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

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) {
        setIsSearchDropdownOpen(false);
      }
      if (!styleControlsRef.current?.contains(event.target)) {
        setIsStyleMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (activeMenuPanel !== "search") setIsSearchDropdownOpen(false);
  }, [activeMenuPanel]);

  useEffect(() => {
    if (!isMapModesFlashOn) return;
    const timer = setTimeout(() => setIsMapModesFlashOn(false), 200);
    return () => clearTimeout(timer);
  }, [isMapModesFlashOn]);

  useEffect(() => {
    if (!isLocationFlashOn) return;
    const timer = setTimeout(() => setIsLocationFlashOn(false), 200);
    return () => clearTimeout(timer);
  }, [isLocationFlashOn]);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchLoading(true);
      setSearchError(null);
      try {
        const providers = [];

        if (MAPTILER_API_KEY) {
          providers.push(async () => {
            const response = await fetch(
              `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_API_KEY}&autocomplete=true&fuzzyMatch=true&limit=${SEARCH_RESULT_LIMIT}&types=address,poi,place,locality,neighborhood,street`,
              { signal: controller.signal }
            );
            if (!response.ok) throw new Error(`MapTiler search failed (${response.status})`);
            const payload = await response.json();
            return normalizeMapTilerFeatures(payload);
          });
        }

        providers.push(async () => {
          const language =
            typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=${SEARCH_RESULT_LIMIT}&addressdetails=1&namedetails=1&extratags=1&accept-language=${encodeURIComponent(language)}`,
            { signal: controller.signal }
          );
          if (!response.ok) throw new Error(`Nominatim search failed (${response.status})`);
          const payload = await response.json();
          return normalizeNominatimFeatures(payload);
        });

        let features = [];
        let allFailed = true;
        for (const runSearch of providers) {
          try {
            const found = await runSearch();
            allFailed = false;
            if (found.length) {
              features = found;
              break;
            }
          } catch (providerError) {
            if (providerError?.name === "AbortError") throw providerError;
          }
        }

        if (allFailed) throw new Error("All search providers failed");
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

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
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
  useEffect(() => { localStorage.setItem(GPX_FOLDER_STORAGE_KEY, JSON.stringify(guestFolders)); }, [guestFolders]);

  const {
    isConfigured: isSupabaseConfigured,
    isReady: isSupabaseAuthReady,
    user: supabaseUser,
    userEmail: supabaseUserEmail,
    sendMagicLink,
    signOut: signOutOfSupabase,
  } = useSupabaseAuth();

  const isCloudLibraryActive = isSupabaseConfigured && !!supabaseUser;
  const importedRoutes = isCloudLibraryActive ? cloudImportedRoutes : guestImportedRoutes;
  const explicitFolders = isCloudLibraryActive ? cloudFolders : guestFolders;

  const availableFolders = useMemo(
    () =>
      Array.from(
        new Set([
          ...explicitFolders,
          ...importedRoutes.map((route) => normalizeFolderName(route?.folder, "")),
        ].filter(Boolean))
      ).sort(
        (a, b) => a.localeCompare(b)
      ),
    [explicitFolders, importedRoutes]
  );

  const activeVisibleFolders = useMemo(
    () =>
      visibleFolders === null
        ? availableFolders
        : visibleFolders.filter((folder) => availableFolders.includes(folder)),
    [visibleFolders, availableFolders]
  );

  useEffect(() => {
    setOpenFolders((current) => current.filter((folder) => availableFolders.includes(folder)));
  }, [availableFolders]);

  const importedRoutesGeoJson = useMemo(
    () => buildImportedRoutesGeoJson(importedRoutes, activeVisibleFolders),
    [importedRoutes, activeVisibleFolders]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !isSupabaseAuthReady) return;

    if (!supabaseUser) {
      setCloudImportedRoutes([]);
      setCloudFolders([]);
      setCloudRoutesError(null);
      return;
    }

    let isCancelled = false;

    const loadCloudRoutes = async () => {
      setIsCloudRoutesLoading(true);
      setCloudRoutesError(null);
      try {
        const [routesResult, foldersResult] = await Promise.allSettled([
          listCloudImportedRoutes(supabaseUser.id),
          listCloudFolders(supabaseUser.id),
        ]);

        if (isCancelled) return;

        if (routesResult.status === "fulfilled") {
          setCloudImportedRoutes(routesResult.value);
        } else {
          throw routesResult.reason;
        }

        if (foldersResult.status === "fulfilled") {
          setCloudFolders(foldersResult.value);
        } else {
          console.error("Failed to load cloud GPX folders:", foldersResult.reason);
          setCloudFolders([]);
          if (!isMissingCloudFoldersTableError(foldersResult.reason)) {
            setCloudRoutesError(
              `Failed to load cloud GPX folders: ${foldersResult.reason?.message || "Unknown error"}`
            );
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setCloudRoutesError(`Failed to load cloud GPX library: ${error?.message || "Unknown error"}`);
        }
      } finally {
        if (!isCancelled) setIsCloudRoutesLoading(false);
      }
    };

    loadCloudRoutes();

    return () => {
      isCancelled = true;
    };
  }, [isSupabaseConfigured, isSupabaseAuthReady, supabaseUser]);

  const {
    distanceKm,
    elevationGainM,
    routeGeoJson,
    locationState,
    isRouting,
    routingError,
    waypointsRef,
    routeDataRef,
    undoLast,
    clearAll,
    locateUser,
    routeToDestination,
    loadRouteOnMap,
  } = useMap({
    appleMapContainerRef,
    mapContainerRef,
    mapStyle,
    importedRoutesGeoJson,
    routingMode,
    isMobile,
    speedMode,
  });

  // ---------- Route management ----------

  const saveRoute = () => {
    if (!routeDataRef.current || waypointsRef.current.length < 2) return;
    const entry = {
      id: activeRouteId || uid(),
      name: routeName || "My Route",
      createdAt: new Date().toISOString(),
      routingMode,
      waypoints: waypointsRef.current,
      routeGeoJson: routeDataRef.current,
      distanceKm,
      elevationGainM,
    };
    setRoutes((prev) => {
      const exists = prev.find((r) => r.id === entry.id);
      return exists ? prev.map((r) => (r.id === entry.id ? entry : r)) : [entry, ...prev];
    });
    setActiveRouteId(entry.id);
  };

  const loadRoute = (id) => {
    const r = routes.find((x) => x.id === id);
    if (!r) return;
    setActiveRouteId(r.id);
    setRouteName(r.name);
    setRoutingMode(r.routingMode || (r.gravelMode ? "gravel" : "regular"));
    loadRouteOnMap(r);
  };

  const deleteRoute = (id) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
    if (activeRouteId === id) {
      setActiveRouteId(null);
      setRouteName("My Route");
      clearAll();
    }
  };

  const newRoute = () => {
    setActiveRouteId(null);
    setRouteName("My Route");
    clearAll();
  };

  const exportGPX = () => {
    if (!routeDataRef.current) return;
    const gpx = buildGpxFromRouteGeoJson(routeDataRef.current, routeName || "Route");
    if (!gpx) return;
    const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(routeName || "route").replace(/\s+/g, "_")}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addFolderToVisibleList = (folder) => {
    const normalizedFolder = normalizeFolderName(folder);
    setVisibleFolders((current) => {
      if (current === null) return null;
      return current.includes(normalizedFolder) ? current : [...current, normalizedFolder];
    });
  };

  const openFolder = (folder) => {
    const normalizedFolder = normalizeFolderName(folder);
    setOpenFolders((current) => (current.includes(normalizedFolder) ? current : [...current, normalizedFolder]));
  };

  const toggleFolderOpen = (folder) => {
    const normalizedFolder = normalizeFolderName(folder);
    setOpenFolders((current) =>
      current.includes(normalizedFolder)
        ? current.filter((entry) => entry !== normalizedFolder)
        : [...current, normalizedFolder]
    );
  };

  const handleCreateFolder = async () => {
    const folder = normalizeFolderName(newFolderName, "");
    if (!folder) {
      setLibraryMessage(null);
      setLibraryError("Enter a folder name before creating a folder.");
      return;
    }

    setLibraryError(null);
    setLibraryMessage(null);

    if (availableFolders.includes(folder)) {
      addFolderToVisibleList(folder);
      setNewFolderName("");
      setLibraryMessage(`Folder "${folder}" already exists.`);
      return;
    }

    if (isCloudLibraryActive && supabaseUser) {
      setIsCloudRoutesLoading(true);
      try {
        const createdFolder = await createCloudFolder({ userId: supabaseUser.id, name: folder });
        setCloudFolders((current) => appendFolderName(current, createdFolder));
        addFolderToVisibleList(createdFolder);
        openFolder(createdFolder);
        setNewFolderName("");
        setLibraryMessage(`Created folder "${createdFolder}".`);
      } catch (error) {
        if (isMissingCloudFoldersTableError(error)) {
          setLibraryError("Cloud folder creation needs the latest Supabase SQL setup. Re-run supabase/setup.sql once, then refresh.");
        } else {
          setLibraryError(`Failed to create folder: ${error?.message || "Unknown error"}`);
        }
      } finally {
        setIsCloudRoutesLoading(false);
      }
      return;
    }

    setGuestFolders((current) => appendFolderName(current, folder));
    addFolderToVisibleList(folder);
    setNewFolderName("");
    setLibraryMessage(`Created folder "${folder}".`);
  };

  const handleGpxUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    const folder = normalizeFolderName(importFolderName);
    if (!files.length) {
      event.target.value = "";
      return;
    }

    setLibraryError(null);
    setLibraryMessage(null);

    if (isCloudLibraryActive && supabaseUser) {
      setIsCloudRoutesLoading(true);
      setCloudRoutesError(null);
      try {
        await createCloudFolder({ userId: supabaseUser.id, name: folder, allowMissingTable: true });
        const uploadedRoutes = (
          await Promise.all(
            files.map((file, index) =>
              uploadCloudImportedRoute({
                userId: supabaseUser.id,
                file,
                folder,
                color: getDefaultRouteColor(index),
                index,
              })
            )
          )
        ).filter(Boolean);

        if (uploadedRoutes.length) {
          setCloudFolders((current) => appendFolderName(current, folder));
          setCloudImportedRoutes((current) => [...uploadedRoutes, ...current]);
          addFolderToVisibleList(folder);
          openFolder(folder);
        }
      } catch (error) {
        setLibraryError(`Failed to upload GPX files: ${error?.message || "Unknown error"}`);
      } finally {
        setIsCloudRoutesLoading(false);
        event.target.value = "";
      }
      return;
    }

    const parsedRoutes = (
      await Promise.all(
        files.map(async (file, index) => {
          const text = await file.text();
          const parsed = parseGpxText(text);
          if (!parsed) return null;
          return {
            id: uid(),
            folder,
            name: parsed.name || file.name.replace(/\.gpx$/i, ""),
            fileName: file.name,
            importedAt: new Date().toISOString(),
            color: getDefaultRouteColor(index),
            geoJson: parsed.featureCollection,
          };
        })
      )
    ).filter(Boolean);

    if (!parsedRoutes.length) {
      setLibraryError("None of the selected files were valid GPX files.");
      event.target.value = "";
      return;
    }

    setGuestFolders((current) => appendFolderName(current, folder));
    setGuestImportedRoutes((current) => [...parsedRoutes, ...current]);
    addFolderToVisibleList(folder);
    openFolder(folder);
    event.target.value = "";
  };

  const toggleFolderVisibility = (folder) => {
    setVisibleFolders((current) => {
      const base = current === null ? availableFolders : current;
      return base.includes(folder) ? base.filter((entry) => entry !== folder) : [...base, folder];
    });
  };

  const updateImportedRouteColor = (routeId, color) => {
    if (isCloudLibraryActive) {
      const previousColor = cloudImportedRoutes.find((route) => route.id === routeId)?.color;
      setLibraryError(null);
      setLibraryMessage(null);
      setCloudImportedRoutes((current) => current.map((route) => (route.id === routeId ? { ...route, color } : route)));
      updateCloudImportedRouteColor(routeId, color).catch((error) => {
        setCloudImportedRoutes((current) =>
          current.map((route) => (route.id === routeId ? { ...route, color: previousColor || route.color } : route))
        );
        setLibraryError(`Failed to update route color: ${error?.message || "Unknown error"}`);
      });
      return;
    }

    setGuestImportedRoutes((current) => current.map((route) => (route.id === routeId ? { ...route, color } : route)));
  };

  const moveImportedRouteToFolder = async (routeId, nextFolder) => {
    const folder = normalizeFolderName(nextFolder);
    const route = importedRoutes.find((entry) => entry.id === routeId);
    if (!route || route.folder === folder) return;

    setLibraryError(null);
    setLibraryMessage(null);
    addFolderToVisibleList(folder);
    openFolder(folder);

    if (isCloudLibraryActive && supabaseUser) {
      setCloudImportedRoutes((current) => current.map((entry) => (entry.id === routeId ? { ...entry, folder } : entry)));
      setCloudFolders((current) => appendFolderName(current, folder));
      try {
        await createCloudFolder({ userId: supabaseUser.id, name: folder, allowMissingTable: true });
        await updateCloudImportedRouteFolder(routeId, folder);
      } catch (error) {
        setCloudImportedRoutes((current) => current.map((entry) => (entry.id === routeId ? { ...entry, folder: route.folder } : entry)));
        setLibraryError(`Failed to move route: ${error?.message || "Unknown error"}`);
      }
      return;
    }

    setGuestFolders((current) => appendFolderName(current, folder));
    setGuestImportedRoutes((current) => current.map((entry) => (entry.id === routeId ? { ...entry, folder } : entry)));
  };

  const refreshCloudRoutes = async () => {
    if (!supabaseUser) return;
    setIsCloudRoutesLoading(true);
    setCloudRoutesError(null);
    try {
      const [routesFromCloud, foldersFromCloud] = await Promise.all([
        listCloudImportedRoutes(supabaseUser.id),
        listCloudFolders(supabaseUser.id).catch((error) => {
          console.error("Failed to refresh cloud GPX folders:", error);
          return [];
        }),
      ]);
      setCloudImportedRoutes(routesFromCloud);
      setCloudFolders(foldersFromCloud);
    } catch (error) {
      setCloudRoutesError(`Failed to refresh cloud GPX library: ${error?.message || "Unknown error"}`);
    } finally {
      setIsCloudRoutesLoading(false);
    }
  };

  const handleCloudSignIn = async () => {
    setCloudRoutesError(null);
    setCloudAuthMessage(null);
    try {
      const email = await sendMagicLink(cloudAuthEmail);
      setCloudAuthMessage(`Magic link sent to ${email}`);
    } catch (error) {
      setCloudRoutesError(`Failed to send sign-in link: ${error?.message || "Unknown error"}`);
    }
  };

  const handleCloudSignOut = async () => {
    setCloudRoutesError(null);
    setCloudAuthMessage(null);
    try {
      await signOutOfSupabase();
    } catch (error) {
      setCloudRoutesError(`Failed to sign out: ${error?.message || "Unknown error"}`);
    }
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
    setSearchQuery(label);
    setIsSearchDropdownOpen(false);
    setSearchError(null);
    const routeResult = await routeToDestination(feature.center);
    if (!routeResult?.ok) {
      setSearchError(routeResult?.message || "Could not route to that place.");
    }
  };

  const handleSearchKeyDown = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!searchResults.length) return;
    await handleSearchSelect(searchResults[0]);
  };
  const toggleMenuPanel = (panelKey) => {
    setActiveMenuPanel((current) => (current === panelKey ? null : panelKey));
  };

  // ---------- UI helpers ----------

  const getPressHandlers = (buttonId) => ({
    onMouseDown: () => setPressedButton(buttonId),
    onMouseUp: () => setPressedButton(null),
    onMouseLeave: () => setPressedButton((cur) => (cur === buttonId ? null : cur)),
    onTouchStart: () => setPressedButton(buttonId),
    onTouchEnd: () => setPressedButton(null),
  });

  const btn = {
    padding: isMobile ? "12px 14px" : "10px 12px",
    borderRadius: 12,
    border: "1px solid #d7dce3",
    background: "#fff",
    cursor: "pointer",
    fontSize: isMobile ? 16 : 14,
    color: "#000",
  };

  const getButtonStyle = (buttonId, emphasis = false) => ({
    ...btn,
    fontWeight: emphasis ? 600 : 500,
    background: pressedButton === buttonId ? "#eef2f7" : "#fff",
    color: "#000",
    borderColor: pressedButton === buttonId ? "#000" : "#d7dce3",
  });

  const inputStyle = {
    borderRadius: 12,
    border: "1px solid #d7dce3",
    fontSize: isMobile ? 16 : 14,
    color: "#000",
    background: "#fff",
  };
  const menuIconSize = isMobile ? 46 : 44;
  const menuIconGap = 10;
  const expandedMenuCardStyle = {
    width: isMobile ? "min(calc(100vw - 84px), 308px)" : 308,
    maxHeight: isMobile ? "58vh" : "62vh",
    overflowY: "auto",
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(15, 23, 42, 0.1)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.16)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    animation: "quick-panel-in 0.2s ease both",
    color: "#000",
  };
  const expandedMenuFloatingStyle = {
    ...expandedMenuCardStyle,
    position: "absolute",
    left: menuIconSize + menuIconGap,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 5,
    animation: "quick-panel-float-in 0.2s ease both",
  };
  const getMenuIconButtonStyle = (panelKey) => ({
    width: menuIconSize,
    height: menuIconSize,
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    display: "grid",
    placeItems: "center",
    background: activeMenuPanel === panelKey ? "#dbe2ec" : "rgba(255,255,255,0.92)",
    cursor: "pointer",
    padding: 0,
    transition: "background-color 0.18s ease, transform 0.18s ease",
    outline: "none",
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
    WebkitTapHighlightColor: "transparent",
    transform: activeMenuPanel === panelKey ? "scale(0.97)" : "scale(1)",
  });

  // ---------- Render ----------

  return (
    <>
      <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
        <div
          ref={appleMapContainerRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 0.18s ease",
          }}
        />
        <div
          ref={mapContainerRef}
          style={{
            position: "absolute",
            inset: 0,
          }}
        />
      </div>

      <input ref={gpxFileInputRef} type="file" accept=".gpx" multiple onChange={handleGpxUpload} style={{ display: "none" }} />

      {activeMenuPanel === "route" && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            width: "auto",
            maxWidth: isMobile ? "calc(100vw - 20px)" : "calc(100vw - 180px)",
            pointerEvents: "none",
            animation: "route-stats-fade-in 0.22s ease both",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", pointerEvents: "auto" }}>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                onClick={undoLast}
                title="Undo"
                aria-label="Undo last route point"
                style={{
                  width: isMobile ? 36 : 34,
                  height: isMobile ? 36 : 34,
                  borderRadius: 10,
                  border: "1px solid rgba(231,235,240,0.85)",
                  background: pressedButton === "undo_icon" ? "rgba(224,230,238,0.92)" : "rgba(245,247,250,0.82)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: "0 6px 16px rgba(15, 23, 42, 0.1)",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background-color 0.18s ease, transform 0.18s ease",
                  transform: pressedButton === "undo_icon" ? "scale(0.96)" : "scale(1)",
                }}
                {...getPressHandlers("undo_icon")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 8H4V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 8C5.9 5.9 8.6 4.5 11.7 4.5C17.4 4.5 22 9.1 22 14.8C22 16.2 21.7 17.5 21.2 18.7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
              <button
                onClick={clearAll}
                title="Clear route"
                aria-label="Clear route"
                style={{
                  width: isMobile ? 36 : 34,
                  height: isMobile ? 36 : 34,
                  borderRadius: 10,
                  border: "1px solid rgba(231,235,240,0.85)",
                  background: pressedButton === "clear_icon" ? "rgba(224,230,238,0.92)" : "rgba(245,247,250,0.82)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: "0 6px 16px rgba(15, 23, 42, 0.1)",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background-color 0.18s ease, transform 0.18s ease",
                  transform: pressedButton === "clear_icon" ? "scale(0.96)" : "scale(1)",
                }}
                {...getPressHandlers("clear_icon")}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 7H19" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M9 7V5.8C9 5.36 9.36 5 9.8 5H14.2C14.64 5 15 5.36 15 5.8V7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                  <path d="M8 7L8.6 18.2C8.63 18.66 9.02 19 9.48 19H14.52C14.98 19 15.37 18.66 15.4 18.2L16 7" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[{ label: "Distance", value: distanceKm, unit: "km" }, { label: "Elevation", value: elevationGainM, unit: "m" }].map(
                ({ label, value, unit }) => (
                  <div
                    key={label}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: "rgba(245,247,250,0.82)",
                      border: "1px solid rgba(231,235,240,0.85)",
                      backdropFilter: "blur(8px)",
                      WebkitBackdropFilter: "blur(8px)",
                      minWidth: 120,
                    }}
                  >
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#000" }}>{label}</div>
                    <div style={{ marginTop: 4, fontSize: isMobile ? 24 : 22, fontWeight: 700, color: "#000" }}>
                      {value}
                      <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 500, color: "#000" }}>{unit}</span>
                    </div>
                  </div>
                )
              )}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
                <button
                    onClick={saveRoute}
                    disabled={isRouting}
                    title="Save route"
                    style={{
                        width: isMobile ? 36 : 34,
                        height: isMobile ? 36 : 34,
                        borderRadius: 10,
                        border: "1px solid rgba(231,235,240,0.85)",
                        background: pressedButton === "save_icon" ? "rgba(224,230,238,0.92)" : "rgba(245,247,250,0.82)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        boxShadow: "0 6px 16px rgba(15, 23, 42, 0.1)",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        padding: 0,
                        transition: "background-color 0.18s ease, transform 0.18s ease",
                        transform: pressedButton === "save_icon" ? "scale(0.96)" : "scale(1)",
                    }}
                    {...getPressHandlers("save_icon")}
                    >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button
                    onClick={exportGPX}
                    title="Export GPX"
                    style={{
                        width: isMobile ? 36 : 34,
                        height: isMobile ? 36 : 34,
                        borderRadius: 10,
                        border: "1px solid rgba(231,235,240,0.85)",
                        background: pressedButton === "export_icon" ? "rgba(224,230,238,0.92)" : "rgba(245,247,250,0.82)",
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        boxShadow: "0 6px 16px rgba(15, 23, 42, 0.1)",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        padding: 0,
                        transition: "background-color 0.18s ease, transform 0.18s ease",
                        transform: pressedButton === "export_icon" ? "scale(0.96)" : "scale(1)",
                    }}
                    {...getPressHandlers("export_icon")}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="7 10 12 15 17 10" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="12" y1="15" x2="12" y2="3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>

            <div style={{ display: "grid", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                      placeholder="Route name"
                      style={{ ...inputStyle, padding: isMobile ? 12 : 10, height: 34, boxSizing: "border-box" }}
                    />
                    <button style={{...getButtonStyle("new"), height: 34, padding: "0 12px"}} onClick={newRoute} {...getPressHandlers("new")}>New</button>
                </div>
                <div>
                    <select value={routingMode} onChange={(e) => setRoutingMode(e.target.value)} style={{ ...inputStyle, width: '100%', padding: '0 10px', height: 34, boxSizing: "border-box" }}>
                      {Object.entries(ROUTING_MODES).map(([value, opt]) => (
                        <option key={value} value={value}>{opt.label}</option>
                      ))}
                    </select>
                </div>
            </div>
          </div>
          {routingError && (
            <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, pointerEvents: "auto" }}>
                {routingError}
            </div>
          )}
          {isRouting && <div style={{ marginTop: 8, fontSize: 12, color: "#334155", textAlign: "center" }}>Calculating route...</div>}
          <div style={{pointerEvents: "auto"}}>
            {routeGeoJson && (
              <div
                style={{
                  position: "fixed",
                  bottom: 20,
                  left: "75px",
                  right: 20,
                  height: "calc(100vh / 6)",
                  background: "rgba(255, 255, 255, 0.8)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderRadius: 14,
                  padding: "10px",
                  boxSizing: "border-box",
                  boxShadow: "0 -5px 15px rgba(0,0,0,0.1)",
                }}
              >
                <ElevationChart routeGeoJson={routeGeoJson} />
              </div>
            )}
          </div>
        </div>
      )}

      <div
        ref={quickMenuRef}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 3,
          display: "grid",
          gap: 10,
          alignItems: "start",
        }}
      >
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
          <button
            onClick={() => toggleMenuPanel("search")}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Search places"
            style={getMenuIconButtonStyle("search")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#24364b" strokeWidth="1.8" />
              <path d="M16.5 16.5L21 21" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {activeMenuPanel === "search" && (
            <div style={expandedMenuFloatingStyle}>
              <div ref={searchBoxRef} style={{ position: "relative" }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length || searchQuery.trim().length >= 2) setIsSearchDropdownOpen(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search address, shops, tourist places..."
                  style={{ ...inputStyle, width: "100%", padding: isMobile ? "12px 42px 12px 12px" : "11px 40px 11px 12px", boxSizing: "border-box" }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#506176",
                    pointerEvents: "none",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                {isSearchDropdownOpen && (isSearchLoading || searchResults.length > 0 || searchQuery.trim().length >= 2) && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      left: 0,
                      right: 0,
                      zIndex: 6,
                      borderRadius: 12,
                      border: "1px solid rgba(15, 23, 42, 0.12)",
                      background: "rgba(255,255,255,0.97)",
                      boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)",
                      overflow: "hidden",
                    }}
                  >
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
                              style={{
                                width: "100%",
                                textAlign: "left",
                                border: "none",
                                background: "transparent",
                                padding: "10px 12px",
                                cursor: "pointer",
                                borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
                              }}
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
              </div>
              {searchError && <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{searchError}</div>}
            </div>
          )}
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
          <button
            onClick={() => toggleMenuPanel("route")}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Route tools"
            style={getMenuIconButtonStyle("route")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="6" cy="18" r="2.2" fill="#24364b" />
              <circle cx="18" cy="6" r="2.2" fill="#24364b" />
              <path d="M8.2 17.1C12.8 16 10.3 8.9 15.8 7.2" stroke="#24364b" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
          <button
            onClick={() => setSpeedMode((on) => !on)}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Speed mode"
            style={{
              width: menuIconSize,
              height: menuIconSize,
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

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, height: menuIconSize }}>
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
          {activeMenuPanel === "library" && (
            <div style={expandedMenuFloatingStyle}>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(245,247,250,0.92)",
                  border: "1px solid rgba(231,235,240,0.92)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: 13, color: "#24364b" }}>Cloud sync</strong>
                  {isSupabaseConfigured && isSupabaseAuthReady && supabaseUserEmail && (
                    <span style={{ fontSize: 11, color: "#64748b" }}>Signed in</span>
                  )}
                </div>

                {!isSupabaseConfigured ? (
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                    Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable per-user GPX sync.
                  </div>
                ) : !isSupabaseAuthReady ? (
                  <div style={{ fontSize: 12, color: "#64748b" }}>Checking your session...</div>
                ) : supabaseUser ? (
                  <>
                    <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                      Syncing as <strong>{supabaseUserEmail}</strong>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        style={getButtonStyle("cloud_refresh")}
                        onClick={refreshCloudRoutes}
                        disabled={isCloudRoutesLoading}
                        {...getPressHandlers("cloud_refresh")}
                      >
                        {isCloudRoutesLoading ? "Syncing..." : "Refresh"}
                      </button>
                      <button
                        style={getButtonStyle("cloud_signout")}
                        onClick={handleCloudSignOut}
                        {...getPressHandlers("cloud_signout")}
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      value={cloudAuthEmail}
                      onChange={(event) => setCloudAuthEmail(event.target.value)}
                      placeholder="Email for cloud sync"
                      style={{ ...inputStyle, width: "100%", padding: isMobile ? 12 : 11, boxSizing: "border-box" }}
                    />
                    <button
                      style={getButtonStyle("cloud_signin", true)}
                      onClick={handleCloudSignIn}
                      {...getPressHandlers("cloud_signin")}
                    >
                      Email me a sign-in link
                    </button>
                    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                      Uploads stay in this browser until you sign in. After sign-in, new GPX files sync to your account.
                    </div>
                  </>
                )}

                {cloudAuthMessage && (
                  <div style={{ fontSize: 12, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 10px" }}>
                    {cloudAuthMessage}
                  </div>
                )}
                {cloudRoutesError && (
                  <div style={{ fontSize: 12, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 10px" }}>
                    {cloudRoutesError}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Create empty folder"
                    style={{ ...inputStyle, width: "100%", padding: isMobile ? 12 : 11, boxSizing: "border-box" }}
                  />
                  <button
                    style={getButtonStyle("create_folder")}
                    onClick={handleCreateFolder}
                    disabled={isCloudRoutesLoading}
                    {...getPressHandlers("create_folder")}
                  >
                    Create
                  </button>
                </div>
                <input
                  value={importFolderName}
                  onChange={(e) => setImportFolderName(e.target.value)}
                  placeholder="Folder name, e.g. 2024"
                  style={{ ...inputStyle, width: "100%", padding: isMobile ? 12 : 11, boxSizing: "border-box" }}
                />
                <div style={{ fontSize: 11, color: "#64748b", marginTop: -2 }}>
                  Leave empty to save into <strong>Imported</strong>.
                </div>
                <button
                  style={getButtonStyle("upload")}
                  onClick={() => gpxFileInputRef.current?.click()}
                  disabled={isCloudRoutesLoading}
                  {...getPressHandlers("upload")}
                >
                  {isCloudLibraryActive ? "Upload GPX files to cloud" : "Upload GPX files"}
                </button>
              </div>
              {libraryMessage && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 10px" }}>
                  {libraryMessage}
                </div>
              )}
              {libraryError && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 10px" }}>
                  {libraryError}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                {isCloudLibraryActive
                  ? `${cloudImportedRoutes.length} routes synced to your account`
                  : isSupabaseConfigured
                    ? "Current GPX library is local to this browser until you sign in."
                    : "Current GPX library is stored only in this browser."}
              </div>
              {availableFolders.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button style={getButtonStyle("folders_all")} onClick={() => setVisibleFolders(availableFolders)} {...getPressHandlers("folders_all")}>Show all</button>
                    <button style={getButtonStyle("folders_none")} onClick={() => setVisibleFolders([])} {...getPressHandlers("folders_none")}>Hide all</button>
                  </div>
                  <div style={{ display: "grid", gap: 6, maxHeight: 210, overflow: "auto" }}>
                    {availableFolders.map((folder) => {
                      const folderRoutes = importedRoutes.filter((r) => r.folder === folder);
                      const checked = activeVisibleFolders.includes(folder);
                      const isOpen = openFolders.includes(folder);
                      return (
                        <div key={folder} style={{ display: "grid", gap: 8, padding: "8px 10px", borderRadius: 12, background: "#f5f7fa", border: "1px solid #e7ebf0", fontSize: 13, color: "#000" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFolderVisibility(folder)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <button
                              type="button"
                              onClick={() => toggleFolderOpen(folder)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                minWidth: 0,
                                background: "transparent",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                color: "#000",
                                fontSize: 13,
                                textAlign: "left",
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  display: "inline-block",
                                  fontSize: 12,
                                  color: "#64748b",
                                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                                  transition: "transform 0.16s ease",
                                }}
                              >
                                ▸
                              </span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {folder}
                              </span>
                            </button>
                            <span style={{ opacity: 0.65 }}>{folderRoutes.length}</span>
                          </div>
                          {isOpen && (
                            <div style={{ display: "grid", gap: 6, paddingLeft: 22 }}>
                              {folderRoutes.length === 0 ? (
                                <div style={{ fontSize: 12, color: "#64748b" }}>No routes in this folder yet.</div>
                              ) : folderRoutes.map((route) => (
                                <div key={route.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "start", fontSize: 12 }}>
                                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                      <span style={{ width: 10, height: 10, borderRadius: 999, background: route.color || GPX_ROUTE_COLORS[0], flexShrink: 0 }} />
                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={route.name}>{route.name}</span>
                                    </div>
                                    <select
                                      value={route.folder}
                                      onChange={(e) => moveImportedRouteToFolder(route.id, e.target.value)}
                                      style={{ ...inputStyle, padding: "6px 8px", fontSize: 12, width: "100%" }}
                                      title={`Move ${route.name} to another folder`}
                                    >
                                      {availableFolders.map((folderOption) => (
                                        <option key={folderOption} value={folderOption}>
                                          {folderOption}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <input
                                    type="color"
                                    value={route.color || GPX_ROUTE_COLORS[0]}
                                    onChange={(e) => updateImportedRouteColor(route.id, e.target.value)}
                                    style={{ width: 28, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                                    title={`Change color for ${route.name}`}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>No imported GPX routes yet.</div>
              )}
              <div style={{ marginTop: 10, borderTop: "1px solid #e6e8ed", paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13 }}>Saved routes</strong>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{routes.length}</span>
                </div>
                <div style={{ maxHeight: 170, overflow: "auto", marginTop: 6 }}>
                  {routes.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>No saved routes yet.</div>
                  ) : (
                    routes.map((r) => (
                      <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #eef1f4" }}>
                        <button
                          onClick={() => loadRoute(r.id)}
                          style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 12 }}
                          title="Load route"
                        >
                          <div style={{ fontWeight: r.id === activeRouteId ? 700 : 600 }}>{r.name}</div>
                          <div style={{ fontSize: 11, opacity: 0.68 }}>{r.distanceKm} km • {r.elevationGainM} m</div>
                        </button>
                        <button
                          style={getButtonStyle(`delete_${r.id}`)}
                          onClick={() => deleteRoute(r.id)}
                          title="Delete route"
                          {...getPressHandlers(`delete_${r.id}`)}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      <div
        ref={styleControlsRef}
        style={{
          position: "absolute",
          left: 10,
          bottom: isMobile ? 108 : 10,
          zIndex: 2,
          display: "grid",
          gap: 8,
        }}
      >
        {isStyleMenuOpen && (
          <div
            style={{
              width: isMobile ? 168 : 176,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 8,
              padding: 6,
              borderRadius: 12,
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              transition: "transform 0.16s ease, opacity 0.16s ease",
            }}
          >
            <button
              onClick={() => setMapStyle("streets")}
              onMouseUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
              style={{
                display: "grid",
                gap: 6,
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: "#24364b",
                outline: "none",
                boxShadow: "none",
                WebkitTapHighlightColor: "transparent",
              }}
              title={MAP_STYLES.streets.label}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: mapStyle === "streets" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)",
                  boxShadow: mapStyle === "streets" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none",
                }}
              >
                <img
                  src={STREETS_PREVIEW_URL}
                  alt="Streets map preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Default</div>
            </button>

            <button
              onClick={() => setMapStyle("outdoor")}
              onMouseUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
              style={{
                display: "grid",
                gap: 6,
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: "#24364b",
                outline: "none",
                boxShadow: "none",
                WebkitTapHighlightColor: "transparent",
              }}
              title={MAP_STYLES.outdoor.label}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: mapStyle === "outdoor" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)",
                  boxShadow: mapStyle === "outdoor" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none",
                }}
              >
                <img
                  src={OUTDOOR_PREVIEW_URL}
                  alt="Outdoor map preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = STREETS_PREVIEW_URL;
                  }}
                  loading="lazy"
                />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Cycling</div>
            </button>

            <button
              onClick={() => setMapStyle("satellite")}
              onMouseUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
              style={{
                display: "grid",
                gap: 6,
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                color: "#24364b",
                outline: "none",
                boxShadow: "none",
                WebkitTapHighlightColor: "transparent",
              }}
              title={MAP_STYLES.satellite.label}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: mapStyle === "satellite" ? "2px solid #2563eb" : "1px solid rgba(15, 23, 42, 0.15)",
                  boxShadow: mapStyle === "satellite" ? "0 0 0 1px rgba(37,99,235,0.28)" : "none",
                }}
              >
                <img
                  src={SATELLITE_PREVIEW_URL}
                  alt="Satellite map preview"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>Satellite</div>
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
          }}
        >
          <button
            onClick={() => {
              setIsMapModesFlashOn(true);
              setIsStyleMenuOpen((open) => !open);
            }}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            aria-label="Map style options"
            style={{
              width: isMobile ? 44 : 42,
              height: isMobile ? 44 : 42,
              borderRadius: 999,
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              placeItems: "center",
              background: isMapModesFlashOn ? "#dbe2ec" : "rgba(255,255,255,0.92)",
              cursor: "pointer",
              padding: 0,
              transition: "background-color 0.2s ease",
              outline: "none",
              boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3.75 6.25L8.95 3.6C9.29 3.43 9.69 3.43 10.03 3.6L14 5.62L18.95 3.6C19.71 3.29 20.5 3.84 20.5 4.66V17.75L15.05 20.4C14.71 20.57 14.31 20.57 13.97 20.4L10 18.38L5.05 20.4C4.29 20.71 3.5 20.16 3.5 19.34V6.75C3.5 6.54 3.61 6.35 3.75 6.25Z" fill="#24364b" />
              <path d="M10 3.75V18.25M14 5.62V20.25" stroke="rgba(255,255,255,0.45)" strokeWidth="1.15" />
            </svg>
          </button>

          <button
            onClick={() => {
              setIsLocationFlashOn(true);
              setIsStyleMenuOpen(false);
              locateUser();
            }}
            onMouseUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
            title={locationState.message}
            aria-label="Center on my location"
            style={{
              width: isMobile ? 44 : 42,
              height: isMobile ? 44 : 42,
              borderRadius: 999,
              border: "1px solid rgba(15, 23, 42, 0.08)",
              display: "grid",
              placeItems: "center",
              background: isLocationFlashOn ? "#dbe2ec" : "rgba(255,255,255,0.92)",
              cursor: "pointer",
              padding: 0,
              transition: "background-color 0.2s ease",
              outline: "none",
              boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 4L11 13M20 4L14.5 20L11 13L4 9.5L20 4Z"
                stroke="#24364b"
                strokeWidth="1.9"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>

        </div>
      </div>

    </>
  );
}
