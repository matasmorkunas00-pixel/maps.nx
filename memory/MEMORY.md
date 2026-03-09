# Project: maps.nx

## Tech Stack
- React + Vite, MapLibre GL, Supabase (optional cloud sync)
- No CSS files — all styling is inline JS style objects
- No TypeScript

## File Structure (after refactor)
- `src/App.jsx` — ~590 lines, state + handlers + composition only
- `src/components/RouteToolbar.jsx` — top/bottom toolbar (undo, save, export, name, routing mode)
- `src/components/ElevationSheet.jsx` — bottom sheet with elevation chart
- `src/components/MapStylePicker.jsx` — style switcher + locate-me button (bottom-left)
- `src/components/PendingPinDialog.jsx` — "Start from current location?" modal
- `src/components/SearchPanel.jsx` — search input + results dropdown
- `src/components/LibraryPanel.jsx` — GPX library (cloud sync, folders, saved routes)
- `src/components/QuickMenu.jsx` — sidebar with Search/Route/SpeedMode/Library icon buttons
- `src/components/ElevationChart.jsx` — chart component (pre-existing)
- `src/styles/appStyles.js` — `createStyleHelpers({isMobile, pressedButton, activeMenuPanel})` factory
- `src/utils/search.js` — `fetchSearchResults`, `normalizeMapTilerFeatures`, `normalizeNominatimFeatures`
- `src/utils/folders.js` — `normalizeFolderName`, `appendFolderName`, `loadStoredFolderNames`
- `src/utils/geo.js`, `gpx.js`, `routes.js`, `cloudRoutes.js`, `supabase.js`, `appleMapKit.js`
- `src/hooks/useMap.js`, `useSupabaseAuth.js`
- `src/constants.js` — `STORAGE_KEY`, `GPX_LIBRARY_STORAGE_KEY`, `GPX_FOLDER_STORAGE_KEY`, `GPX_ROUTE_COLORS`, `ROUTING_MODES`, `MAP_STYLES`, `MAPTILER_API_KEY`

## Key Patterns
- Style helpers: call `createStyleHelpers(...)` at top of render, destructure what you need
- `libraryProps` object in App.jsx bundles all LibraryPanel props for clean JSX
- `MENU_ICON_SIZE = 44` exported from appStyles.js
- All state lives in App.jsx; components are pure presentational (receive props)

## State in App.jsx (key groups)
- Route: `routes`, `activeRouteId`, `routeName`, `routingMode`
- Library: `guestImportedRoutes`, `cloudImportedRoutes`, `guestFolders`, `cloudFolders`, folder UI state
- Search: `searchQuery`, `searchResults`, `isSearchLoading`, `searchError`, `isSearchDropdownOpen`
- UI: `activeMenuPanel`, `isMobile`, `isMobileMenuOpen`, `speedMode`, `pressedButton`, `isGraphExpanded`
- Cloud auth: `cloudAuthEmail`, `cloudAuthMessage`, `cloudRoutesError`, `isCloudRoutesLoading`
