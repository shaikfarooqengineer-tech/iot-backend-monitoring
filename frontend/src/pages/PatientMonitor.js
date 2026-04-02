// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/PatientMonitor.js
// PURPOSE: Patient-scoped monitoring page. Connects to WebSocket with
//          patient_id param and renders full IoT dashboard for one patient.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Heart, Wind, Moon, AlertTriangle, Activity, Footprints,
  ThermometerSun, Sun, Radio, AlertCircle, Wifi, Battery,
  User, ArrowLeft
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/context/AuthContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PatientMonitor() {
  const { patientId: patientIdParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const patientId = patientIdParam || user?.user_id;

  const [dashboardData, setDashboardData] = useState(null);
  const [isConnected,   setIsConnected]   = useState(false);
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const [wsError,       setWsError]       = useState(null);

  const wsRef               = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connectWebSocket = useCallback(() => {
    if (!user || !patientId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const token = localStorage.getItem("session_token") ?? "";
    const base  = BACKEND_URL.replace(/^http/, "ws");
    const wsUrl = `${base}/api/ws?token=${encodeURIComponent(token)}&patient_id=${encodeURIComponent(patientId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => { setIsConnected(true); };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDashboardData(data);
        setLastUpdate(new Date());
      } catch (e) { console.error("WS parse error:", e); }
    };
    ws.onclose = () => { setIsConnected(false); reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000); };
    ws.onerror = () => { setIsConnected(false); };
  }, [user, patientId]);

  useEffect(() => {
    if (!user || !patientId) {
      console.log("Waiting for user or patientId:", { user: !!user, patientId });
      return;
    }
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWebSocket, user, patientId]);

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Connecting to patient monitor…</p>
          {wsError && <p className="text-red-500 mt-2">{wsError}</p>}
          <p className="text-sm text-slate-500 mt-2">Patient ID: {patientId}</p>
        </div>
      </div>
    );
  }

  const { patient, vitals, room_status, device_status, alerts, sleep_quality, activity_level, heart_rate_history, respiration_history } = dashboardData;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-sm text-slate-500">{patient.room} · Age {patient.age} · {patient.status}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-sm text-slate-600">{isConnected ? "Live" : "Reconnecting…"}</span>
        </div>
      </div>

      {/* Vitals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-heart"><Heart className="w-6 h-6" fill="currentColor" /></div>
              <Badge className={vitals.heart_rate_status === "Normal" ? "badge-normal" : "badge-warning"}>{vitals.heart_rate_status}</Badge>
            </div>
            <div className="mt-4"><p className="text-sm text-slate-500 mb-1">Heart Rate</p><span className="text-4xl font-bold text-slate-900">{vitals.heart_rate}</span> <span className="text-lg text-slate-500">bpm</span></div>
          </CardContent>
        </Card>
        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-breath"><Wind className="w-6 h-6" /></div>
              <Badge className={vitals.respiration_status === "Steady" ? "badge-normal" : "badge-warning"}>{vitals.respiration_status}</Badge>
            </div>
            <div className="mt-4"><p className="text-sm text-slate-500 mb-1">Respiration</p><span className="text-4xl font-bold text-slate-900">{vitals.respiration_rate}</span> <span className="text-lg text-slate-500">breaths/min</span></div>
          </CardContent>
        </Card>
        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-sleep"><Moon className="w-6 h-6" /></div>
              <Badge className={vitals.sleep_quality === "Stable" ? "badge-normal" : "badge-info"}>{vitals.sleep_quality}</Badge>
            </div>
            <div className="mt-4"><p className="text-sm text-slate-500 mb-1">Sleep Status</p><span className="text-2xl font-bold text-slate-900">{vitals.sleep_status}</span></div>
          </CardContent>
        </Card>
        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-fall"><AlertTriangle className="w-6 h-6" /></div>
              <Badge className={!vitals.fall_detected ? "badge-normal" : "badge-danger"}>{vitals.fall_status}</Badge>
            </div>
            <div className="mt-4"><p className="text-sm text-slate-500 mb-1">Fall Detection</p><span className="text-2xl font-bold text-slate-900">{vitals.fall_detected ? "Fall Detected!" : "Safe"}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Room & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle>Room Status</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3"><Sun className="w-5 h-5 text-amber-500" /><div><p className="text-xs text-slate-500">Light</p><p className="font-semibold">{room_status.light} lux</p></div></div>
              <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3"><ThermometerSun className="w-5 h-5 text-orange-500" /><div><p className="text-xs text-slate-500">Temp</p><p className="font-semibold">{room_status.temperature}°C</p></div></div>
              <div className="p-3 bg-slate-50 rounded-lg flex items-center gap-3"><Activity className="w-5 h-5 text-blue-500" /><div><p className="text-xs text-slate-500">Motion</p><p className="font-semibold">{room_status.motion}</p></div></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Alerts</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-[120px]">
              {alerts.length === 0 ? <p className="text-slate-400 text-center py-6">No active alerts</p> : (
                <div className="space-y-2">{alerts.map((a, i) => (
                  <div key={a.id || i} className={`alert-item ${a.severity}`}>
                    <div className="flex items-start gap-2">
                      <AlertCircle className={`w-4 h-4 mt-0.5 ${a.severity === "high" ? "text-red-500" : "text-amber-500"}`} />
                      <div><p className={`text-sm font-medium ${a.severity === "high" ? "text-red-700" : "text-amber-700"}`}>{a.message}</p><p className="text-xs text-slate-500">{a.time}</p></div>
                    </div>
                  </div>
                ))}</div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-red-500" fill="currentColor" /> Heart Rate Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={heart_rate_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="pmHr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} /><stop offset="95%" stopColor="#EF4444" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="time" tick={{ fontSize: 11 }} /><YAxis domain={[40, 160]} tick={{ fontSize: 11 }} /><Tooltip />
                <Area type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} fill="url(#pmHr)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Wind className="w-5 h-5 text-blue-500" /> Respiration Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={respiration_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="pmRr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" /><XAxis dataKey="time" tick={{ fontSize: 11 }} /><YAxis domain={[0, 30]} tick={{ fontSize: 11 }} /><Tooltip />
                <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} fill="url(#pmRr)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Moon className="w-5 h-5 text-indigo-500" /> Sleep</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sleep_quality.total_hours}h {sleep_quality.total_minutes}m</p>
            <p className="text-sm text-slate-500">Quality: {sleep_quality.quality_percentage}% — {sleep_quality.quality_label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Footprints className="w-5 h-5 text-emerald-500" /> Activity</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activity_level.movement}</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{activity_level.steps} <span className="text-sm font-normal text-slate-500">steps</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2"><Radio className="w-5 h-5 text-teal-600" /> Device</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between"><span className="text-slate-600">Radar</span><Badge className="badge-normal">{device_status.radar_sensor}</Badge></div>
            <div className="flex justify-between"><span className="text-slate-600">Signal</span><span className="font-semibold">{device_status.signal}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Battery</span><span className="font-semibold">{device_status.battery}%</span></div>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-sm text-slate-500">Last updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : "Connecting…"}</p>
    </div>
  );
}
