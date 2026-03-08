import { useMemo, useRef, useState, useEffect } from "react";
import { getFilteredElevations } from "../utils/geo";

export function ElevationChart({ routeGeoJson, elevationGainM, elevationLossM }) {
  const coords = routeGeoJson?.features?.[0]?.geometry?.coordinates;
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1000);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

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

  const height = 120;
  const pad = 12;
  const rangeE = Math.max(1, data.maxE - data.minE);
  const rangeX = Math.max(1, data.totalDist);

  const getPoint = (p) => ({
      x: pad + (p.x / rangeX) * (width - pad * 2),
      y: pad + (1 - (p.y - data.minE) / rangeE) * (height - pad * 2),
  });

  const linePath = data.points.map((p, i) => `${i === 0 ? "M" : "L"} ${getPoint(p).x.toFixed(1)} ${getPoint(p).y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} V ${height - pad} H ${pad} Z`;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
        <path d={areaPath} fill="#111" opacity="0.08" stroke="none" />
        <path d={linePath} fill="none" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div style={{ position: 'absolute', top: 0, left: pad, right: pad, display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8, padding: '0 4px' }}>
        <span>{Math.round(data.maxE)} m</span>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: '#334155' }}>
            <span>↑ {elevationGainM} m</span>
            <span>↓ {elevationLossM} m</span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: pad, right: pad, display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.8, padding: '0 4px' }}>
        <span>0 km</span>
        <span>{(data.totalDist/1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}
