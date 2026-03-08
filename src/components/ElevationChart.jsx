import { useMemo } from "react";
import { getFilteredElevations } from "../utils/geo";

export function ElevationChart({ routeGeoJson, elevationGainM, elevationLossM }) {
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

  const width = 1000;
  const height = 100;
  const pad = 20;
  const rangeE = Math.max(1, data.maxE - data.minE);
  const rangeX = Math.max(1, data.totalDist);

  const getPoint = (p) => ({
    x: pad + (p.x / rangeX) * (width - pad * 2),
    y: pad + (1 - (p.y - data.minE) / rangeE) * (height - pad * 2),
  });

  const linePath = data.points.map((p, i) => `${i === 0 ? "M" : "L"} ${getPoint(p).x.toFixed(1)} ${getPoint(p).y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} V ${height - pad} H ${pad} Z`;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
        <path d={areaPath} fill="#111" opacity="0.08" stroke="none" />
        <path d={linePath} fill="none" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
        
        {/* Y-axis legends */}
        <text x={pad - 4} y={pad} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#334155">{Math.round(data.maxE)} m</text>
        <text x={pad - 4} y={height - pad} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#334155">{Math.round(data.minE)} m</text>
        
        {/* X-axis legends */}
        <text x={pad} y={height - pad + 10} textAnchor="start" dominantBaseline="hanging" fontSize="10" fill="#334155">0 km</text>
        <text x={width - pad} y={height - pad + 10} textAnchor="end" dominantBaseline="hanging" fontSize="10" fill="#334155">{(data.totalDist / 1000).toFixed(1)} km</text>

        {/* Elevation stats */}
        <text x={width - pad} y={pad} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#334155">
          <tspan dx="0">↑ {elevationGainM} m</tspan>
          <tspan dx="12">↓ {elevationLossM} m</tspan>
        </text>
      </svg>
    </div>
  );
}
