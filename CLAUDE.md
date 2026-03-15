# Gravel Planner

React + MapLibre GL gravel route planner. No external state lib.

## File Map
| What | File |
|------|------|
| All state | `src/App.jsx` |
| Map/routing/layers/elevation | `src/hooks/useMap.js` |
| Auth | `src/hooks/useSupabaseAuth.js` |
| Left sidebar | `src/components/QuickMenu.jsx` |
| Search | `src/components/SearchPanel.jsx`, `src/utils/search.js` |
| GPX library | `src/components/LibraryPanel.jsx`, `src/utils/cloudRoutes.js`, `src/utils/gpx.js` |
| Top toolbar | `src/components/RouteToolbar.jsx` |
| Elevation UI | `src/components/ElevationSheet.jsx`, `ElevationChart.jsx` |
| Map style picker | `src/components/MapStylePicker.jsx` |
| First-click dialog | `src/components/PendingPinDialog.jsx` |
| Styles (all inline) | `src/styles/appStyles.js` |
| Constants / API keys | `src/constants.js` |

## Stack
- React 19, Vite, MapLibre GL 5
- Supabase (auth + cloud sync, optional)
- OpenRouteService routing, MapTiler + Nominatim search
- All styles: inline CSS objects in `appStyles.js` (no CSS files)

## Conventions
- State in App.jsx, passed as props + callbacks
- `isMobile` flag drives layout (bottom sheet vs floating panels)
- localStorage keys: `gp_routes_v1`, `gp_gpx_library_v1`, `gp_gpx_folders_v1`

## Route Data Shape
```js
{ id, name, createdAt, routingMode, waypoints: [[lng,lat]], routeGeoJson, distanceKm, elevationGainM, elevationLossM }
```

## Routing Modes
- Gravel → `cycling-mountain`, Balanced → `cycling-regular`, Main Roads → `driving-car`
