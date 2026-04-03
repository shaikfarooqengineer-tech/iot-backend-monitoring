// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/pages/PatientMonitor.js
// PURPOSE: Patient-scoped monitoring page with dual-mode data transport:
//   1. PRIMARY   — WebSocket (wss:// on deployed, ws:// on localhost)
//   2. FALLBACK  — HTTP polling via GET /api/dashboard (every 3 s)
//
// WHY FALLBACK?
//   Vercel Serverless Functions run on AWS Lambda. Lambda terminates after
//   the HTTP response, so a persistent WebSocket (101 Switching Protocols)
//   is never established — the proxy returns 304/200 instead. HTTP polling
//   is the only reliable real-time strategy on Vercel serverless backends.
//
// STRATEGY:
//   - Always attempt WebSocket first (works perfectly on any real server)
//   - After WS_MAX_RETRIES failures, seamlessly switch to HTTP polling
//   - User sees a connection-mode badge (Live WS / Live (Polling) / Offline)
//   - Manual "Retry WS" button lets the user re-attempt WebSocket anytime
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Heart, Wind, Moon, AlertTriangle, Activity, Footprints,
  ThermometerSun, Sun, Radio, AlertCircle, Wifi, WifiOff, RefreshCw,
  ArrowLeft
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { useAuth } from "@/context/AuthContext";

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * REACT_APP_BACKEND_URL must be set in:
 *   - .env (localhost dev)           → http://localhost:8000
 *   - .env.production (Vercel build) → https://sleep-monitoring-backend.vercel.app
 *   - Vercel Dashboard env vars      → https://sleep-monitoring-backend.vercel.app
 *
 * The variable is baked in at build time by Create React App.
 * An empty string here means the build was done without the env var set.
 */
const BACKEND_HTTP = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

/**
 * Convert http(s):// → ws(s):// for WebSocket connections.
 * https://example.com → wss://example.com
 * http://localhost:8000 → ws://localhost:8000
 */
const BACKEND_WS = BACKEND_HTTP.replace(/^https/, "wss").replace(/^http/, "ws");

// How many times to retry WebSocket before giving up and switching to polling
const WS_MAX_RETRIES = parseInt(process.env.REACT_APP_WS_MAX_RETRIES || "3", 10);

// HTTP polling interval in ms
const POLL_INTERVAL_MS = parseInt(process.env.REACT_APP_POLL_INTERVAL_MS || "3000", 10);

// Exponential back-off config for WS reconnection attempts
const WS_BACKOFF_BASE_MS  = 1500;   // 1.5 s initial delay
const WS_BACKOFF_MAX_MS   = 30000;  // cap at 30 s
const WS_CONNECT_TIMEOUT_MS = 8000; // if no open/error within 8 s, treat as failure

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts(label) {
  // Returns a tagged, timestamped log prefix
  return `[PatientMonitor ${new Date().toISOString()}] ${label}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatientMonitor() {
  const { patientId: patientIdParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Resolve patient ID: URL param (admin view) ‖ own user_id (patient view)
  const patientId = patientIdParam || user?.user_id;

  // ── State ──
  const [dashboardData, setDashboardData] = useState(null);
  const [connMode, setConnMode]           = useState("connecting"); // "ws" | "polling" | "connecting" | "offline"
  const [lastUpdate, setLastUpdate]       = useState(null);
  const [wsRetryCount, setWsRetryCount]   = useState(0);
  const [statusMessage, setStatusMessage] = useState("Connecting to patient monitor…");
  const [initError, setInitError]         = useState(null); // fatal error shown in loading screen

  // ── Refs (not state — don't need re-render) ──
  const wsRef            = useRef(null);
  const pollIntervalRef  = useRef(null);
  const reconnectTimeout = useRef(null);
  const connectTimeoutRef= useRef(null);
  const retryCountRef    = useRef(0);  // mirror of wsRetryCount for use inside callbacks
  const isMounted        = useRef(true);

  // ─── Cleanup helper ────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.onopen    = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose   = null;
      wsRef.current.onerror   = null;
      if (wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close(1000, "Component unmounting");
      }
      wsRef.current = null;
    }
    // Clear timers
    clearTimeout(reconnectTimeout.current);
    clearTimeout(connectTimeoutRef.current);
    clearInterval(pollIntervalRef.current);
  }, []);

  // ─── HTTP Polling fetch ────────────────────────────────────────────────────
  const fetchPoll = useCallback(async () => {
    if (!isMounted.current) return;

    const token = localStorage.getItem("session_token") ?? "";
    if (!token) {
      console.warn(ts("Poll: no session_token found, skipping"));
      return;
    }

    if (!BACKEND_HTTP) {
      console.error(ts("REACT_APP_BACKEND_URL is not set! Cannot poll."));
      setStatusMessage("Configuration error: REACT_APP_BACKEND_URL is not set.");
      setConnMode("offline");
      return;
    }

    try {
      // /api/dashboard-stream is a dedicated polling endpoint that returns the same
      // DashboardData shape as WebSocket messages. It is auth-protected (Bearer token).
      const url = `${BACKEND_HTTP}/api/dashboard-stream`;
      console.info(ts(`Poll → GET ${url}`));

      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type":  "application/json",
        },
        // Do NOT send credentials (cookies) on cross-domain requests — use Bearer token
        credentials: "omit",
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      if (isMounted.current) {
        setDashboardData(data);
        setLastUpdate(new Date());
        setConnMode("polling");
        setStatusMessage("Live (Polling)");
      }
    } catch (err) {
      console.error(ts(`Poll error: ${err.message}`));
      if (isMounted.current) {
        // Don't clear dashboardData on transient error — keep showing last known values
        setConnMode("offline");
        setStatusMessage(`Connection issue: ${err.message}`);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Start HTTP Polling (called after WS gives up) ─────────────────────────
  const startPolling = useCallback(() => {
    if (!isMounted.current) return;
    console.info(ts("Switching to HTTP polling fallback"));
    toast.info("Real-time: switched to HTTP polling (WebSocket not supported on this platform)", {
      duration: 6000,
    });

    setConnMode("polling");
    setStatusMessage("Live (Polling)");

    // Fetch immediately, then repeat
    fetchPoll();
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(fetchPoll, POLL_INTERVAL_MS);
  }, [fetchPoll]);

  // ─── WebSocket Connection ──────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (!isMounted.current) return;
    if (!user || !patientId) {
      console.info(ts("WS: waiting for user/patientId"), { user: !!user, patientId });
      return;
    }

    // Guard: already open
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.info(ts("WS: already open, skipping reconnect"));
      return;
    }

    // Guard: too many retries → fall back to polling
    if (retryCountRef.current >= WS_MAX_RETRIES) {
      console.warn(ts(`WS: max retries (${WS_MAX_RETRIES}) reached, switching to polling`));
      startPolling();
      return;
    }

    if (!BACKEND_WS) {
      console.error(ts("REACT_APP_BACKEND_URL is not set! Cannot connect WebSocket."));
      setInitError("Configuration error: REACT_APP_BACKEND_URL is not set. Check Vercel environment variables.");
      setConnMode("offline");
      return;
    }

    const token    = localStorage.getItem("session_token") ?? "";
    const wsUrl    = `${BACKEND_WS}/api/ws?token=${encodeURIComponent(token)}&patient_id=${encodeURIComponent(patientId)}`;
    const attempt  = retryCountRef.current + 1;

    console.info(ts(`WS attempt ${attempt}/${WS_MAX_RETRIES}: ${wsUrl.replace(token, "***")}`));
    setStatusMessage(`Connecting… (attempt ${attempt}/${WS_MAX_RETRIES})`);
    setConnMode("connecting");

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      // Thrown synchronously if URL is invalid
      console.error(ts(`WS constructor error: ${err.message}`));
      handleWsFailure(err.message);
      return;
    }

    wsRef.current = ws;

    // ── Connection timeout — if WS hangs without open/error ──
    clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn(ts(`WS connect timeout after ${WS_CONNECT_TIMEOUT_MS}ms`));
        ws.close();
        handleWsFailure("Connection timed out");
      }
    }, WS_CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (!isMounted.current) return;
      clearTimeout(connectTimeoutRef.current);
      console.info(ts("✅ WebSocket CONNECTED"));
      toast.success("Monitor connected (WebSocket)", { duration: 3000 });
      retryCountRef.current = 0;
      setWsRetryCount(0);
      setConnMode("ws");
      setStatusMessage("Live");
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(event.data);
        setDashboardData(data);
        setLastUpdate(new Date());
      } catch (err) {
        console.error(ts(`WS parse error: ${err.message}`), event.data?.slice(0, 200));
      }
    };

    ws.onerror = (event) => {
      // onerror fires before onclose — just log; actual retry happens in onclose
      console.warn(ts("WS onerror fired (see onclose for retry)"), event);
    };

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      clearTimeout(connectTimeoutRef.current);
      console.info(ts(`WS closed: code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`));

      // Normal close (unmount): do nothing
      if (event.code === 1000) return;

      // Auth failure — don't retry, go offline
      if (event.code === 4001) {
        console.error(ts("WS auth failed — not retrying"));
        toast.error(`Authentication failed: ${event.reason || "invalid token"}`, { duration: 8000 });
        setConnMode("offline");
        setStatusMessage(`Auth error: ${event.reason}`);
        startPolling(); // Still try polling — maybe REST auth works differently
        return;
      }

      handleWsFailure(`Closed with code ${event.code}`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, patientId, startPolling]);

  // ─── Handle a WS failure: back-off then retry or fall back ────────────────
  const handleWsFailure = useCallback((reason) => {
    retryCountRef.current += 1;
    setWsRetryCount(retryCountRef.current);

    if (retryCountRef.current >= WS_MAX_RETRIES) {
      console.warn(ts(`WS gave up after ${retryCountRef.current} attempts. Reason: ${reason}`));
      startPolling();
      return;
    }

    // Exponential back-off: 1.5s, 3s, 6s … capped at 30s
    const delay = Math.min(
      WS_BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current - 1),
      WS_BACKOFF_MAX_MS
    );
    console.info(ts(`WS retry ${retryCountRef.current}/${WS_MAX_RETRIES} in ${delay}ms. Reason: ${reason}`));
    setStatusMessage(`Reconnecting in ${Math.round(delay / 1000)}s… (${reason})`);
    setConnMode("connecting");

    clearTimeout(reconnectTimeout.current);
    reconnectTimeout.current = setTimeout(connectWebSocket, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPolling]); // connectWebSocket added via ref to avoid stale closure

  // ─── Manual retry: reset counters and try WS again ────────────────────────
  const manualRetry = useCallback(() => {
    console.info(ts("Manual WS retry triggered by user"));
    stopAll();
    retryCountRef.current = 0;
    setWsRetryCount(0);
    setConnMode("connecting");
    connectWebSocket();
  }, [stopAll, connectWebSocket]);

  // ─── Effect: start on mount ────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;

    if (!user || !patientId) return;

    connectWebSocket();

    return () => {
      isMounted.current = false;
      stopAll();
    };
    // connectWebSocket is memoised — this effect intentionally runs once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, patientId]);

  // ─── Loading / Error screen ────────────────────────────────────────────────
  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md px-4">
          {connMode === "offline" ? (
            <WifiOff className="w-14 h-14 text-red-400 mx-auto mb-4" />
          ) : (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          )}

          <p className="text-slate-700 font-semibold text-lg mb-1">
            {connMode === "offline" ? "Connection Failed" : "Connecting to patient monitor…"}
          </p>

          <p className="text-sm text-slate-500 mb-2">{statusMessage}</p>

          {initError && (
            <p className="text-xs text-red-500 bg-red-50 rounded p-2 mb-3 text-left break-words">
              {initError}
            </p>
          )}

          <p className="text-xs text-slate-400 mb-4">Patient ID: {patientId}</p>

          {connMode === "offline" && (
            <Button size="sm" variant="outline" onClick={manualRetry} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Retry Connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── Destructure data ─────────────────────────────────────────────────────
  const {
    patient, vitals, room_status, device_status,
    alerts, sleep_quality, activity_level,
    heart_rate_history, respiration_history
  } = dashboardData;

  // ─── Connection badge ──────────────────────────────────────────────────────
  const connBadge = {
    ws:         { color: "bg-green-500",  pulse: true,  label: "Live (WS)" },
    polling:    { color: "bg-blue-400",   pulse: true,  label: "Live (Polling)" },
    connecting: { color: "bg-amber-400",  pulse: false, label: statusMessage },
    offline:    { color: "bg-red-500",    pulse: false, label: "Offline" },
  }[connMode] ?? { color: "bg-slate-400", pulse: false, label: connMode };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-[1800px] mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-sm text-slate-500">
              {patient.room} · Age {patient.age} · {patient.status}
            </p>
          </div>
        </div>

        {/* Connection Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${connBadge.color} ${connBadge.pulse ? "animate-pulse" : ""}`}
          />
          <span className="text-sm text-slate-600">{connBadge.label}</span>
          {connMode === "polling" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-blue-600 hover:text-blue-800"
              onClick={manualRetry}
              title="Attempt to upgrade to WebSocket"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Try WS
            </Button>
          )}
        </div>
      </div>

      {/* ── Vitals ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-heart"><Heart className="w-6 h-6" fill="currentColor" /></div>
              <Badge className={vitals.heart_rate_status === "Normal" ? "badge-normal" : "badge-warning"}>
                {vitals.heart_rate_status}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 mb-1">Heart Rate</p>
              <span className="text-4xl font-bold text-slate-900">{vitals.heart_rate}</span>{" "}
              <span className="text-lg text-slate-500">bpm</span>
            </div>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-breath"><Wind className="w-6 h-6" /></div>
              <Badge className={vitals.respiration_status === "Steady" ? "badge-normal" : "badge-warning"}>
                {vitals.respiration_status}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 mb-1">Respiration</p>
              <span className="text-4xl font-bold text-slate-900">{vitals.respiration_rate}</span>{" "}
              <span className="text-lg text-slate-500">breaths/min</span>
            </div>
          </CardContent>
        </Card>

        <Card className="vital-card">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="icon-container icon-sleep"><Moon className="w-6 h-6" /></div>
              <Badge className={vitals.sleep_quality === "Stable" ? "badge-normal" : "badge-info"}>
                {vitals.sleep_quality}
              </Badge>
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
              <Badge className={!vitals.fall_detected ? "badge-normal" : "badge-danger"}>
                {vitals.fall_status}
              </Badge>
            </div>
            <div className="mt-4">
              <p className="text-sm text-slate-500 mb-1">Fall Detection</p>
              <span className="text-2xl font-bold text-slate-900">
                {vitals.fall_detected ? "Fall Detected!" : "Safe"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Room & Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle>Room Status</CardTitle></CardHeader>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[120px]">
              {alerts.length === 0 ? (
                <p className="text-slate-400 text-center py-6">No active alerts</p>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={a.id || i} className={`alert-item ${a.severity}`}>
                      <div className="flex items-start gap-2">
                        <AlertCircle
                          className={`w-4 h-4 mt-0.5 ${a.severity === "high" ? "text-red-500" : "text-amber-500"}`}
                        />
                        <div>
                          <p className={`text-sm font-medium ${a.severity === "high" ? "text-red-700" : "text-amber-700"}`}>
                            {a.message}
                          </p>
                          <p className="text-xs text-slate-500">{a.time}</p>
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

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" fill="currentColor" /> Heart Rate Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={heart_rate_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="pmHr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis domain={[40, 160]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} fill="url(#pmHr)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Wind className="w-5 h-5 text-blue-500" /> Respiration Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={respiration_history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="pmRr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 30]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} fill="url(#pmRr)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Moon className="w-5 h-5 text-indigo-500" /> Sleep
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sleep_quality.total_hours}h {sleep_quality.total_minutes}m</p>
            <p className="text-sm text-slate-500">
              Quality: {sleep_quality.quality_percentage}% — {sleep_quality.quality_label}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Footprints className="w-5 h-5 text-emerald-500" /> Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activity_level.movement}</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">
              {activity_level.steps} <span className="text-sm font-normal text-slate-500">steps</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-teal-600" /> Device
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Radar</span>
              <Badge className="badge-normal">{device_status.radar_sensor}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Signal</span>
              <span className="font-semibold">{device_status.signal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Battery</span>
              <span className="font-semibold">{device_status.battery}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Footer ── */}
      <p className="text-center text-sm text-slate-500">
        Last updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : "Waiting…"}{" "}
        {connMode === "polling" && <span className="text-blue-400">(HTTP polling)</span>}
        {connMode === "ws"      && <span className="text-green-500">(WebSocket)</span>}
      </p>
    </div>
  );
}
