import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { 
  Heart, Wind, Moon, AlertTriangle, Bell, Phone, User,
  Wifi, Battery, Activity, Footprints, ThermometerSun,
  Sun, Radio, ChevronDown, AlertCircle, LogOut, Settings
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
// import { Progress } from "../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ScrollArea } from "../components/ui/scroll-area";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { authFetch, getAuthHeaders } from "../utils/authFetch"; // named exports
import { Link, useNavigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Dashboard = ({ backendUrl }) => {
  const [dashboardData, setDashboardData] = useState(null);
  const [isConnected,   setIsConnected]   = useState(false);
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [user,        setUser]        = useState(null);  // populated from /api/auth/me
  const [authLoading, setAuthLoading] = useState(true);  // true until auth resolves
  // ────────────────────────────────────────────────────────────────────────────
  
  const wsRef               = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  
  // ── handle Logout ──────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await authFetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST'
      });
      localStorage.removeItem('session_token');
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  

  // ── 1. Auth check — runs on mount, before WebSocket or dashboard renders ───
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const userRes = await authFetch(`${BACKEND_URL}/api/auth/me`);
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        } else {
          // 401 / 403 → redirect to login
          toast.error("Session expired. Please log in again.");
          window.location.href = "/login";
        }
      } catch (err) {
        toast.error("Authentication failed. Please log in.");
        window.location.href = "/login";
      } finally {
        setAuthLoading(false); // unblock the rest of the component either way
      }
    };
    verifyAuth();
  }, []); // runs once

  // ── 2 & 3. WebSocket — only opens after auth succeeds, token sent in URL ───
  const connectWebSocket = useCallback(() => {
    if (!user) return;                                          // 2. guard: no user = no socket
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // 3. Pass token as query-param (WebSocket API has no custom-header support)
    // Uses the same key as authFetch.js → localStorage 'session_token'
    const token = localStorage.getItem("session_token") ?? "";
    const base  = (backendUrl || BACKEND_URL).replace(/^http/, "ws");
    const wsUrl = `${base}/api/ws?token=${encodeURIComponent(token)}`;

    console.log("Connecting to WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      toast.success("Connected to monitoring system");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDashboardData(data);
        setLastUpdate(new Date());
        if (data.alerts?.length > 0) {
          const criticalAlert = data.alerts.find(a => a.severity === "high");
          if (criticalAlert) toast.error(criticalAlert.message, { duration: 5000 });
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsConnected(false);
    };
  }, [backendUrl, user]); // user in deps: socket re-evaluates only after auth resolves

  useEffect(() => {
    if (!user) return; // effect-level guard mirrors the callback guard
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connectWebSocket, user]);

  // ── 5. Two-phase loading screen ────────────────────────────────────────────
  if (authLoading) {                            // phase 1: waiting for /api/auth/me
    return (
      <div className="dashboard-container flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Verifying authentication…</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {                         // phase 2: waiting for first WS payload
    return (
      <div className="dashboard-container flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Connecting to monitoring system…</p>
        </div>
      </div>
    );
  }
  // ────────────────────────────────────────────────────────────────────────────

  const {
    patient, vitals, room_status, device_status,
    alerts, sleep_quality, activity_level,
    heart_rate_history, respiration_history
  } = dashboardData;

  return (
    <div className="dashboard-container" data-testid="dashboard-container">

      {/* Header */}
      <header className="dashboard-header sticky top-0 z-50 bg-white/95 backdrop-blur-sm" data-testid="dashboard-header">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
              Health Monitoring Dashboard
            </h1>
            <p className="text-sm text-slate-500">Real-Time Patient Monitoring</p>
          </div>

          <div className="flex items-center gap-6">
            {/* Connection status */}
            <div className="live-indicator" data-testid="connection-status">
              <span className={`live-dot ${isConnected ? "" : "bg-red-500"}`} />
              <span className="text-sm text-slate-600">{isConnected ? "Live" : "Reconnecting…"}</span>
            </div>

            {/* Notifications */}
            <button className="relative p-2 hover:bg-slate-100 rounded-lg transition-colors" data-testid="notifications-btn">
              <Bell className="w-5 h-5 text-slate-600" />
              {alerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {alerts.length}
                </span>
              )}
            </button>

            {/* Phone */}
            <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" data-testid="phone-btn">
              <Phone className="w-5 h-5 text-slate-600" />
            </button>

            {/* 4. Authenticated user — data comes from /api/auth/me response */}
            <div className="relative">
  <button
    onClick={() => setUserMenuOpen(!userMenuOpen)}
    className="flex items-center gap-3 hover:bg-slate-100 px-3 py-2 rounded-lg transition"
  >
    <div className="text-right hidden sm:block">
      <p className="text-sm font-semibold text-slate-900">
        {user?.full_name ?? user?.name ?? user?.email ?? "User"}
      </p>
      <p className="text-xs text-slate-500">
        {user?.role ?? "Caregiver"} | Online
      </p>
    </div>

    <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
      {user?.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user?.name ?? "avatar"}
          className="w-full h-full object-cover"
        />
      ) : (
        <User className="w-5 h-5 text-slate-400" />
      )}
    </div>

    <ChevronDown className="w-4 h-4 text-slate-500" />
  </button>

  {/* Dropdown menu */}
  {userMenuOpen && (
    <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-2 z-50">

      <Link
        to="/profile"
        className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        onClick={() => setUserMenuOpen(false)}
      >
        <User className="w-4 h-4 mr-2" />
        Profile
      </Link>

      <Link
        to="/settings"
        className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        onClick={() => setUserMenuOpen(false)}
      >
        <Settings className="w-4 h-4 mr-2" />
        Settings
      </Link>

      <button
        onClick={handleLogout}
        className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Logout
      </button>

    </div>
  )}
</div>
          </div>
        </div>
      </header>

      {/* Patient Info Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3" data-testid="patient-info-bar">
        <div className="max-w-[1800px] mx-auto flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
              {patient.avatar_url
                ? <img src={patient.avatar_url} alt={patient.name} className="w-full h-full object-cover" />
                : <User className="w-6 h-6 m-2 text-slate-400" />}
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
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Status:</span>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200" data-testid="patient-status">
              {patient.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6 max-w-[1800px] mx-auto">

        {/* Vital Signs Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="vitals-row">
          <Card className="vital-card" data-testid="heart-rate-card">
            <CardContent className="p-0">
              <div className="flex items-start justify-between">
                <div className="icon-container icon-heart"><Heart className="w-6 h-6" fill="currentColor" /></div>
                <Badge className={vitals.heart_rate_status === "Normal" ? "badge-normal" : "badge-warning"} data-testid="heart-rate-status">
                  {vitals.heart_rate_status}
                </Badge>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-500 mb-1">Heart Rate</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="heart-rate-value">
                    {vitals.heart_rate}
                  </span>
                  <span className="text-lg text-slate-500">bpm</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="vital-card" data-testid="respiration-card">
            <CardContent className="p-0">
              <div className="flex items-start justify-between">
                <div className="icon-container icon-breath"><Wind className="w-6 h-6" /></div>
                <Badge className={vitals.respiration_status === "Steady" ? "badge-normal" : "badge-warning"} data-testid="respiration-status">
                  {vitals.respiration_status}
                </Badge>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-500 mb-1">Respiration Rate</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="respiration-value">
                    {vitals.respiration_rate}
                  </span>
                  <span className="text-lg text-slate-500">breaths/min</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="vital-card" data-testid="sleep-status-card">
            <CardContent className="p-0">
              <div className="flex items-start justify-between">
                <div className="icon-container icon-sleep"><Moon className="w-6 h-6" /></div>
                <Badge className={vitals.sleep_quality === "Stable" ? "badge-normal" : "badge-info"} data-testid="sleep-quality-status">
                  {vitals.sleep_quality}
                </Badge>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-500 mb-1">Sleep Status</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="sleep-status-value">
                    {vitals.sleep_status}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="vital-card" data-testid="fall-detection-card">
            <CardContent className="p-0">
              <div className="flex items-start justify-between">
                <div className="icon-container icon-fall"><AlertTriangle className="w-6 h-6" /></div>
                <Badge className={!vitals.fall_detected ? "badge-normal" : "badge-danger"} data-testid="fall-detection-status">
                  {vitals.fall_status}
                </Badge>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-500 mb-1">Fall Detection</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="fall-detection-value">
                    {vitals.fall_detected ? "Fall Detected!" : "No Fall Detected"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Room Status & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="vital-card" data-testid="room-status-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
                Live Room Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6">
                <div className="room-visual flex-1 min-h-[160px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-24 mx-auto mb-3 relative">
                      <svg viewBox="0 0 64 96" className="w-full h-full">
                        <ellipse cx="32" cy="12" rx="10" ry="10" fill="#64748B" />
                        <rect x="22" y="22" width="20" height="35" rx="3" fill="#64748B" />
                        <rect x="20" y="57" width="10" height="30" rx="2" fill="#64748B" />
                        <rect x="34" y="57" width="10" height="30" rx="2" fill="#64748B" />
                        <rect x="10" y="28" width="12" height="6" rx="2" fill="#64748B" />
                        <rect x="42" y="28" width="12" height="6" rx="2" fill="#64748B" />
                      </svg>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-slate-200">
                      <p className="text-sm font-medium text-slate-700">
                        {room_status.presence_detected ? "Presence Detected" : "No Presence"} | Distance:{" "}
                        <span className="font-bold">{room_status.distance} m</span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Sun className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-xs text-slate-500">Light</p>
                      <p className="font-semibold text-slate-900" data-testid="light-value">{room_status.light} lux</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <ThermometerSun className="w-5 h-5 text-orange-500" />
                    <div>
                      <p className="text-xs text-slate-500">Temp</p>
                      <p className="font-semibold text-slate-900" data-testid="temp-value">{room_status.temperature}°C</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <Activity className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="text-xs text-slate-500">Motion</p>
                      <p className="font-semibold text-slate-900" data-testid="motion-value">{room_status.motion}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="vital-card" data-testid="alerts-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[180px]">
                {alerts.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400"><p>No active alerts</p></div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert, index) => (
                      <div key={alert.id || index} className={`alert-item ${alert.severity}`} data-testid={`alert-item-${index}`}>
                        <div className="flex items-start gap-2">
                          <AlertCircle className={`w-4 h-4 mt-0.5 ${
                            alert.severity === "high" ? "text-red-500" :
                            alert.severity === "medium" ? "text-amber-500" : "text-green-500"
                          }`} />
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${
                              alert.severity === "high" ? "text-red-700" :
                              alert.severity === "medium" ? "text-amber-700" : "text-green-700"
                            }`}>
                              {alert.severity === "high" && "ALERT: "}{alert.message}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">{alert.time}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="vital-card" data-testid="heart-rate-chart-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                <Heart className="w-5 h-5 text-red-500" fill="currentColor" />
                Heart Rate Trend
              </CardTitle>
              <Select defaultValue="today">
                <SelectTrigger className="w-[120px]" data-testid="heart-rate-period-select">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="trend-chart-container" data-testid="heart-rate-chart">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={heart_rate_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="heartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
                    <YAxis domain={[40, 160]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }}
                      label={{ value: "BPM", angle: -90, position: "insideLeft", fontSize: 11, fill: "#64748B" }} />
                    <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }} />
                    <Area type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} fill="url(#heartGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="vital-card" data-testid="respiration-chart-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                <Wind className="w-5 h-5 text-blue-500" />
                Respiration Trend
              </CardTitle>
              <Select defaultValue="24h">
                <SelectTrigger className="w-[140px]" data-testid="respiration-period-select">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="trend-chart-container" data-testid="respiration-chart">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={respiration_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="breathGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
                    <YAxis domain={[0, 30]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }}
                      label={{ value: "Breaths/Min", angle: -90, position: "insideLeft", fontSize: 10, fill: "#64748B" }} />
                    <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #E2E8F0", borderRadius: "8px", fontSize: "12px" }} />
                    <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} fill="url(#breathGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sleep / Activity / Device */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="vital-card" data-testid="sleep-quality-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                <Moon className="w-5 h-5 text-indigo-500" />
                Sleep Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="sleep-hours">
                      {sleep_quality.total_hours}h {sleep_quality.total_minutes}m
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    Deep Sleep: {sleep_quality.deep_sleep_hours}h {sleep_quality.deep_sleep_minutes}m
                  </p>
                </div>
                <div className="circular-progress" data-testid="sleep-quality-progress">
                  <svg width="100" height="100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E2E8F0" strokeWidth="10" />
                    <circle cx="50" cy="50" r="40" fill="none"
                      stroke={sleep_quality.quality_percentage >= 70 ? "#10B981" : "#F59E0B"}
                      strokeWidth="10"
                      strokeDasharray={`${(sleep_quality.quality_percentage / 100) * 251.2} 251.2`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="progress-value">
                    <span>{sleep_quality.quality_percentage}%</span>
                    <p className="text-xs text-slate-500 font-normal">{sleep_quality.quality_label}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="vital-card" data-testid="activity-level-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                <Footprints className="w-5 h-5 text-emerald-500" />
                Activity Level
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <p className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="movement-status">
                  {activity_level.movement}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-3xl font-bold text-blue-600" style={{ fontFamily: "Manrope, sans-serif" }} data-testid="steps-count">
                    {activity_level.steps}
                  </span>
                  <span className="text-slate-500">Steps Today</span>
                </div>
                <div className="activity-bars mt-4" data-testid="activity-bars">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="activity-bar"
                      style={{ height: `${Math.random() * 30 + 10}px`, opacity: 0.3 + (i / 12) * 0.7 }} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="vital-card" data-testid="device-status-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Manrope, sans-serif" }}>
                <Radio className="w-5 h-5 text-teal-600" />
                Device Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="device-indicator">
                  <Wifi className="w-5 h-5 text-slate-600" />
                  <span className="text-slate-700">Radar Sensor:</span>
                  <Badge className="badge-normal ml-auto" data-testid="radar-status">{device_status.radar_sensor}</Badge>
                </div>
                <div className="device-indicator">
                  <Activity className="w-5 h-5 text-slate-600" />
                  <span className="text-slate-700">Signal:</span>
                  <span className="font-semibold text-slate-900 ml-auto" data-testid="signal-status">{device_status.signal}</span>
                </div>
                <div className="device-indicator">
                  <Battery className="w-5 h-5 text-slate-600" />
                  <span className="text-slate-700">Battery:</span>
                  <span className="font-semibold text-slate-900 ml-auto" data-testid="battery-status">{device_status.battery}%</span>
                </div>
                <div className="mt-4 p-3 bg-slate-100 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="device-indicator-dot connected" />
                      <span className="text-sm text-slate-600">Device Online</span>
                    </div>
                    <div className="w-12 h-8 bg-slate-800 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-slate-500" data-testid="last-updated">
          Last updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : "Connecting…"}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;