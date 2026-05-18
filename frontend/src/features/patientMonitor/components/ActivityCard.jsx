// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/ActivityCard.jsx
// PURPOSE: Activity/presence card showing human detection, distance, load, uptime.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Activity, Radar, Cpu, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUptime } from "../utils/docHelpers";

const ActivityCard = React.memo(function ActivityCard({
  humanDetected,
  distance,
  highLoad,
  uptimeMs,
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-500" /> Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-bold text-slate-900">
            {humanDetected ? "Person Detected" : "No Person"}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-slate-600">Distance:</span>
            <span className="text-sm font-medium">
              {distance ?? "—"} m from sensor
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-600">Device Load:</span>
            {highLoad ? (
              <Badge className="bg-amber-500 text-white text-xs">Overloaded</Badge>
            ) : (
              <Badge className="bg-green-500 text-white text-xs">Normal</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-600">Uptime:</span>
            <span className="text-sm font-medium">{formatUptime(uptimeMs)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

ActivityCard.displayName = "ActivityCard";
export default ActivityCard;
