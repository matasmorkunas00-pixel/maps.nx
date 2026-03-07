export const STORAGE_KEY = "gp_routes_v1";
export const GPX_LIBRARY_STORAGE_KEY = "gp_gpx_library_v1";
export const GPX_ROUTE_COLORS = ["#2563eb", "#ef4444", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899", "#0891b2", "#f97316"];

export const ROUTING_MODES = {
  gravel: { label: "Gravel", profile: "cycling-mountain", snapRadius: null },
  regular: { label: "Balanced", profile: "cycling-regular", snapRadius: null },
  mainRoads: { label: "Main roads", profile: "driving-car", snapRadius: 25 },
};

const buildRasterStyle = ({ rasterTiles, labelTiles = [], maxzoom = 19 }) => ({
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: rasterTiles,
      tileSize: 256,
      maxzoom,
      attribution: "Tiles © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
    ...(labelTiles.length
      ? { labels: { type: "raster", tiles: labelTiles, tileSize: 256, maxzoom, attribution: "Labels © Esri" } }
      : {}),
  },
  layers: [
    { id: "basemap", type: "raster", source: "basemap" },
    ...(labelTiles.length ? [{ id: "labels", type: "raster", source: "labels" }] : []),
  ],
});

export const MAP_STYLES = {
  streets: {
    label: "Streets",
    style: "https://api.maptiler.com/maps/streets-v2/style.json?key=Hyv4x1z1eacwc6D47Zsg",
  },
  satellite: {
    label: "Satellite",
    style: buildRasterStyle({
      rasterTiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      labelTiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      ],
    }),
  },
};
