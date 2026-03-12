import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getFilteredElevations } from "../utils/geo";

function getNiceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function buildYTicks(min, max, targetCount) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const step = getNiceStep((max - min) / Math.max(1, targetCount));
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  if (start > min + step * 0.01) ticks.push(min);
  for (let value = start; value < max - step * 0.01; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  if (!ticks.length || ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

function buildXTicks(totalDistM, minCount = 6) {
  const totalKm = totalDistM / 1000;
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  let chosenStep = steps[0];
  for (const step of steps) {
    if (Math.floor(totalKm / step) + 1 >= minCount) chosenStep = step;
  }
  const ticks = [0];
  for (let km = chosenStep; km < totalKm - 0.001; km += chosenStep) {
    ticks.push(Math.round(km * 1000));
  }
  return ticks;
}

function formatXLabel(distM) {
  if (distM === 0) return "0";
  const km = distM / 1000;
  return km % 1 === 0 ? `${km} km` : `${km.toFixed(1)} km`;
}

function findNearestPointIndex(points, targetDistance) {
  if (!points.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].x < targetDistance) low = mid + 1;
    else high = mid;
  }
  const current = low;
  const previous = Math.max(0, current - 1);
  return Math.abs(points[current].x - targetDistance) < Math.abs(points[previous].x - targetDistance) ? current : previous;
}

export function ElevationChart({ routeGeoJson, onHoverCoordinateChange }) {
  const gradientId = useId().replace(/:/g, "");
  const hoveredIndexRef = useRef(null);
  const containerRef = useRef(null);
  const [hoverState, setHoverState] = useState({ routeGeoJson: null, index: null });
  const [svgDims, setSvgDims] = useState({ width: 800, height: 180 });

  const coords = useMemo(() => {
    const geometry = routeGeoJson?.features?.[0]?.geometry;
    if (!geometry) return [];
    if (geometry.type === "LineString") return geometry.coordinates ?? [];
    if (geometry.type === "MultiLineString") return (geometry.coordinates ?? []).flat();
    return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  }, [routeGeoJson]);

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

  const hoverIndex = hoverState.routeGeoJson === routeGeoJson ? hoverState.index : null;

  const updateHoverIndex = (nextIndex) => {
    const currentIndex = hoveredIndexRef.current?.routeGeoJson === routeGeoJson ? hoveredIndexRef.current.index : null;
    if (currentIndex === nextIndex) return;
    const nextHoverState = { routeGeoJson, index: nextIndex };
    hoveredIndexRef.current = nextHoverState;
    setHoverState(nextHoverState);
    onHoverCoordinateChange?.(nextIndex === null ? null : coords[nextIndex]);
  };

  useEffect(() => {
    hoveredIndexRef.current = { routeGeoJson, index: null };
    onHoverCoordinateChange?.(null);
  }, [routeGeoJson, onHoverCoordinateChange]);

  useEffect(() => () => onHoverCoordinateChange?.(null), [onHoverCoordinateChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 10 && height > 10) setSvgDims({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handlePointerMove = (event) => {
    if (!data || !data.points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pad = { left: 46, right: 12 };
    const plotWidth = Math.max(1, svgDims.width - pad.left - pad.right);
    const rangeX = Math.max(1, data.totalDist);
    const rawX = event.clientX - rect.left;
    const clampedX = Math.min(svgDims.width - pad.right, Math.max(pad.left, rawX));
    const targetDistance = ((clampedX - pad.left) / plotWidth) * rangeX;
    updateHoverIndex(findNearestPointIndex(data.points, targetDistance));
  };

  const handlePointerLeave = () => updateHoverIndex(null);

  let chartContent = null;
  if (data) {
    const width = svgDims.width;
    const height = svgDims.height;
    const pad = { top: 10, right: 12, bottom: 30, left: 46 };

    const plotWidth = Math.max(1, width - pad.left - pad.right);
    const plotHeight = Math.max(1, height - pad.top - pad.bottom);

    const domainMinE = 0;
    const rawDomainMax = data.maxE * 1.25;
    const yStep = getNiceStep(rawDomainMax / 4);
    const domainMaxE = Math.ceil(rawDomainMax / yStep) * yStep;
    const rangeE = Math.max(1, domainMaxE - domainMinE);
    const rangeX = Math.max(1, data.totalDist);
    const baselineY = height - pad.bottom;

    // Adapt tick count to available height: at least 32px gap between ticks
    const yTickCount = Math.max(2, Math.floor(plotHeight / 32));
    const yTicks = buildYTicks(domainMinE, domainMaxE, yTickCount);
    const xTicks = buildXTicks(data.totalDist, 6);

    const getPoint = (p) => ({
      x: pad.left + (p.x / rangeX) * plotWidth,
      y: pad.top + (1 - (p.y - domainMinE) / rangeE) * plotHeight,
    });

    const chartPoints = data.points.map(getPoint);
    const linePath = chartPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const lastPoint = chartPoints[chartPoints.length - 1];
    const firstPoint = chartPoints[0];
    const areaPath = `${linePath} L ${lastPoint.x.toFixed(1)} ${baselineY} L ${firstPoint.x.toFixed(1)} ${baselineY} Z`;
    const hoveredChartPoint = hoverIndex === null ? null : chartPoints[hoverIndex];
    const hoveredDataPoint = hoverIndex === null ? null : data.points[hoverIndex];
    const hoverDistanceKm = hoveredDataPoint ? (hoveredDataPoint.x / 1000).toFixed(1) : null;
    const hoverElevationM = hoveredDataPoint ? Math.round(hoveredDataPoint.y) : null;

    const tooltipWidth = 72;
    const tooltipHeight = 36;
    const tooltipX = hoveredChartPoint
      ? Math.min(width - tooltipWidth - 4, Math.max(4, hoveredChartPoint.x - tooltipWidth / 2))
      : 0;
    const tooltipY = hoveredChartPoint
      ? Math.max(4, hoveredChartPoint.y - tooltipHeight - 10)
      : 0;

    chartContent = (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", cursor: "crosshair", touchAction: "none" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerUp={handlePointerLeave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => {
          const y = pad.top + (1 - (tick - domainMinE) / rangeE) * plotHeight;
          return (
            <g key={`y-${tick}`}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={pad.left - 6} y={y} dy="0.35em" fontSize="11" fill="#94a3b8" textAnchor="end" fontFamily="system-ui, sans-serif">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = pad.left + (tick / rangeX) * plotWidth;
          return (
            <g key={`x-${tick}`}>
              <line x1={x} y1={pad.top} x2={x} y2={baselineY} stroke="#f1f5f9" strokeWidth="1" />
              <text
                x={x}
                y={height - 7}
                fontSize="11"
                fill="#94a3b8"
                textAnchor={tick === 0 ? "start" : "middle"}
                fontFamily="system-ui, sans-serif"
              >
                {formatXLabel(tick)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {hoveredChartPoint && hoveredDataPoint && (
          <g pointerEvents="none">
            <line
              x1={hoveredChartPoint.x} y1={pad.top}
              x2={hoveredChartPoint.x} y2={baselineY}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4"
            />
            <circle cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="5" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
            <rect x={tooltipX} y={tooltipY} rx="8" ry="8" width={tooltipWidth} height={tooltipHeight} fill="rgba(15,23,42,0.82)" />
            <text x={tooltipX + tooltipWidth / 2} y={tooltipY + 13} fontSize="12" fill="#94a3b8" textAnchor="middle" fontFamily="system-ui, sans-serif">
              {hoverDistanceKm} km
            </text>
            <text x={tooltipX + tooltipWidth / 2} y={tooltipY + 27} fontSize="12" fill="#f8fafc" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="500">
              {hoverElevationM} m
            </text>
          </g>
        )}
      </svg>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      {chartContent}
    </div>
  );
}
