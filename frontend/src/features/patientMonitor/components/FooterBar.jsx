// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/FooterBar.jsx
// PURPOSE: Footer showing device time, browser receive time, connection mode,
//          and truncated event ID.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";

const MODE_LABELS = {
  connected:      { text: "(WebSocket)",  className: "text-green-500" },
  polling:        { text: "(HTTP polling)", className: "text-blue-400" },
  stale:          { text: "(Stale)",       className: "text-amber-500" },
  connecting:     { text: "(Connecting)",  className: "text-amber-400" },
  authenticating: { text: "(Auth…)",       className: "text-amber-400" },
  reconnecting:   { text: "(Reconnecting)", className: "text-amber-400" },
  offline:        { text: "(Offline)",     className: "text-red-500" },
  auth_failed:    { text: "(Auth Failed)", className: "text-red-500" },
  idle:           { text: "",              className: "" },
};

const FooterBar = React.memo(function FooterBar({
  lastUpdate,
  isoTimestamp,
  eventId,
  connState,
}) {
  const modeInfo = MODE_LABELS[connState?.mode] || MODE_LABELS.idle;
  const truncatedEventId = eventId ? eventId.slice(-12) : "—";

  return (
    <div className="text-center text-sm text-slate-500 space-y-1">
      <p>
        Device time: {isoTimestamp ?? "—"}
        {" · "}
        Received: {lastUpdate ? lastUpdate.toLocaleTimeString() : "Waiting…"}
        {" "}
        <span className={modeInfo.className}>{modeInfo.text}</span>
      </p>
      <p className="text-xs text-slate-400">
        Event: {truncatedEventId}
      </p>
    </div>
  );
});

FooterBar.displayName = "FooterBar";
export default FooterBar;
