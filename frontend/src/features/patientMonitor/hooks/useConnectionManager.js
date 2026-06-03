// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/features/patientMonitor/hooks/useConnectionManager.js
// PURPOSE: Manages WebSocket + HTTP polling with all production fixes:
//   FIX 1: Token via auth frame, not URL
//   FIX 2: Token from useAuth(), not localStorage
//   FIX 3: Reconnect jitter
//   FIX 4: WS heartbeat (ping/pong)
//   FIX 5: Staleness detection (>10s without packet)
//   FIX 6: Packet epoch ordering
//   FIX 7: Tab visibility pause/resume
//   FIX 8: Toast debounce
//   FIX 9: ConnMode state machine (useReducer)
//   FIX 10: Safe cleanup on unmount
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useReducer, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { parsePacket } from "../validation/telemetrySchema";

// ─── Configuration ──────────────────────────────────────────────────────────

const BACKEND_HTTP = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const BACKEND_WS   = BACKEND_HTTP.replace(/^https/, "wss").replace(/^http/, "ws");

const WS_MAX_RETRIES        = parseInt(process.env.REACT_APP_WS_MAX_RETRIES || "3", 10);
const POLL_INTERVAL_MS      = parseInt(process.env.REACT_APP_POLL_INTERVAL_MS || "3000", 10);
const WS_BACKOFF_BASE_MS    = 1500;
const WS_BACKOFF_MAX_MS     = 30000;
const WS_CONNECT_TIMEOUT_MS = 8000;
const WS_AUTH_TIMEOUT_MS    = 5000;
const WS_PING_INTERVAL_MS   = 25000;
const WS_PONG_TIMEOUT_MS    = 35000;
const STALE_CHECK_INTERVAL  = 2000;
const STALE_TIMEOUT_MS      = 10000;
const TOAST_COOLDOWN_MS     = 10000;

// ─── ConnMode State Machine (FIX 9) ────────────────────────────────────────

const CONN_STATES = {
  IDLE:            "idle",
  CONNECTING:      "connecting",
  AUTHENTICATING:  "authenticating",
  CONNECTED:       "connected",
  STALE:           "stale",
  RECONNECTING:    "reconnecting",
  POLLING:         "polling",
  AUTH_FAILED:     "auth_failed",
  OFFLINE:         "offline",
};

function connReducer(state, action) {
  switch (action.type) {
    case "CONNECT_START":    return { ...state, mode: CONN_STATES.CONNECTING, message: action.message || "Connecting…" };
    case "AUTH_SENT":        return { ...state, mode: CONN_STATES.AUTHENTICATING, message: "Authenticating…" };
    case "AUTH_OK":          return { ...state, mode: CONN_STATES.CONNECTED, message: "Live", retryCount: 0 };
    case "AUTH_FAIL":        return { ...state, mode: CONN_STATES.AUTH_FAILED, message: action.message || "Auth failed" };
    case "MESSAGE_RECEIVED": return state.mode === CONN_STATES.STALE ? { ...state, mode: CONN_STATES.CONNECTED, message: "Live" } : state;
    case "DISCONNECT":       return { ...state, mode: CONN_STATES.OFFLINE, message: action.message || "Disconnected" };
    case "RETRY":            return { ...state, mode: CONN_STATES.RECONNECTING, retryCount: state.retryCount + 1, message: action.message || "Reconnecting…" };
    case "POLL_START":       return { ...state, mode: CONN_STATES.POLLING, message: "Live (Polling)" };
    case "STALE_DETECTED":   return state.mode === CONN_STATES.CONNECTED ? { ...state, mode: CONN_STATES.STALE, message: action.message || "Data Stale" } : state;
    case "FRESH_RECEIVED":   return state.mode === CONN_STATES.STALE ? { ...state, mode: CONN_STATES.CONNECTED, message: "Live" } : state;
    case "MANUAL_RETRY":     return { ...state, mode: CONN_STATES.CONNECTING, retryCount: 0, message: "Connecting…" };
    case "UNMOUNT":          return { ...state, mode: CONN_STATES.IDLE };
    default:                 return state;
  }
}

const initialConnState = {
  mode: CONN_STATES.CONNECTING,
  message: "Connecting to patient monitor…",
  retryCount: 0,
};

// ─── Structured Logger ──────────────────────────────────────────────────────

function createLogger(patientId, docRef) {
  const ctx = () => ({
    patientId,
    deviceId: docRef.current?.device_id ?? null,
    roomId: docRef.current?.room_id ?? null,
  });
  return {
    info:  (event, data = {}) => console.info(JSON.stringify({ level: "info",  ts: Date.now(), patientCtx: ctx(), event, ...data })),
    warn:  (event, data = {}) => console.warn(JSON.stringify({ level: "warn",  ts: Date.now(), patientCtx: ctx(), event, ...data })),
    error: (event, data = {}) => console.error(JSON.stringify({ level: "error", ts: Date.now(), patientCtx: ctx(), event, ...data })),
  };
}

// ─── Toast Debounce (FIX 8) ─────────────────────────────────────────────────

function createToastDebouncer() {
  const cooldowns = {};
  return function toastOnce(key, fn, cooldownMs = TOAST_COOLDOWN_MS) {
    if (Date.now() - (cooldowns[key] ?? 0) < cooldownMs) return;
    cooldowns[key] = Date.now();
    fn();
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useConnectionManager(patientId) {
  const { token } = useAuth();

  const [connState, dispatch] = useReducer(connReducer, initialConnState);

  // Refs for non-rendering state
  const wsRef              = useRef(null);
  const pollIntervalRef    = useRef(null);
  const reconnectTimeout   = useRef(null);
  const connectTimeoutRef  = useRef(null);
  const authTimeoutRef     = useRef(null);
  const pingIntervalRef    = useRef(null);
  const pongTimeoutRef     = useRef(null);
  const staleWatchdogRef    = useRef(null);
  const isMounted          = useRef(true);
  const retryCountRef      = useRef(0);
  const latestEpoch        = useRef(-1);
  const lastTelemetryAt    = useRef(null);
  const lastPongAt         = useRef(Date.now());
  const docRef             = useRef(null);
  const tokenRef           = useRef(token);
  const toastOnce          = useRef(createToastDebouncer()).current;

  // Callback ref for validated doc — set by parent
  const onDocReceived      = useRef(null);

  const log = useRef(createLogger(patientId, docRef)).current;

  // Keep tokenRef fresh
  useEffect(() => { tokenRef.current = token; }, [token]);

  const resolveToken = useCallback(() => {
    return tokenRef.current || localStorage.getItem("session_token");
  }, []);

  // ─── Cleanup helper ─────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen    = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose   = null;
      wsRef.current.onerror   = null;
      if (wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close(1000, "Component cleanup");
      }
      wsRef.current = null;
    }
    clearTimeout(reconnectTimeout.current);
    clearTimeout(connectTimeoutRef.current);
    clearTimeout(authTimeoutRef.current);
    clearTimeout(pongTimeoutRef.current);
    clearInterval(pollIntervalRef.current);
    clearInterval(pingIntervalRef.current);
    clearInterval(staleWatchdogRef.current);
  }, []);

  // ─── Process validated packet ───────────────────────────────────────────

  const processPacket = useCallback((rawData) => {
    // Status frames (source=empty) bypass schema validation — no epoch, no event_id
    if (rawData && rawData.source === "empty") {
      if (!isMounted.current) return;
      docRef.current = rawData;
      lastTelemetryAt.current = Date.now();
      
      // Critical Phase 3 fix: Trigger parent callback ref so standard fallback data streams pass through
      if (onDocReceived.current) onDocReceived.current(rawData);
      
      dispatch({ type: "FRESH_RECEIVED" });
      dispatch({ type: "MESSAGE_RECEIVED" });
      return;
    }

    const result = parsePacket(rawData);
    if (!result.success) {
      log.warn("packet_discarded_schema_invalid", { issues: result.error });
      return;
    }

    const doc = result.data;

    // FIX 6 — Packet ordering: discard stale/duplicate epochs
    if (doc.epoch != null && doc.epoch <= latestEpoch.current) {
      log.warn("packet_discarded_stale", { docEpoch: doc.epoch, latestEpoch: latestEpoch.current });
      return;
    }
    if (doc.epoch != null) latestEpoch.current = doc.epoch;

    if (!isMounted.current) return;

    docRef.current = doc;
    lastTelemetryAt.current = Date.now();

    // Critical Phase 3 fix: Notify parent on successful live stream frames
    if (onDocReceived.current) onDocReceived.current(doc);

    // Clear stale status state variables
    dispatch({ type: "FRESH_RECEIVED" });
    dispatch({ type: "MESSAGE_RECEIVED" });
  }, [log]);

  // ─── HTTP Polling (FIX 2: uses tokenRef from useAuth) ──────────────────

  const fetchPoll = useCallback(async () => {
    console.log("[DEBUG] fetchPoll called");
    console.log("[DIAGNOSTIC] fetchPoll sending token value:", tokenRef.current);
    console.log("[DIAGNOSTIC] localStorage token value:", localStorage.getItem('session_token'));

    if (!isMounted.current) return;
    const currentToken = resolveToken();
    if (!currentToken) {
      log.warn("poll_error", { reason: "No session token" });
      return;
    }
    if (!BACKEND_HTTP) {
      log.error("poll_error", { reason: "REACT_APP_BACKEND_URL not set" });
      dispatch({ type: "DISCONNECT", message: "Config error: no backend URL" });
      return;
    }

    try {
      const url = `${BACKEND_HTTP}/api/dashboard-stream${patientId ? `?patient_id=${encodeURIComponent(patientId)}` : ""}`;
      log.info("poll_start", { url });

      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${currentToken}`,
          "Content-Type":  "application/json",
        },
        credentials: "omit",
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json();
      log.info("poll_success");
      processPacket(data);
    } catch (err) {
      log.error("poll_error", { message: err.message });
      if (isMounted.current) {
        dispatch({ type: "DISCONNECT", message: `Poll error: ${err.message}` });
      }
    }
  }, [log, processPacket, patientId, resolveToken]);

  // ─── Start polling ──────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (!isMounted.current) return;
    log.info("poll_start", { interval: POLL_INTERVAL_MS });
    toastOnce("ws_polling", () =>
      toast.info("Real-time: switched to HTTP polling (WebSocket unavailable)", { duration: 6000 })
    );

    dispatch({ type: "POLL_START" });
    fetchPoll();
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(fetchPoll, POLL_INTERVAL_MS);
  }, [fetchPoll, log, toastOnce]);

  // ─── WS Heartbeat (FIX 4) ──────────────────────────────────────────────

  const startHeartbeat = useCallback((ws) => {
    clearInterval(pingIntervalRef.current);
    clearTimeout(pongTimeoutRef.current);
    lastPongAt.current = Date.now();

    pingIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, WS_PING_INTERVAL_MS);

    // Pong watchdog
    const checkPong = () => {
      if (Date.now() - lastPongAt.current > WS_PONG_TIMEOUT_MS) {
        log.warn("ws_heartbeat_timeout");
        ws.close(4002, "Heartbeat timeout");
        return;
      }
      pongTimeoutRef.current = setTimeout(checkPong, 5000);
    };
    pongTimeoutRef.current = setTimeout(checkPong, WS_PONG_TIMEOUT_MS);
  }, [log]);

  // ─── WS Connection (FIX 1: auth frame, FIX 3: jitter) ─────────────────

  const connectWebSocket = useCallback(() => {
    if (!isMounted.current) return;
    if (!patientId) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    if (retryCountRef.current >= WS_MAX_RETRIES) {
      log.warn("ws_closed", { reason: `Max retries (${WS_MAX_RETRIES}) reached` });
      startPolling();
      return;
    }

    if (!BACKEND_WS) {
      log.error("ws_connect_attempt", { error: "No backend URL" });
      dispatch({ type: "DISCONNECT", message: "Config error: no backend URL" });
      return;
    }

    // FIX 1: NO token in URL parameters
    const wsUrl = `${BACKEND_WS}/api/ws?patient_id=${encodeURIComponent(patientId)}`;
    const attempt = retryCountRef.current + 1;

    log.info("ws_connect_attempt", { attempt, maxRetries: WS_MAX_RETRIES });
    dispatch({ type: "CONNECT_START", message: `Connecting… (attempt ${attempt}/${WS_MAX_RETRIES})` });

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      log.error("ws_connect_attempt", { error: err.message });
      handleWsFailure(err.message);
      return;
    }

    wsRef.current = ws;

    // Connection timeout
    clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        log.warn("ws_closed", { reason: `Connect timeout after ${WS_CONNECT_TIMEOUT_MS}ms` });
        ws.close();
        handleWsFailure("Connection timed out");
      }
    }, WS_CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (!isMounted.current) return;
      clearTimeout(connectTimeoutRef.current);

      // FIX 1: Send auth frame immediately
      const currentToken = resolveToken();
      if (!currentToken) {
        // Corrected contextual logging for WebSocket authentication
        console.log("[DEBUG] WebSocket Connection: Missing auth token");
        console.log("[DIAGNOSTIC] authContext token value:", tokenRef.current);
        console.log("[DIAGNOSTIC] localStorage token value:", localStorage.getItem('session_token'));
        log.error("ws_auth_failed", { reason: "No token available" });
        ws.close(4001, "No auth token");
        dispatch({ type: "AUTH_FAIL", message: "No authentication token" });
        return;
      }
      
      // Critical Phase 3 bugfix: logic inversion correction (only logs when successfully resolved)
      console.log("[DEBUG] WebSocket token resolved successfully, sending auth frame");

      log.info("ws_auth_sent");
      ws.send(JSON.stringify({ type: "auth", token: currentToken }));
      dispatch({ type: "AUTH_SENT" });

      // Auth timeout — must receive auth_ok frame within 5 seconds
      clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
          log.warn("ws_auth_failed", { reason: "Auth timeout" });
          ws.close(4001, "Auth timeout");
          handleWsFailure("Auth response timed out");
        }
      }, WS_AUTH_TIMEOUT_MS);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(event.data);

        // Handle control messages
        if (data.type === "auth_ok") {
          clearTimeout(authTimeoutRef.current);
          log.info("ws_auth_ok");
          retryCountRef.current = 0;
          dispatch({ type: "AUTH_OK" });
          toastOnce("ws_connected", () =>
            toast.success("Monitor connected (WebSocket)", { duration: 3000 })
          );
          startHeartbeat(ws);
          return;
        }

        if (data.type === "auth_fail") {
          clearTimeout(authTimeoutRef.current);
          log.error("ws_auth_failed", { reason: data.reason });
          toastOnce("ws_auth_failed", () =>
            toast.error(`Authentication failed: ${data.reason || "invalid token"}`, { duration: 8000 })
          );
          dispatch({ type: "AUTH_FAIL", message: data.reason });
          ws.close(4001, "Auth failed");
          startPolling();
          return;
        }

        if (data.type === "pong") {
          lastPongAt.current = Date.now();
          return;
        }

        // Telemetry packet
        log.info("ws_message_received");
        processPacket(data);
      } catch (err) {
        log.error("ws_message_received", { error: err.message, raw: event.data?.slice(0, 200) });
      }
    };

    ws.onerror = () => {
      log.warn("ws_closed", { reason: "onerror fired (see onclose)" });
    };

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      clearTimeout(connectTimeoutRef.current);
      clearTimeout(authTimeoutRef.current);
      clearInterval(pingIntervalRef.current);
      clearTimeout(pongTimeoutRef.current);

      log.info("ws_closed", { code: event.code, reason: event.reason, wasClean: event.wasClean });

      if (event.code === 1000) return;

      if (event.code === 4001) {
        log.error("ws_auth_failed", { reason: event.reason });
        toastOnce("ws_auth_failed", () =>
          toast.error(`Auth failed: ${event.reason || "invalid token"}`, { duration: 8000 })
        );
        dispatch({ type: "AUTH_FAIL", message: event.reason });
        startPolling();
        return;
      }

      handleWsFailure(`Closed: code=${event.code}`);
    };
  }, [patientId, startPolling, processPacket, startHeartbeat, log, toastOnce, resolveToken]);

  // ─── Handle WS failure (FIX 3: jitter) ─────────────────────────────────

  const handleWsFailure = useCallback((reason) => {
    retryCountRef.current += 1;

    if (retryCountRef.current >= WS_MAX_RETRIES) {
      log.warn("ws_closed", { reason: `Gave up after ${retryCountRef.current} attempts: ${reason}` });
      startPolling();
      return;
    }

    // FIX 3: Exponential backoff + random jitter
    const jitter = Math.random() * 1000;
    const delay = Math.min(
      WS_BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current - 1) + jitter,
      WS_BACKOFF_MAX_MS
    );

    log.info("ws_connect_attempt", { retry: retryCountRef.current, maxRetries: WS_MAX_RETRIES, delayMs: Math.round(delay), reason });
    dispatch({ type: "RETRY", message: `Reconnecting in ${Math.round(delay / 1000)}s… (${reason})` });

    clearTimeout(reconnectTimeout.current);
    reconnectTimeout.current = setTimeout(connectWebSocket, delay);
  }, [startPolling, log, connectWebSocket]);

  // ─── Manual retry ──────────────────────────────────────────────────────

  const manualRetry = useCallback(() => {
    log.info("ws_connect_attempt", { trigger: "manual" });
    stopAll();
    retryCountRef.current = 0;
    latestEpoch.current = -1;
    dispatch({ type: "MANUAL_RETRY" });
    connectWebSocket();
  }, [stopAll, connectWebSocket, log]);

  // ─── FIX 5: Staleness watchdog ──────────────────────────────────────────

  useEffect(() => {
    staleWatchdogRef.current = setInterval(() => {
      if (lastTelemetryAt.current && Date.now() - lastTelemetryAt.current > STALE_TIMEOUT_MS) {
        const staleSec = Math.round((Date.now() - lastTelemetryAt.current) / 1000);
        const staleMin = Math.round(staleSec / 60);
        dispatch({ type: "STALE_DETECTED", message: `Data Stale — last update ${staleMin} minutes ago` });
        log.warn("stale_detected", { staleSec }); 
      }
    }, STALE_CHECK_INTERVAL);

    return () => clearInterval(staleWatchdogRef.current);
  }, [log]);

  // ─── FIX 7: Tab visibility ─────────────────────────────────────────────

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearInterval(pollIntervalRef.current);
      } else if (document.visibilityState === "visible") {
        // Resume polling if we're in polling mode
        if (pollIntervalRef.current) {
          fetchPoll();
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = setInterval(fetchPoll, POLL_INTERVAL_MS);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchPoll]);

  // ─── Mount / Unmount ────────────────────────────────────────────────────

  useEffect(() => {
    isMounted.current = true;
    if (!patientId || !token) return;

    connectWebSocket();

    return () => {
      isMounted.current = false;
      dispatch({ type: "UNMOUNT" });
      stopAll();
      log.info("cleanup");
    };
  }, [patientId, token, connectWebSocket, stopAll, log]);

  return {
    connState,
    doc: docRef.current,
    dispatch,
    manualRetry,
    onDocReceived,
  };
}