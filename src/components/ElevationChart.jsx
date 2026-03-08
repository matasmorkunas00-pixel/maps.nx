import { useMemo } from "react";
import { getFilteredElevations } from "../utils/geo";

export function ElevationChart({ routeGeoJson, width: chartWidth }) {
  const coords = routeGeoJson?.features?.[0]?.geometry?.coordinates;

  const data = useMemo(() => {
    if (!coords || coords.length < 2) return null;

    const elevations = getFilteredElevations(coords);
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;

    const points = [];
    const elevs = [];
    let dist = 0;

    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i];
      if (i > 0) {
        const [lng0, lat0] = coords[i - 1];
        const x = toRad(lng - lng0) * Math.cos(toRad((lat + lat0) / 2));
        const y = toRad(lat - lat0);
        dist += Math.sqrt(x * x + y * y) * R;
      }
      const e = elevations[i] ?? 0;
      elevs.push(e);
      points.push({ x: dist, y: e });
    }

    return { points, minE: Math.min(...elevs), maxE: Math.max(...elevs), totalDist: dist };
  }, [coords]);

  if (!data) return null;

  const width = chartWidth || 280;
  const height = 80;
  const pad = 6;
  const rangeE = Math.max(1, data.maxE - data.minE);
  const rangeX = Math.max(1, data.totalDist);

  const path = data.points
    .map((p, i) => {
      const x = pad + (p.x / rangeX) * (width - pad * 2);
      const y = pad + (1 - (p.y - data.minE) / rangeE) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8 }}>
        <span>{Math.round(data.minE)} m</span>
        <span>{Math.round(data.maxE)} m</span>
      </div>
      <svg width={width} height={height} style={{ display: "block", borderRadius: 8 }}>
        <path d={path} fill="none" stroke="#111" strokeWidth="2" />
      </svg>
    </div>
  );
}
