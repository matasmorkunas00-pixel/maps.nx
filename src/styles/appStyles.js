export const MENU_ICON_SIZE = 44;

export function createStyleHelpers({ isMobile, pressedButton, activeMenuPanel }) {
  const btn = {
    padding: isMobile ? "12px 14px" : "10px 12px",
    borderRadius: 12,
    border: "1px solid #d7dce3",
    background: "#fff",
    cursor: "pointer",
    fontSize: isMobile ? 16 : 14,
    color: "#000",
  };

  const getButtonStyle = (buttonId, emphasis = false) => ({
    ...btn,
    height: isMobile ? 44 : "auto",
    fontWeight: emphasis ? 600 : 500,
    background: pressedButton === buttonId ? "#eef2f7" : "#fff",
    color: "#000",
    borderColor: pressedButton === buttonId ? "#000" : "#d7dce3",
    flex: isMobile ? "1 1 0%" : "auto",
  });

  const inputStyle = {
    borderRadius: 12,
    border: "1px solid #d7dce3",
    fontSize: isMobile ? 16 : 14,
    color: "#000",
    background: "#fff",
  };

  const getMenuIconButtonStyle = (panelKey) => ({
    width: MENU_ICON_SIZE,
    height: MENU_ICON_SIZE,
    borderRadius: 999,
    border: "1px solid rgba(15, 23, 42, 0.08)",
    display: "grid",
    placeItems: "center",
    background: activeMenuPanel === panelKey ? "#dbe2ec" : "rgba(255,255,255,0.92)",
    cursor: "pointer",
    padding: 0,
    transition: "background-color 0.18s ease, transform 0.18s ease",
    outline: "none",
    boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
    WebkitTapHighlightColor: "transparent",
    transform: activeMenuPanel === panelKey ? "scale(0.97)" : "scale(1)",
  });

  const expandedMenuCardStyle = {
    padding: 12,
    borderRadius: 14,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(15, 23, 42, 0.1)",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.16)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    color: "#000",
  };

  const expandedMenuFloatingStyle = {
    ...expandedMenuCardStyle,
    position: "absolute",
    left: MENU_ICON_SIZE + 10,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 5,
    animation: "quick-panel-float-in 0.2s ease both",
  };

  const libraryPanelFloatingStyle = {
    ...expandedMenuFloatingStyle,
    ...(isMobile
      ? {
          top: MENU_ICON_SIZE + 10,
          left: 0,
          transform: "none",
          width: "100%",
          maxHeight: "min(68vh, calc(100vh - 140px))",
        }
      : {}),
    width: isMobile ? "100%" : 340,
    maxHeight: isMobile ? "min(68vh, calc(100vh - 140px))" : "70vh",
    padding: 14,
    borderRadius: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,249,252,0.92) 100%)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    boxShadow: "0 22px 52px rgba(15, 23, 42, 0.2), 0 6px 18px rgba(15, 23, 42, 0.08)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
  };

  const librarySectionStyle = {
    display: "grid",
    gap: 10,
    padding: isMobile ? "12px" : "12px 13px",
    borderRadius: 16,
    background: "rgba(248, 250, 252, 0.88)",
    border: "1px solid rgba(226, 232, 240, 0.95)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
  };

  const getLibraryBadgeStyle = (tone = "neutral") => {
    const themes = {
      neutral: { color: "#506176", background: "rgba(241, 245, 249, 0.95)", borderColor: "rgba(203, 213, 225, 0.9)" },
      active: { color: "#0f766e", background: "rgba(240, 253, 250, 0.96)", borderColor: "rgba(153, 246, 228, 0.95)" },
      local: { color: "#475569", background: "rgba(248, 250, 252, 0.96)", borderColor: "rgba(203, 213, 225, 0.95)" },
      success: { color: "#166534", background: "rgba(240, 253, 244, 0.96)", borderColor: "rgba(187, 247, 208, 0.95)" },
      danger: { color: "#991b1b", background: "rgba(254, 242, 242, 0.96)", borderColor: "rgba(254, 202, 202, 0.95)" },
    };
    const theme = themes[tone] || themes.neutral;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 9px",
      borderRadius: 999,
      border: `1px solid ${theme.borderColor}`,
      background: theme.background,
      color: theme.color,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    };
  };

  const getLibraryButtonStyle = (buttonId, tone = "secondary") => {
    const isPressed = pressedButton === buttonId;
    const themes = {
      primary: {
        background: isPressed ? "#0f172a" : "#18212f",
        borderColor: isPressed ? "#0f172a" : "#18212f",
        color: "#fff",
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.18)",
      },
      secondary: {
        background: isPressed ? "#e8eef5" : "rgba(255,255,255,0.9)",
        borderColor: isPressed ? "#c6d2e0" : "rgba(203, 213, 225, 0.95)",
        color: "#24364b",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
      },
      subtle: {
        background: isPressed ? "rgba(232, 238, 245, 0.9)" : "rgba(244, 247, 250, 0.86)",
        borderColor: isPressed ? "#d7dee8" : "rgba(226, 232, 240, 0.95)",
        color: "#506176",
        boxShadow: "none",
      },
      danger: {
        background: isPressed ? "rgba(254, 226, 226, 0.95)" : "rgba(254, 242, 242, 0.96)",
        borderColor: isPressed ? "#fecaca" : "rgba(254, 202, 202, 0.95)",
        color: "#991b1b",
        boxShadow: "none",
      },
    };
    const theme = themes[tone] || themes.secondary;
    return {
      borderRadius: 14,
      border: `1px solid ${theme.borderColor}`,
      background: theme.background,
      color: theme.color,
      cursor: "pointer",
      fontSize: isMobile ? 15 : 13,
      fontWeight: tone === "primary" ? 700 : 600,
      padding: isMobile ? "11px 14px" : "10px 13px",
      transition: "background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease",
      boxShadow: theme.boxShadow,
      transform: isPressed ? "scale(0.985)" : "scale(1)",
      WebkitTapHighlightColor: "transparent",
    };
  };

  const libraryInputStyle = {
    ...inputStyle,
    borderRadius: 14,
    border: "1px solid rgba(203, 213, 225, 0.95)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  };

  return {
    btn,
    getButtonStyle,
    inputStyle,
    getMenuIconButtonStyle,
    expandedMenuCardStyle,
    expandedMenuFloatingStyle,
    libraryPanelFloatingStyle,
    librarySectionStyle,
    getLibraryBadgeStyle,
    getLibraryButtonStyle,
    libraryInputStyle,
  };
}
