// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/PatientView.js
// PURPOSE: Personal health summary for the patient role. Intentionally simple
//          — no sidebar, no admin UI. Designed for non-technical users.
//          Wrapped in PatientLayout (header with avatar + logout).
// ═══════════════════════════════════════════════════════════════════════════

import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Moon, Activity, Wifi } from "lucide-react";

export default function PatientView() {
  const { user } = useAuth();

  const cards = [
    { icon: Heart,    color: "text-red-500",     label: "Heart rate",  value: "--", unit: "bpm" },
    { icon: Moon,     color: "text-indigo-500",  label: "Sleep",       value: "--", unit: "hours last night" },
    { icon: Activity, color: "text-emerald-500", label: "Activity",    value: "--", unit: "steps today" },
    { icon: Wifi,     color: "text-blue-500",    label: "Device",      value: "—",  unit: "awaiting connection" },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Hello, {user?.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Here's your health overview</p>
      </div>

      {/* Health cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ icon: Icon, color, label, value, unit }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} /> {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-400 mt-1">{unit}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Device connection notice */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-sm text-slate-500">
          Live readings will appear once your monitoring device is connected.
          <br />
          <span className="text-slate-400">Contact your care team if you need help.</span>
        </p>
      </div>
    </div>
  );
}
