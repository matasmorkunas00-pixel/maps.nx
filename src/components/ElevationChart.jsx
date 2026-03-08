import { useMemo, useRef, useState, useEffect } from "react";
import { getFilteredElevations } from "../utils/geo";

export function ElevationChart({ routeGeoJson, elevationGainM, elevationLossM }) {
  const coords = routeGeoJson?.features?.[0]?.geometry?.coordinates;
  const svgContainerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    if (svgContainerRef.current) {
      observer.observe(svgContainerRef.current);
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

  const { width, height } = size;
  const pad = { top: 8, right: 8, bottom: 20, left: 36 };

  const plotWidth = Math.max(1, width - pad.left - pad.right);
  const plotHeight = Math.max(1, height - pad.top - pad.bottom);
  const rangeE = Math.max(1, data.maxE - data.minE);
  const rangeX = Math.max(1, data.totalDist);

  const getPoint = (p) => ({
    x: pad.left + (p.x / rangeX) * plotWidth,
    y: pad.top + (1 - (p.y - data.minE) / rangeE) * plotHeight,
  });

  const linePath = width > 0 ? data.points.map((p, i) => `${i === 0 ? "M" : "L"} ${getPoint(p).x.toFixed(1)} ${getPoint(p).y.toFixed(1)}`).join(" ") : "";
  const areaPath = width > 0 ? `${linePath} V ${height - pad.bottom} H ${pad.left} Z` : "";

  const commonLabelStyle = {
    position: 'absolute',
    fontSize: 11,
    color: '#334155',
    opacity: 0.9,
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 16px', boxSizing: 'border-box' }}>
      
      {/* Stats Header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 13, color: '#0f172a', paddingBottom: 8 }}>
        <span>↑ {elevationGainM} m</span>
        <span>↓ {elevationLossM} m</span>
      </div>

      {/* Chart Area */}
      <div ref={svgContainerRef} style={{ position: 'relative', flexGrow: 1, width: '100%' }}>
        {width > 0 && height > 0 && (
          <>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
              <path d={areaPath} fill="#111" opacity="0.08" stroke="none" />
              <path d={linePath} fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            
            {/* Y-Axis Legends */}
            <div style={{ ...commonLabelStyle, top: pad.top, left: 0, transform: 'translateY(-50%)' }}>
              {Math.round(data.maxE)} m
            </div>
            <div style={{ ...commonLabelStyle, bottom: pad.bottom, left: 0, transform: 'translateY(50%)' }}>
              {Math.round(data.minE)} m
            </div>
            
            {/* X-Axis Legends */}
            <div style={{ ...commonLabelStyle, bottom: 0, left: pad.left }}>
              0 km
            </div>
            <div style={{ ...commonLabelStyle, bottom: 0, right: pad.right }}>
              {(data.totalDist / 1000).toFixed(1)} km
            </div>
          </>
        )}
      </div>

    </div>
  );
}
