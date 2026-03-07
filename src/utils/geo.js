export function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function arePointsClose(a, b, epsilon = 1e-6) {
  return Math.abs(a[0] - b[0]) < epsilon && Math.abs(a[1] - b[1]) < epsilon;
}

function lngLatToMeters(lng, lat, refLat) {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((refLat * Math.PI) / 180);
  return { x: lng * mPerDegLng, y: lat * mPerDegLat };
}

export function nearestPointOnLine(coords, clickLngLat) {
  if (!coords || coords.length < 2) return null;

  const [clng, clat] = clickLngLat;
  const refLat = clat;
  const C = lngLatToMeters(clng, clat, refLat);

  let best = { dist2: Infinity, point: null, routeSegmentIndex: 0 };

  for (let i = 0; i < coords.length - 1; i++) {
    const A = lngLatToMeters(coords[i][0], coords[i][1], refLat);
    const B = lngLatToMeters(coords[i + 1][0], coords[i + 1][1], refLat);

    const ABx = B.x - A.x;
    const ABy = B.y - A.y;
    const ACx = C.x - A.x;
    const ACy = C.y - A.y;

    const ab2 = ABx * ABx + ABy * ABy;
    const t = ab2 === 0 ? 0 : clamp((ACx * ABx + ACy * ABy) / ab2, 0, 1);

    const Px = A.x + t * ABx;
    const Py = A.y + t * ABy;
    const dist2 = (C.x - Px) ** 2 + (C.y - Py) ** 2;

    if (dist2 < best.dist2) {
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos((refLat * Math.PI) / 180);
      best = { dist2, point: [Px / mPerDegLng, Py / mPerDegLat], routeSegmentIndex: i };
    }
  }

  return best;
}

export function getWaypointInsertIndex(routeGeoJson, routeSegmentIndex, waypointCount) {
  if (waypointCount < 2) return waypointCount;

  const geometryWaypoints = routeGeoJson?.features?.[0]?.properties?.way_points;
  if (Array.isArray(geometryWaypoints) && geometryWaypoints.length >= 2) {
    for (let i = 0; i < geometryWaypoints.length - 1; i++) {
      if (routeSegmentIndex >= geometryWaypoints[i] && routeSegmentIndex < geometryWaypoints[i + 1]) {
        return i + 1;
      }
    }
  }

  return clamp(routeSegmentIndex + 1, 1, waypointCount - 1);
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function getFilteredElevations(coords) {
  if (!coords?.length) return [];

  const raw = coords.map((c) => (typeof c?.[2] === "number" ? c[2] : null));
  const filled = raw.map((value, i) => {
    if (value !== null) return value;
    const window = raw.slice(Math.max(0, i - 2), Math.min(raw.length, i + 3)).filter((e) => e !== null);
    return window.length ? median(window) : 0;
  });

  const DROP_RATIO_THRESHOLD = 0.3;
  const RECOVERY_THRESHOLD = 18;
  const MAX_DROPOUT_WIDTH = 5;
  const corrected = [...filled];

  for (let start = 1; start < corrected.length - 1; start++) {
    let end = start;
    while (end < corrected.length - 1 && end - start < MAX_DROPOUT_WIDTH) {
      const left = corrected[start - 1];
      const right = corrected[end + 1];
      const boundaryBaseline = Math.max(median([left, right]), 1);
      const segment = corrected.slice(start, end + 1);
      const segmentMin = Math.min(...segment);
      const segmentMax = Math.max(...segment);

      const isSuddenDropout =
        (left - segmentMin) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        (right - segmentMin) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        Math.abs(left - right) < RECOVERY_THRESHOLD;

      const isSuddenSpike =
        (segmentMax - left) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        (segmentMax - right) / boundaryBaseline > DROP_RATIO_THRESHOLD &&
        Math.abs(left - right) < RECOVERY_THRESHOLD;

      if (isSuddenDropout || isSuddenSpike) {
        const span = end - start + 2;
        for (let i = start; i <= end; i++) {
          corrected[i] = left + ((right - left) * (i - start + 1)) / span;
        }
        start = end;
        break;
      }
      end += 1;
    }
  }

  return corrected.map((value, i) => {
    const window = corrected.slice(Math.max(0, i - 1), Math.min(corrected.length, i + 2));
    return median(window);
  });
}
