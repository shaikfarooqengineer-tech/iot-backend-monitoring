// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/SleepCard.jsx
// PURPOSE: Sleep quality and presence status card.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const SleepCard = React.memo(function SleepCard({
  sleeping,
  sleepQuality,
  humanDetected,
  confidence,
}) {
  const qualityPercent = ((sleepQuality ?? 0) * 100).toFixed(0);
  const statusText = sleeping ? "Currently Sleeping" : "Currently Awake";
  const presenceText = humanDetected ? "Present" : "Not Detected";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Moon className="w-5 h-5 text-indigo-500" /> Sleep
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900">
            {qualityPercent}%
          </p>
        </div>
        <Progress value={Number(qualityPercent)} className="h-2" />
        <div className="space-y-1">
          <p className="text-sm">
            <span className="text-slate-500">Status: </span>
            <span className="font-medium text-slate-700">{statusText}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-500">Presence: </span>
            <span className="font-medium text-slate-700">{presenceText}</span>
          </p>
          <p className="text-sm">
            <span className="text-slate-500">Confidence: </span>
            <span className="font-medium text-slate-700">
              {confidence?.toFixed(2) ?? "—"}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
});

SleepCard.displayName = "SleepCard";
export default SleepCard;
