// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/ConnectionBadge.jsx
// PURPOSE: Connection state indicator with color-coded dot and retry button.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATE_STYLES = {
  idle:            { color: "bg-slate-400",  pulse: false },
  connecting:      { color: "bg-amber-400",  pulse: true  },
  authenticating:  { color: "bg-amber-400",  pulse: true  },
  connected:       { color: "bg-green-500",  pulse: true  },
  stale:           { color: "bg-amber-500",  pulse: false },
  reconnecting:    { color: "bg-amber-400",  pulse: true  },
  polling:         { color: "bg-blue-400",   pulse: true  },
  auth_failed:     { color: "bg-red-500",    pulse: false },
  offline:         { color: "bg-red-500",    pulse: false },
};

const ConnectionBadge = React.memo(function ConnectionBadge({
  connState,
  onManualRetry,
}) {
  const { mode, message } = connState;
  const style = STATE_STYLES[mode] || STATE_STYLES.idle;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-2.5 h-2.5 rounded-full ${style.color} ${style.pulse ? "animate-pulse" : ""}`}
      />
      <span className="text-sm text-slate-600">{message}</span>
      {(mode === "polling" || mode === "offline" || mode === "auth_failed" || mode === "stale") && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800"
          onClick={onManualRetry}
          title="Attempt to upgrade to WebSocket"
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          {mode === "polling" ? "Try WS" : "Retry"}
        </Button>
      )}
    </div>
  );
});

ConnectionBadge.displayName = "ConnectionBadge";
export default ConnectionBadge;
