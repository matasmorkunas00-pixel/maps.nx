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

export function parseGpxText(gpxText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(gpxText, "application/xml");
  if (xml.querySelector("parsererror")) return null;

  const featureCoords = [];

  Array.from(xml.querySelectorAll("trkseg")).forEach((segment) => {
    const coords = Array.from(segment.querySelectorAll("trkpt"))
      .map((point) => {
        const lat = Number(point.getAttribute("lat"));
        const lng = Number(point.getAttribute("lon"));
        const eleNode = point.querySelector("ele");
        const ele = eleNode ? Number(eleNode.textContent) : undefined;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return typeof ele === "number" && Number.isFinite(ele) ? [lng, lat, ele] : [lng, lat];
      })
      .filter(Boolean);
    if (coords.length >= 2) featureCoords.push(coords);
  });

  if (!featureCoords.length) {
    const routePoints = Array.from(xml.querySelectorAll("rtept"))
      .map((point) => {
        const lat = Number(point.getAttribute("lat"));
        const lng = Number(point.getAttribute("lon"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [lng, lat];
      })
      .filter(Boolean);
    if (routePoints.length >= 2) featureCoords.push(routePoints);
  }

  if (!featureCoords.length) return null;

  const name =
    xml.querySelector("trk > name")?.textContent?.trim() ||
    xml.querySelector("rte > name")?.textContent?.trim() ||
    "Imported GPX";

  return {
    name,
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
