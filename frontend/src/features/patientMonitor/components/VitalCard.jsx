// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/VitalCard.jsx
// PURPOSE: Reusable vital metric card with icon, value, badge, and sub-label.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const VitalCard = React.memo(function VitalCard({
  label,
  value,
  unit,
  subLabel,
  icon: Icon,
  iconColorClass,
  badgeText,
  badgeColor,
}) {
  return (
    <Card className="vital-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={`icon-container ${iconColorClass}`}>
            <Icon className="w-6 h-6" />
          </div>
          <Badge className={badgeColor}>{badgeText}</Badge>
        </div>
        <div className="mt-4">
          <p className="text-sm text-slate-500 mb-1">{label}</p>
          <span className="text-4xl font-bold text-slate-900">
            {value ?? "—"}
          </span>{" "}
          {unit && <span className="text-lg text-slate-500">{unit}</span>}
        </div>
        {subLabel && (
          <p className="text-xs text-slate-400 mt-1">{subLabel}</p>
        )}
      </CardContent>
    </Card>
  );
});

VitalCard.displayName = "VitalCard";
export default VitalCard;
