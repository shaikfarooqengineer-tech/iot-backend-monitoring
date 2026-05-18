// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/DeviceCard.jsx
// PURPOSE: Device metadata card with status badges for battery and load.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DeviceCard = React.memo(function DeviceCard({
  deviceId,
  firmware,
  deviceType,
  bs,
  bl,
  highLoad,
  status,
  schema,
}) {
  const rows = [
    { label: "Device ID",      value: deviceId ?? "—" },
    { label: "Firmware",       value: firmware ?? "—" },
    { label: "Device Type",    value: deviceType ?? "—" },
    { label: "Battery/Signal", value: bs === 0 ? "Good" : `Weak (${bs ?? "—"})` },
    { label: "Status",         value: status ?? "Operational" },
    { label: "Schema",         value: schema ?? "—" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-teal-600" /> Device
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between">
            <span className="text-slate-600 text-sm">{row.label}</span>
            <span className="font-semibold text-sm text-slate-900">{row.value}</span>
          </div>
        ))}
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">Low Battery</span>
          {bl ? (
            <Badge className="bg-red-500 text-white text-xs">Low Battery</Badge>
          ) : (
            <Badge className="bg-green-500 text-white text-xs">OK</Badge>
          )}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-600 text-sm">High Load</span>
          {highLoad ? (
            <Badge className="bg-amber-500 text-white text-xs">Overloaded</Badge>
          ) : (
            <Badge className="bg-green-500 text-white text-xs">Normal</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

DeviceCard.displayName = "DeviceCard";
export default DeviceCard;
