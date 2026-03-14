import { MENU_ICON_SIZE } from "../styles/appStyles";

// QuickMenu: 6 items × 44px + 5 gaps × 10px = 314px total height, centered at top:50%.
// "My location" button (last item) center is 135px below menu center → at calc(50% + 135px).
// Button top edge = center − half-height → calc(50% + 113px).
const TOP_SHOWN = "calc(50% + 113px)";

/**
 * Floating undo button that mirrors the QuickMenu's "my location" button on the right side.
 *
 * Animates `top` at 0.35s both ways (up and down) with the same easing.
 * The elevation sheet uses a slightly longer 0.4s animation, so the button always travels
 * faster (px/s) — the gap to the sheet top only grows during animation, no overlap ever.
 */
export function UndoButton({ onUndo, show, elevationHidden, isMobile, hasCyclingButton }) {
  // "Hidden" position: near bottom-right, above the "Show elevation" pill on desktop
  let topHidden;
  if (isMobile) {
    // Equivalent to bottom: 14px + safe-area-inset-bottom
    topHidden = `calc(100% - 14px - env(safe-area-inset-bottom, 0px) - ${MENU_ICON_SIZE}px)`;
  } else {
    // Above the "Show elevation" pill on desktop
    const pillBottom = hasCyclingButton ? 48 : 20;
    topHidden = `calc(100% - ${pillBottom + 28 + 10 + MENU_ICON_SIZE}px)`;
  }

  const rightCss = isMobile
    ? "calc(14px + env(safe-area-inset-right, 0px))"
    : "20px";

  const transitionCss = "top 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, transform 0.25s ease";

  return (
    <button
      onClick={onUndo}
      onMouseUp={(e) => e.currentTarget.blur()}
      onTouchEnd={(e) => e.currentTarget.blur()}
      aria-label="Undo last waypoint"
      style={{
        position: "absolute",
        top: elevationHidden ? topHidden : TOP_SHOWN,
        right: rightCss,
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
        zIndex: 5,
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
        transform: show ? "scale(1)" : "scale(0.75)",
        transition: transitionCss,
      }}
    >
      {/* Undo / counterclockwise arrow icon */}
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
  );
}
