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

function buildTicks(min, max, targetCount) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const step = getNiceStep((max - min) / Math.max(1, targetCount));
  const start = Math.ceil(min / step) * step;
  const ticks = [];

  if (start > min) ticks.push(min);
  for (let value = start; value < max; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  if (!ticks.length || ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
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

export function ElevationChart({ routeGeoJson, elevationGainM, elevationLossM, onHoverCoordinateChange }) {
  const gradientId = useId().replace(/:/g, "");
  const hoveredIndexRef = useRef(null);
  const [hoverState, setHoverState] = useState({ routeGeoJson: null, index: null });
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

  if (!data) return null;

  const width = 1000;
  const height = 240;
  const pad = { top: 18, right: 18, bottom: 38, left: 60 };

  const plotWidth = Math.max(1, width - pad.left - pad.right);
  const plotHeight = Math.max(1, height - pad.top - pad.bottom);
  const rawRangeE = Math.max(1, data.maxE - data.minE);
  const minVisualRangeE = 40;
  const paddedRangeE = Math.max(minVisualRangeE, rawRangeE * 1.35);
  const elevationMidpoint = (data.maxE + data.minE) / 2;
  const rawDomainMin = elevationMidpoint - paddedRangeE / 2;
  const rawDomainMax = elevationMidpoint + paddedRangeE / 2;
  const yStep = getNiceStep((rawDomainMax - rawDomainMin) / 4);
  const domainMinE = Math.floor(rawDomainMin / yStep) * yStep;
  const domainMaxE = Math.ceil(rawDomainMax / yStep) * yStep;
  const rangeE = Math.max(1, domainMaxE - domainMinE);
  const rangeX = Math.max(1, data.totalDist);
  const baselineY = height - pad.bottom;
  const yTicks = buildTicks(domainMinE, domainMaxE, 4);
  const xTicks = buildTicks(0, data.totalDist, 4);

  const getPoint = (p) => ({
    x: pad.left + (p.x / rangeX) * plotWidth,
    y: pad.top + (1 - (rangeE > 0 ? (p.y - domainMinE) / rangeE : 0.5)) * plotHeight,
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
  const tooltipWidth = 118;
  const tooltipHeight = 40;
  const tooltipX = hoveredChartPoint
    ? Math.min(width - tooltipWidth - 4, Math.max(4, hoveredChartPoint.x - tooltipWidth / 2))
    : 0;
  const tooltipY = hoveredChartPoint
    ? Math.max(4, hoveredChartPoint.y - tooltipHeight - 14)
    : 0;

  const handlePointerMove = (event) => {
    if (!data.points.length || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;

    const rawX = ((event.clientX - rect.left) / rect.width) * width;
    const clampedX = Math.min(width - pad.right, Math.max(pad.left, rawX));
    const targetDistance = ((clampedX - pad.left) / plotWidth) * rangeX;
    updateHoverIndex(findNearestPointIndex(data.points, targetDistance));
  };

  const handlePointerLeave = () => {
    updateHoverIndex(null);
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "12px 16px", boxSizing: "border-box", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, fontSize: 13, color: "#0f172a", paddingBottom: 8 }}>
        <span>↑ {elevationGainM} m</span>
        <span>↓ {elevationLossM} m</span>
      </div>

      <div style={{ flex: "1 1 auto", width: "100%", minHeight: 120 }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ display: "block", cursor: "crosshair" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = pad.top + (1 - (tick - domainMinE) / rangeE) * plotHeight;
            return (
              <g key={`y-${tick}`}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#dbe4ef" strokeWidth="1" />
                <text x={pad.left - 10} y={y} dy="0.35em" fontSize="17" fill="#475569" textAnchor="end">
                  {Math.round(tick)} m
                </text>
              </g>
            );
          })}

          {xTicks.map((tick) => {
            const x = pad.left + (tick / rangeX) * plotWidth;
            return (
              <g key={`x-${tick}`}>
                <line x1={x} y1={pad.top} x2={x} y2={baselineY} stroke="#edf2f7" strokeWidth="1" />
                <text x={x} y={height - 10} fontSize="17" fill="#475569" textAnchor={tick === 0 ? "start" : tick === data.totalDist ? "end" : "middle"}>
                  {(tick / 1000).toFixed(tick >= 10000 ? 0 : 1)} km
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path d={linePath} fill="none" stroke="#0f172a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

          {hoveredChartPoint && hoveredDataPoint && (
            <g pointerEvents="none">
              <line x1={hoveredChartPoint.x} y1={pad.top} x2={hoveredChartPoint.x} y2={baselineY} stroke="#64748b" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.7" />
              <circle cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="8" fill="#ffffff" opacity="0.96" />
              <circle cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="5" fill="#ff5500" stroke="#ffffff" strokeWidth="2" />
              <rect x={tooltipX} y={tooltipY} rx="12" ry="12" width={tooltipWidth} height={tooltipHeight} fill="rgba(15, 23, 42, 0.92)" />
              <text x={tooltipX + 12} y={tooltipY + 17} fontSize="16" fill="#cbd5e1">
                {hoverDistanceKm} km
              </text>
              <text x={tooltipX + 12} y={tooltipY + 31} fontSize="16" fill="#ffffff">
                {hoverElevationM} m
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
