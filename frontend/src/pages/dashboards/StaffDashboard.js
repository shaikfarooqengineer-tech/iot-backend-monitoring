// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/dashboards/StaffDashboard.js
// PURPOSE: Staff dashboard — retains the existing IoT WebSocket monitoring
//          view from the original Dashboard.js (generic stream mode).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Heart, Wind, Moon, AlertTriangle, Activity, Footprints,
  ThermometerSun, Sun, Radio, AlertCircle, Wifi, Battery,
  User
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/context/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function StaffDashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [isConnected,   setIsConnected]   = useState(false);
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const { user } = useAuth();

  const wsRef               = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connectWebSocket = useCallback(() => {
    if (!user) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = localStorage.getItem("session_token") ?? "";
    const base  = BACKEND_URL.replace(/^http/, "ws");
    const wsUrl = `${base}/api/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setIsConnected(true); };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDashboardData(data);
        setLastUpdate(new Date());
        if (data.alerts?.length > 0) {
          const critical = data.alerts.find(a => a.severity === "high");
          if (critical) toast.error(critical.message, { duration: 5000 });
        }
      } catch (e) { console.error("WS parse error:", e); }
    };
    ws.onclose = () => { setIsConnected(false); reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000); };
    ws.onerror = () => { setIsConnected(false); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWebSocket, user]);

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Connecting to monitoring system…</p>
        </div>
      </div>
    );
  }

  const { patient, vitals, room_status, device_status, alerts, sleep_quality, activity_level, heart_rate_history, respiration_history } = dashboardData;

  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">
      {/* Header + Connection status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Health Monitoring</h1>
          <p className="text-sm text-slate-500">Real-Time Patient Monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-sm text-slate-600">{isConnected ? "Live" : "Reconnecting…"}</span>
        </div>
      </div>

      {/* Patient Info Bar */}
      <div className="bg-white border border-slate-200 rounded-lg px-6 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
            {patient.avatar_url
              ? <img src={patient.avatar_url} alt={patient.name} className="w-full h-full object-cover" />
              : <User className="w-6 h-6 text-slate-400" />}
          </div>
          <div>
            <span className="text-slate-600">Patient:</span>
            <span className="font-semibold text-slate-900 ml-2">{patient.name}</span>
          </div>
        </div>
        <span className="text-slate-300">|</span>
        <span className="text-slate-600">{patient.room}</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-600">Age: {patient.age}</span>
        <span className="text-slate-300">|</span>
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">{patient.status}</Badge>
      </div>

      {/* Vital Signs Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-heart"><Heart className="w-6 h-6" fill="currentColor" /></div>
              <Badge className={vitals.heart_rate_status === "Normal" ? "badge-normal" : "badge-warning"}>{vitals.heart_rate_status}</Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 mb-1">Heart Rate</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">{vitals.heart_rate}</span>
                <span className="text-lg text-slate-500">bpm</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-breath"><Wind className="w-6 h-6" /></div>
              <Badge className={vitals.respiration_status === "Steady" ? "badge-normal" : "badge-warning"}>{vitals.respiration_status}</Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 mb-1">Respiration Rate</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">{vitals.respiration_rate}</span>
                <span className="text-lg text-slate-500">breaths/min</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-sleep"><Moon className="w-6 h-6" /></div>
              <Badge className={vitals.sleep_quality === "Stable" ? "badge-normal" : "badge-info"}>{vitals.sleep_quality}</Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 mb-1">Sleep Status</p>
              <span className="text-2xl font-bold text-slate-900">{vitals.sleep_status}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-fall"><AlertTriangle className="w-6 h-6" /></div>
              <Badge className={!vitals.fall_detected ? "badge-normal" : "badge-danger"}>{vitals.fall_status}</Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 mb-1">Fall Detection</p>
              <span className="text-2xl font-bold text-slate-900">{vitals.fall_detected ? "Fall Detected!" : "No Fall Detected"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Room Status & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="vital-card">
          <CardHeader className="pb-2"><CardTitle className="text-lg">Live Room Status</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
                <Sun className="w-5 h-5 text-amber-500" />
                <div><p className="text-xs text-slate-500">Light</p><p className="font-semibold">{room_status.light} lux</p></div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
                <ThermometerSun className="w-5 h-5 text-orange-500" />
                <div><p className="text-xs text-slate-500">Temp</p><p className="font-semibold">{room_status.temperature}°C</p></div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3">
                <Activity className="w-5 h-5 text-blue-500" />
                <div><p className="text-xs text-slate-500">Motion</p><p className="font-semibold">{room_status.motion}</p></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[140px]">
              {alerts.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-400"><p>No active alerts</p></div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert, i) => (
                    <div key={alert.id || i} className={`alert-item ${alert.severity}`}>
                      <div className="flex items-start gap-2">
                        <AlertCircle className={`w-4 h-4 mt-0.5 ${alert.severity === "high" ? "text-red-500" : alert.severity === "medium" ? "text-amber-500" : "text-green-500"}`} />
                        <div><p className={`text-sm font-medium ${alert.severity === "high" ? "text-red-700" : alert.severity === "medium" ? "text-amber-700" : "text-green-700"}`}>{alert.message}</p><p className="text-xs text-slate-500 mt-1">{alert.time}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="vital-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Heart className="w-5 h-5 text-red-500" fill="currentColor" /> Heart Rate Trend</CardTitle>
            <Select defaultValue="today">
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="week">This Week</SelectItem></SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={heart_rate_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="hrG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} /><stop offset="95%" stopColor="#EF4444" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                <YAxis domain={[40, 160]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} fill="url(#hrG)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Wind className="w-5 h-5 text-blue-500" /> Respiration Trend</CardTitle>
            <Select defaultValue="24h">
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="24h">Last 24 Hours</SelectItem><SelectItem value="week">This Week</SelectItem></SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={respiration_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="rrG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                <YAxis domain={[0, 30]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} fill="url(#rrG)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Sleep / Activity / Device */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="vital-card">
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Moon className="w-5 h-5 text-indigo-500" /> Sleep Quality</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{sleep_quality.total_hours}h {sleep_quality.total_minutes}m</p>
            <p className="text-sm text-slate-500 mt-1">Deep: {sleep_quality.deep_sleep_hours}h {sleep_quality.deep_sleep_minutes}m</p>
            <p className="text-sm mt-2"><span className="font-medium">{sleep_quality.quality_percentage}%</span> — {sleep_quality.quality_label}</p>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Footprints className="w-5 h-5 text-emerald-500" /> Activity Level</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{activity_level.movement}</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{activity_level.steps} <span className="text-sm text-slate-500 font-normal">steps today</span></p>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Radio className="w-5 h-5 text-teal-600" /> Device Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-slate-600" /><span className="text-slate-700">Radar:</span><Badge className="badge-normal ml-auto">{device_status.radar_sensor}</Badge></div>
            <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-slate-600" /><span className="text-slate-700">Signal:</span><span className="font-semibold ml-auto">{device_status.signal}</span></div>
            <div className="flex items-center gap-2"><Battery className="w-4 h-4 text-slate-600" /><span className="text-slate-700">Battery:</span><span className="font-semibold ml-auto">{device_status.battery}%</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="text-center text-sm text-slate-500">
        Last updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : "Connecting…"}
      </div>
    </div>
  );
}
