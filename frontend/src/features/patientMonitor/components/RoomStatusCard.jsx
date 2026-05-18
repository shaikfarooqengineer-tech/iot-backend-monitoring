// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/RoomStatusCard.jsx
// PURPOSE: Room environment card: lux, temp, distance, presence, site/room.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Sun, ThermometerSun, Activity, MapPin, DoorOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RoomStatusCard = React.memo(function RoomStatusCard({
  lux,
  temp,
  distance,
  humanDetected,
  siteId,
  roomId,
}) {
  const items = [
    {
      icon: Sun,
      iconClass: "text-amber-500",
      label: "Light",
      value: lux ?? "—",
      unit: "lux",
    },
    {
      icon: ThermometerSun,
      iconClass: "text-orange-500",
      label: "Temp",
      value: temp ?? "—",
      unit: "°C",
    },
    {
      icon: Activity,
      iconClass: "text-blue-500",
      label: "Distance",
      value: distance ?? "—",
      unit: "m",
      sub: humanDetected ? "Person detected" : "No presence",
    },
    {
      icon: MapPin,
      iconClass: "text-emerald-500",
      label: "Site",
      value: siteId ?? "—",
    },
    {
      icon: DoorOpen,
      iconClass: "text-violet-500",
      label: "Room",
      value: roomId ?? "—",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Room Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="p-3 bg-slate-50 rounded-lg flex items-center gap-3"
            >
              <item.icon className={`w-5 h-5 ${item.iconClass}`} />
              <div>
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="font-semibold">
                  {item.value}
                  {item.unit ? ` ${item.unit}` : ""}
                </p>
                {item.sub && (
                  <p className="text-xs text-slate-400">{item.sub}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

RoomStatusCard.displayName = "RoomStatusCard";
export default RoomStatusCard;
