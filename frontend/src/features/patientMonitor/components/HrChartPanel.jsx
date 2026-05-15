// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/HrChartPanel.jsx
// PURPOSE: Heart rate trend area chart with accumulated history points.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const HrChartPanel = React.memo(function HrChartPanel({
  hrHistory,
  heartbeatConfidence,
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500" fill="currentColor" /> Heart Rate Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={hrHistory}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="pmHrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[40, 160]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#EF4444"
              strokeWidth={2}
              fill="url(#pmHrGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-2">
          Signal confidence: {heartbeatConfidence?.toFixed(1) ?? "—"}%
        </p>
      </CardContent>
    </Card>
  );
});

HrChartPanel.displayName = "HrChartPanel";
export default HrChartPanel;
