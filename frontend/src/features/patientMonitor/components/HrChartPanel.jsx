// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/components/HrChartPanel.jsx
// PURPOSE: Heart rate trend area chart with time-based history filtering.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo } from "react";
import { Heart, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const HrChartPanel = React.memo(function HrChartPanel({
  hrHistory = [],
  heartbeatConfidence,
  onTimeFilterChange // Optional hook if the parent needs to fetch database logs on change
}) {
  // Default filter set to 60 minutes (1 hr)
  const [timeFilter, setTimeFilter] = useState(60);

  // Triggered when user selects a new time range from the dropdown
  const handleFilterChange = (e) => {
    const filterMinutes = Number(e.target.value);
    setTimeFilter(filterMinutes);
    
    // Alert the parent component if it needs to fetch historical data from MongoDB
    if (onTimeFilterChange) {
        onTimeFilterChange(filterMinutes);
    }
  };

  // Safe client-side filtering logic: 
  // Trims the graph points based on the selected time window.
  const filteredHistory = useMemo(() => {
    if (!hrHistory || hrHistory.length === 0) return [];

    // Attempt to dynamically find the latest timestamp to measure backwards from
    const latestPoint = hrHistory[hrHistory.length - 1];
    const latestTime = latestPoint?.timestamp || (latestPoint?.ts ? latestPoint.ts * 1000 : null) || Date.now();
    const cutoffMs = latestTime - (timeFilter * 60 * 1000);

    return hrHistory.filter(point => {
      // Find the raw epoch timestamp from your backend payload (e.g., point.ts)
      const pointTime = point.timestamp || (point.ts ? point.ts * 1000 : null);
      
      // Fallback: If no raw timestamp is found, don't break the chart, just return the point
      if (!pointTime) return true;
      
      return pointTime >= cutoffMs;
    });
  }, [hrHistory, timeFilter]);

  return (
    <Card>
      {/* Header layout shifted to flex-row to accommodate the dropdown */}
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500" fill="currentColor" /> Heart Rate Trend
        </CardTitle>

      <div className="relative inline-block w-fit">
        {/* The New Time Range Filter Dropdown */}
        <select
          value={timeFilter}
          onChange={handleFilterChange}
          className="appearance-none text-sm border border-slate-200 rounded-md text-slate-600 bg-white px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer shadow-sm transition-all"
        >
          <option value={5}>Last 5 min</option>
          <option value={15}>Last 15 min</option>
          <option value={30}>Last 30 min</option>
          <option value={60}>Last 1 hr</option>
          <option value={180}>Last 3 hrs</option>
          <option value={360}>Last 6 hrs</option>
          <option value={720}>Last 12 hrs</option>
          <option value={1440}>Last 24 hrs</option>
        </select>
      {/* Single Chevron with rotation */}
      <ChevronDown
        className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 w-4 h-4 transition-transform duration-200`}
      />
    </div>

      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          {/* Recharts AreaChart points to our filtered useMemo array */}
          <AreaChart
            data={filteredHistory}
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