// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/AlertPanel.jsx
// PURPOSE: Scrollable alert log derived from flag transitions, newest first.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const SEVERITY_STYLES = {
  HIGH:   { badge: "bg-red-500 text-white",   text: "text-red-700",   bg: "alert-item high" },
  MEDIUM: { badge: "bg-amber-500 text-white",  text: "text-amber-700", bg: "alert-item medium" },
  LOW:    { badge: "bg-slate-400 text-white",   text: "text-slate-700", bg: "alert-item low" },
};

const AlertPanel = React.memo(function AlertPanel({ alertLog }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" /> Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[160px]">
          {(!alertLog || alertLog.length === 0) ? (
            <p className="text-slate-400 text-center py-6">No active alerts</p>
          ) : (
            <div className="space-y-2">
              {alertLog.map((alert) => {
                const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.LOW;
                return (
                  <div key={alert.id} className={style.bg}>
                    <div className="flex items-start gap-2">
                      <AlertCircle
                        className={`w-4 h-4 mt-0.5 ${
                          alert.severity === "HIGH" ? "text-red-500" : "text-amber-500"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${style.text}`}>
                            {alert.message}
                          </p>
                          <Badge className={`${style.badge} text-[10px] px-1.5 py-0`}>
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500">{alert.time}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
});

AlertPanel.displayName = "AlertPanel";
export default AlertPanel;
