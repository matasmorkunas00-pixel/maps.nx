export function buildGpxFromRouteGeoJson(routeGeoJson, name = "Route") {
  const coords = routeGeoJson?.features?.[0]?.geometry?.coordinates;
  if (!coords || !coords.length) return null;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  gpx += `<gpx version="1.1" creator="GravelPlanner" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  gpx += `<trk><name>${esc(name)}</name><trkseg>`;

  coords.forEach(([lng, lat, ele]) => {
    gpx += `<trkpt lat="${lat}" lon="${lng}">`;
    if (typeof ele === "number") gpx += `<ele>${ele}</ele>`;
    gpx += `</trkpt>`;
  });

  gpx += `</trkseg></trk></gpx>`;
  return gpx;
}

function extractPoint(point) {
  const lat = Number(point.getAttribute("lat"));
  const lng = Number(point.getAttribute("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const eleNode = point.querySelector("ele");
  const ele = eleNode ? Number(eleNode.textContent) : undefined;
  return typeof ele === "number" && Number.isFinite(ele) ? [lng, lat, ele] : [lng, lat];
}

export function parseGpxText(gpxText) {
  // Strip UTF-8 BOM if present, then parse as HTML to avoid XML namespace errors
  const text = (gpxText.charCodeAt(0) === 0xFEFF ? gpxText.slice(1) : gpxText);
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "text/html");

  const featureCoords = [];

  Array.from(xml.querySelectorAll("trkseg")).forEach((segment) => {
    const coords = Array.from(segment.querySelectorAll("trkpt")).map(extractPoint).filter(Boolean);
    if (coords.length >= 2) featureCoords.push(coords);
  });

  if (!featureCoords.length) {
    const routePoints = Array.from(xml.querySelectorAll("rtept")).map(extractPoint).filter(Boolean);
    if (routePoints.length >= 2) featureCoords.push(routePoints);
  }

  // Fallback: treat ordered waypoints as a single route
  if (!featureCoords.length) {
    const wptPoints = Array.from(xml.querySelectorAll("wpt")).map(extractPoint).filter(Boolean);
    if (wptPoints.length >= 2) featureCoords.push(wptPoints);
  }

  if (!featureCoords.length) return null;

  const name =
    xml.querySelector("trk > name")?.textContent?.trim() ||
    xml.querySelector("rte > name")?.textContent?.trim() ||
    xml.querySelector("metadata > name")?.textContent?.trim() ||
    xml.querySelector("gpx > name")?.textContent?.trim() ||
    "Imported GPX";

  // Extract activity date: prefer metadata/time, fall back to first trkpt time
  let activityDate = null;
  const metaTime = xml.querySelector("metadata > time")?.textContent?.trim();
  if (metaTime) {
    const d = new Date(metaTime);
    if (!Number.isNaN(d.getTime())) activityDate = d;
  }
  if (!activityDate) {
    const trkptTime = xml.querySelector("trkpt > time")?.textContent?.trim();
    if (trkptTime) {
      const d = new Date(trkptTime);
      if (!Number.isNaN(d.getTime())) activityDate = d;
    }
  }

  return {
    name,
    activityDate,
    featureCollection: {
      type: "FeatureCollection",
      features: featureCoords.map((coords, index) => ({
        type: "Feature",
        properties: { segmentIndex: index },
        geometry: { type: "LineString", coordinates: coords },
      })),
    },
  };
}
