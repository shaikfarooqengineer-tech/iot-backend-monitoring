// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/RrChartPanel.jsx
// PURPOSE: Respiration rate trend area chart with accumulated history.
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { Wind } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const RrChartPanel = React.memo(function RrChartPanel({
  rrHistory,
  breathConfidence,
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Wind className="w-5 h-5 text-blue-500" /> Respiration Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={rrHistory}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="pmRrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 30]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#pmRrGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-2">
          Signal confidence: {breathConfidence?.toFixed(1) ?? "—"}%
        </p>
      </CardContent>
    </Card>
  );
});

RrChartPanel.displayName = "RrChartPanel";
export default RrChartPanel;
