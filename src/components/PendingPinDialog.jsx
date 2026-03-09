export function PendingPinDialog({ pendingPin, handleLocationYes, handleLocationNo, isMobile, getButtonStyle }) {
  if (!pendingPin) return null;
  return (
    <div style={{
      position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
      background: "rgba(255,255,255,0.95)", padding: "20px", borderRadius: 16,
      boxShadow: "0 10px 30px rgba(0,0,0,0.15)", backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)", zIndex: 10, textAlign: "center",
      border: "1px solid rgba(15, 23, 42, 0.1)",
      width: isMobile ? "min(calc(100vw - 40px), 300px)" : "auto",
    }}>
      <p style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: "#0f172a" }}>
        Start route from current location?
      </p>
      <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
        <button onClick={handleLocationYes} style={getButtonStyle("loc_yes", true)}>Yes</button>
        <button onClick={handleLocationNo} style={getButtonStyle("loc_no")}>No</button>
      </div>
    </div>
  );
}
