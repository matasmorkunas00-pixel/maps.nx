export const STORAGE_KEY = "gp_routes_v1";
export const GPX_LIBRARY_STORAGE_KEY = "gp_gpx_library_v1";
export const GPX_FOLDER_STORAGE_KEY = "gp_gpx_folders_v1";
export const GPX_ROUTE_COLORS = ["#2563eb", "#ef4444", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#0891b2", "#f97316"];
export const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY || "Hyv4x1z1eacwc6D47Zsg";
export const THUNDERFOREST_API_KEY = import.meta.env.VITE_THUNDERFOREST_API_KEY || "fc0d0a369cee4df2b86e638288aef7a6";

export const ROUTING_MODES = {
  gravel: { label: "Gravel", profile: "cycling-mountain", snapRadius: null },
  regular: { label: "Balanced", profile: "cycling-regular", snapRadius: null },
  mainRoads: { label: "Main roads", profile: "driving-car", snapRadius: 25 },
};

export const MAP_STYLES = {
  streets: {
    label: "Streets",
    style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_API_KEY}`,
  },
  outdoor: {
    label: "Cycling",
    style: `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_API_KEY}`,
    cyclingOverlaySource: {
      type: "raster",
      tiles: ["https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© <a href='https://cycling.waymarkedtrails.org'>Waymarked Trails</a>",
    },
  },
  satellite: {
    label: "Satellite",
    style: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_API_KEY}`,
  },
};
