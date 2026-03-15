import { useRef, useState } from "react";
import { MENU_ICON_SIZE } from "../styles/appStyles";

// QuickMenu: 6 items × 44px + 5 gaps × 10px = 314px total height, centered at top:50%.
// "My location" button (last item) center is 135px below menu center → at calc(50% + 135px).
// Button top edge = center − half-height → calc(50% + 113px).
// Container holds save (above) + undo (below) with 10px gap.
// Container top = undo top − MENU_ICON_SIZE − 10 = calc(50% + 113px − 54px) = calc(50% + 59px).
const TOP_SHOWN = "calc(50% + 59px)";

const HOLD_MS = 2000;

/**
 * Floating save + undo button pair that mirrors the QuickMenu's "my location" button on the right side.
 * Save button sits above undo with a 10px gap (matching QuickMenu icon gaps).
 * The whole container animates top/opacity/transform together.
 * Long-press (2 s) on undo opens a "delete all" confirmation dialog.
 */
export function UndoButton({ onUndo, onClearAll, onSave, show, elevationHidden, isMobile, hasCyclingButton }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0–1
  const holdTimerRef = useRef(null);
  const holdRafRef = useRef(null);
  const holdStartRef = useRef(null);

  // "Hidden" position: near bottom-right, above the "Show elevation" pill on desktop.
  // Container top = undo hidden top − MENU_ICON_SIZE − 10 so undo stays at same position as before.
  let topHidden;
  if (isMobile) {
    topHidden = `calc(100% - 50px - env(safe-area-inset-bottom, 0px) - ${MENU_ICON_SIZE * 2 + 10}px)`;
  } else {
    const pillBottom = hasCyclingButton ? 48 : 20;
    topHidden = `calc(100% - ${pillBottom + 28 + 10 + MENU_ICON_SIZE * 2 + 10}px)`;
  }

  const rightCss = isMobile
    ? "calc(14px + env(safe-area-inset-right, 0px))"
    : "20px";

  const transitionCss = "top 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, transform 0.25s ease";

  const btnStyle = {
    width: MENU_ICON_SIZE,
    height: MENU_ICON_SIZE,
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    padding: 0,
    outline: "none",
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
    WebkitTapHighlightColor: "transparent",
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    position: "relative",
    overflow: "hidden",
  };

  function startHold() {
    holdStartRef.current = performance.now();
    holdTimerRef.current = setTimeout(() => {
      cancelAnimationFrame(holdRafRef.current);
      setHoldProgress(0);
      setConfirmOpen(true);
    }, HOLD_MS);

    function tick() {
      const elapsed = performance.now() - holdStartRef.current;
      setHoldProgress(Math.min(elapsed / HOLD_MS, 1));
      if (elapsed < HOLD_MS) {
        holdRafRef.current = requestAnimationFrame(tick);
      }
    }
    holdRafRef.current = requestAnimationFrame(tick);
  }

  function cancelHold() {
    clearTimeout(holdTimerRef.current);
    cancelAnimationFrame(holdRafRef.current);
    setHoldProgress(0);
  }

  function handleUndoClick(e) {
    // Only fire undo if it wasn't a long-press (progress would be near 1)
    if (holdProgress < 0.9) {
      onUndo(e);
    }
  }

  function handleConfirmYes() {
    setConfirmOpen(false);
    onClearAll();
  }

  const circumference = 2 * Math.PI * 18; // radius 18 on a 44px button

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: elevationHidden ? topHidden : TOP_SHOWN,
          right: rightCss,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 5,
          opacity: show ? 1 : 0,
          pointerEvents: show ? "auto" : "none",
          transform: show ? "scale(1)" : "scale(0.75)",
          transition: transitionCss,
        }}
      >
        {/* Save route */}
        <button
          onClick={onSave}
          onMouseUp={(e) => e.currentTarget.blur()}
          onTouchEnd={(e) => e.currentTarget.blur()}
          aria-label="Save route"
          style={btnStyle}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 21V13H7V21" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 3V8H15V3" stroke="#24364b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Undo last waypoint — long-press 2 s to clear all */}
        <button
          onClick={handleUndoClick}
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={(e) => { cancelHold(); e.currentTarget.blur(); }}
          onTouchCancel={cancelHold}
          aria-label="Undo last waypoint (hold to clear all)"
          style={btnStyle}
        >
          {/* Hold-progress ring */}
          {holdProgress > 0 && (
            <svg
              width={MENU_ICON_SIZE}
              height={MENU_ICON_SIZE}
              viewBox={`0 0 ${MENU_ICON_SIZE} ${MENU_ICON_SIZE}`}
              style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}
              aria-hidden="true"
            >
              <circle
                cx={MENU_ICON_SIZE / 2}
                cy={MENU_ICON_SIZE / 2}
                r={MENU_ICON_SIZE / 2 - 3}
                fill="none"
                stroke="rgba(220,38,38,0.25)"
                strokeWidth="3"
              />
              <circle
                cx={MENU_ICON_SIZE / 2}
                cy={MENU_ICON_SIZE / 2}
                r={MENU_ICON_SIZE / 2 - 3}
                fill="none"
                stroke="rgba(220,38,38,0.8)"
                strokeWidth="3"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${circumference * (1 - holdProgress)}`}
                strokeLinecap="round"
              />
            </svg>
          )}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 7H14C17.314 7 20 9.686 20 13C20 16.314 17.314 19 14 19H6"
              stroke="#24364b"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
            <path
              d="M7 3L3 7L7 11"
              stroke="#24364b"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Confirmation dialog */}
      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15,23,42,0.35)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.96)",
              borderRadius: 16,
              padding: "24px 28px",
              boxShadow: "0 20px 60px rgba(15,23,42,0.22)",
              maxWidth: 320,
              width: "calc(100vw - 80px)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>
              Delete all route?
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
              Do you really want to delete all route?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmOpen(false)}
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(241,245,249,0.9)",
                  fontSize: 14, fontWeight: 500, color: "#334155",
                  cursor: "pointer",
                }}
              >
                No
              </button>
              <button
                onClick={handleConfirmYes}
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  border: "none",
                  background: "rgba(220,38,38,0.9)",
                  fontSize: 14, fontWeight: 600, color: "#fff",
                  cursor: "pointer",
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
