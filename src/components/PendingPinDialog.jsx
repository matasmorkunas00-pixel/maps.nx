import { useEffect, useRef, useState } from "react";

// --- geo helpers ---
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg([lng1, lat1], [lng2, lat2]) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function compassLabel(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function formatCoord(val, posLabel, negLabel) {
  const abs = Math.abs(val).toFixed(5);
  return `${abs}° ${val >= 0 ? posLabel : negLabel}`;
}

// --- component ---
export function PendingPinDialog({
  pendingPin,
  handleLocationYes,
  handleLocationNo,
  handleLocationCancel,
  isMobile,
  getButtonStyle,
  getCurrentLocation,
}) {
  const [elevation, setElevation] = useState(null);
  const [userLoc, setUserLoc] = useState(null);

  useEffect(() => {
    if (!pendingPin) return;

    // Fetch elevation
    const { lat, lng } = pendingPin;
    fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
    )
      .then((r) => r.json())
      .then((d) => {
        const el = d?.elevation?.[0];
        if (Number.isFinite(el)) setElevation(Math.round(el));
      })
      .catch(() => {});

    // Get user location (resolves immediately if already known)
    if (typeof getCurrentLocation === "function") {
      getCurrentLocation()
        .then((coords) => { if (Array.isArray(coords)) setUserLoc(coords); })
        .catch(() => {});
    }

    return () => { setElevation(null); setUserLoc(null); };
  }, [pendingPin, getCurrentLocation]);

  // Swipe-to-dismiss refs
  const dragY = useRef(0);
  const startY = useRef(0);
  const sheetRef = useRef(null);
  const dragging = useRef(false);

  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
    dragY.current = 0;
    dragging.current = true;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };

  const onTouchMove = (e) => {
    if (!dragging.current) return;
    const raw = e.touches[0].clientY - startY.current;
    // Allow upward resistance: rubber-band if user tries to swipe up
    const delta = raw > 0 ? raw : raw * 0.15;
    dragY.current = Math.max(0, raw);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  };

  const dismissSheet = () => {
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "transform 0.28s cubic-bezier(0.4, 0, 1, 1)";
      el.style.transform = "translateY(110%)";
      setTimeout(handleLocationCancel, 260);
    } else {
      handleLocationCancel();
    }
  };

  const onTouchEnd = () => {
    dragging.current = false;
    if (dragY.current > 80) {
      dismissSheet();
    } else {
      // Snap back with spring
      const el = sheetRef.current;
      if (el) {
        el.style.transition = "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";
        el.style.transform = "translateY(0)";
      }
    }
    dragY.current = 0;
  };

  const [closePressed, setClosePressed] = useState(false);

  if (!pendingPin) return null;

  const pinCoords = [pendingPin.lng, pendingPin.lat];
  const distKm = userLoc ? haversineKm(userLoc, pinCoords) : null;
  const bearing = userLoc ? bearingDeg(userLoc, pinCoords) : null;

  const distLabel =
    distKm === null
      ? "—"
      : distKm < 1
      ? `${Math.round(distKm * 1000)} m`
      : `${distKm.toFixed(1)} km`;

  const bearingLabel =
    bearing === null ? "—" : `${Math.round(bearing)}° ${compassLabel(bearing)}`;

  const elevLabel = elevation === null ? "—" : `${elevation} m`;

  const coordStr = `${formatCoord(pendingPin.lat, "N", "S")}  ${formatCoord(
    pendingPin.lng,
    "E",
    "W"
  )}`;

  if (isMobile) {
    return (
      <div
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          borderRadius: "20px 20px 0 0",
          background: "rgba(255,255,255,0.97)",
          boxShadow:
            "0 -8px 32px rgba(15, 23, 42, 0.18), 0 -2px 8px rgba(15, 23, 42, 0.08)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          animation: "slide-up-in 0.28s cubic-bezier(0.32, 0.72, 0, 1) both",
          paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          touchAction: "none",
          overflow: "hidden",
        }}
      >
        {/* X button — inside sheet, top-right */}
        <button
          onClick={dismissSheet}
          onMouseDown={() => setClosePressed(true)}
          onMouseUp={() => { setClosePressed(false); }}
          onMouseLeave={() => setClosePressed(false)}
          onTouchStart={() => setClosePressed(true)}
          onTouchEnd={(e) => { e.stopPropagation(); setClosePressed(false); dismissSheet(); }}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: "none",
            background: closePressed ? "rgba(15,23,42,0.16)" : "rgba(15,23,42,0.07)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            padding: 0,
            outline: "none",
            WebkitTapHighlightColor: "transparent",
            transition: "background 0.12s ease",
            zIndex: 1,
          }}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 12px 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(15,23,42,0.15)" }} />
        </div>
        <div style={{ height: 14 }} />

        {/* Header info */}
        <div style={{ padding: "0 20px 18px" }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#0f172a",
              letterSpacing: -0.2,
              marginBottom: 6,
            }}
          >
            Marked location
          </div>

          {/* Stats row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              marginBottom: 8,
            }}
          >
            <StatItem label="Elev" value={elevLabel} />
            <Separator />
            <StatItem label="Dist" value={distLabel} />
            <Separator />
            <StatItem label="Dir" value={bearingLabel} />
          </div>

          {/* Coordinates */}
          <div
            style={{
              fontSize: 12,
              color: "#94a3b8",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: 0.1,
            }}
          >
            {coordStr}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(15,23,42,0.07)",
            marginBottom: 14,
          }}
        />

        {/* Horizontal action buttons */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            padding: "0 16px",
          }}
        >
          <ActionBtn
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  fill="#64748b"
                />
              </svg>
            }
            label="Save"
            onClick={handleLocationCancel}
          />
          <ActionBtn
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                {/* start dot — hollow (white middle) */}
                <circle cx="6" cy="18" r="2.8" fill="#0f172a" />
                <circle cx="6" cy="18" r="1.2" fill="white" />
                {/* end dot — solid */}
                <circle cx="18" cy="6" r="2.8" fill="#0f172a" />
                <path d="M8.5 16.5C13 15 11 9 16.5 7.5" stroke="#0f172a" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            }
            label="Route to"
            onClick={handleLocationYes}
            primary
          />
          <ActionBtn
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                {/* start dot — solid */}
                <circle cx="6" cy="18" r="2.8" fill="#0f172a" />
                {/* end dot — hollow (white middle) */}
                <circle cx="18" cy="6" r="2.8" fill="#0f172a" />
                <circle cx="18" cy="6" r="1.2" fill="white" />
                <path d="M8.5 16.5C13 15 11 9 16.5 7.5" stroke="#0f172a" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            }
            label="Route from"
            onClick={handleLocationNo}
          />
        </div>
      </div>
    );
  }

  // Desktop — centered modal
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "rgba(255,255,255,0.97)",
        padding: "20px 24px",
        borderRadius: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        zIndex: 10,
        border: "1px solid rgba(15, 23, 42, 0.1)",
        minWidth: 260,
        overflow: "hidden",
      }}
    >
      <button
        onClick={dismissSheet}
        onMouseDown={() => setClosePressed(true)}
        onMouseUp={() => setClosePressed(false)}
        onMouseLeave={() => setClosePressed(false)}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 26,
          height: 26,
          borderRadius: 999,
          border: "none",
          background: closePressed ? "rgba(15,23,42,0.16)" : "rgba(15,23,42,0.07)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          padding: 0,
          outline: "none",
          transition: "background 0.12s ease",
        }}
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1L9 9M9 1L1 9" stroke="#64748b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#0f172a",
          marginBottom: 6,
        }}
      >
        Marked location
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#64748b",
          marginBottom: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {elevLabel} · {distLabel} · {bearingLabel}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#94a3b8",
          marginBottom: 16,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {coordStr}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleLocationCancel} style={getButtonStyle("loc_cancel")}>
          Save
        </button>
        <button onClick={handleLocationYes} style={getButtonStyle("loc_yes", true)}>
          Route to
        </button>
        <button onClick={handleLocationNo} style={getButtonStyle("loc_no")}>
          Route from
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#334155",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Separator() {
  return (
    <div
      style={{
        width: 1,
        height: 28,
        background: "rgba(15,23,42,0.1)",
        margin: "0 12px",
        flexShrink: 0,
      }}
    />
  );
}

function ActionBtn({ icon, label, onClick, primary }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        padding: "10px 8px",
        borderRadius: 12,
        border: "1px solid rgba(15,23,42,0.1)",
        background: pressed
          ? "rgba(15,23,42,0.08)"
          : primary
          ? "rgba(15,23,42,0.05)"
          : "rgba(15,23,42,0.03)",
        cursor: "pointer",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
        transition: "background 0.12s ease",
      }}
    >
      {icon}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#0f172a",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
}
