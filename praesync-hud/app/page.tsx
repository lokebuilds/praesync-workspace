"use client";

import React, { useState, useEffect, useRef } from "react";

const INCIDENT_PRESETS = [
  {
    label: "DB Pool Exhaustion",
    payload: "Sev-1 DB Timeout: connection pool exhausted in auth-db-primary (max_conn=5)",
  },
  {
    label: "Redis Cache Stampede",
    payload: "Sev-1 Redis Timeout: cache stampede on user-session-worker (TTL=0 burst)",
  },
  {
    label: "Kafka Consumer Lag",
    payload: "Sev-1 Kafka Alert: partition lag exceeded 45,000 in payment-processor",
  },
  {
    label: "Postgres Row Deadlock",
    payload: "Sev-1 Deadlock: concurrent transaction deadlock on order_checkout table",
  },
];

export default function PraesyncHud() {
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<"ONLINE" | "CONNECTING" | "OFFLINE">("CONNECTING");
  const [activeCoordinator, setActiveCoordinator] = useState<string>("swarm-investigator");
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [timeElapsed, setTimeElapsed] = useState<string>("00m 00.0s");
  const [customAlertText, setCustomAlertText] = useState<string>(INCIDENT_PRESETS[0].payload);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [codeDiff, setCodeDiff] = useState<string | null>(null);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState<boolean>(false);

  const [logs, setLogs] = useState<string[]>([
    "[04:12:00.000] [SYSTEM] Telemetry link armed: ws://127.0.0.1:8000/ws/logs",
    "[04:12:00.412] [SWARM] Agent mesh initialized: investigator, patcher, ops",
    "[04:12:01.080] [READY] Awaiting Sev-1 telemetry from Datadog webhook router...",
  ]);

  const socketRef = useRef<WebSocket | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement | null>(null);

  // Strict timestamp helper with millisecond precision
  const getTimestamp = () => {
    const d = new Date();
    const pad = (n: number, z = 2) => String(n).padStart(z, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  };

  // Format seconds into MMm SS.Ss
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = (totalSeconds % 60).toFixed(1);
    const pad = (n: number) => String(n).padStart(2, "0");
    const padSecs = Number(secs) < 10 ? `0${secs}` : secs;
    return `${pad(mins)}m ${padSecs}s`;
  };

  // Stop clock the exact moment prUrl is populated
  useEffect(() => {
    if (prUrl && timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      setIsSimulating(false);
    }
  }, [prUrl]);

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket("ws://127.0.0.1:8000/ws/logs");
        socketRef.current = ws;

        ws.onopen = () => {
          setWsStatus("ONLINE");
          setLogs((prev) => [
            `[${getTimestamp()}] [WS_FEED] Handshake verified: Socket stream synchronized`,
            ...prev,
          ]);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const ts = getTimestamp();

            if (data.type === "error" || data.status === "error") {
              if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
              }
              setIsSimulating(false);
              setLogs((prev) => [
                `[${ts}] > [ERROR] ${data.message || "Backend crash detected"}`,
                ...prev,
              ]);
              return;
            }

            if (data.agent) {
              setActiveCoordinator(data.agent);
            }

            if (data.status === "rollout_initiated" || data.status === "approved") {
              setIsApproved(true);
              setIsApproving(false);
              setActiveCoordinator("swarm-ops");
              setLogs((prev) => [
                `[${ts}] [SWARM_OPS] >>> Canary rollout verified: Production traffic switching to zones us-east-1a, us-east-1b`,
                ...prev,
              ]);
            }

            if (data.code_diff) {
              setCodeDiff(data.code_diff);
            }

            if (data.pr_url) {
              setPrUrl(data.pr_url);
              if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
              }
              setIsSimulating(false);
              setLogs((prev) => [
                `[${ts}] [SWARM_PATCHER] >>> Pull Request deployed: ${data.pr_url}`,
                ...prev,
              ]);
            } else if (data.message) {
              setLogs((prev) => [
                `[${ts}] [${(data.agent || "SWARM").toUpperCase()}] ${data.message}`,
                ...prev,
              ]);
            }
          } catch {
            setLogs((prev) => [`[${getTimestamp()}] [RAW] ${event.data}`, ...prev]);
          }
        };

        ws.onerror = () => {
          setWsStatus("OFFLINE");
        };

        ws.onclose = () => {
          setWsStatus("OFFLINE");
          setTimeout(connectWebSocket, 3000);
        };
      } catch {
        setWsStatus("OFFLINE");
        setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDiffModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleApproveDeployment = async () => {
    if (isApproving || isApproved) return;
    setIsApproving(true);
    const ts = getTimestamp();
    setLogs((prev) => [
      `[${ts}] > [DEPLOY_GATEKEEPER] Human lead authorization submitted: "Approve and Deploy"...`,
      ...prev,
    ]);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/deploy/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: "Human Lead (SRE)",
          action: "Approve and Deploy",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      setIsApproved(true);
      setActiveCoordinator("swarm-ops");
      setLogs((prev) => [
        `[${getTimestamp()}] [ACK] Human sign-off accepted: Canary progressive rollout authorized across 3 zones`,
        ...prev,
      ]);
    } catch (err: any) {
      console.error("Failed to approve deployment:", err);
      setLogs((prev) => [
        `[${getTimestamp()}] > [ERROR] Gatekeeper authorization failed: ${err?.message || "Connection refused"}`,
        ...prev,
      ]);
    } finally {
      setIsApproving(false);
    }
  };

  const triggerDatadogAlert = async () => {
    if (isSimulating) return;

    const alertMessage = customAlertText.trim() || INCIDENT_PRESETS[0].payload;
    const lower = alertMessage.toLowerCase();

    // If operator entered an approval phrase, route directly to Gatekeeper
    if (lower.includes("approve") || lower.includes("deploy") || lower.includes("rollout")) {
      await handleApproveDeployment();
      return;
    }

    // Reset PR state, approval state, diff modal, and start timer
    setPrUrl(null);
    setCodeDiff(null);
    setIsDiffModalOpen(false);
    setIsApproved(false);
    setIsSimulating(true);
    setActiveCoordinator("swarm-investigator");

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    startTimeRef.current = Date.now();
    setTimeElapsed("00m 00.0s");

    timerIntervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setTimeElapsed(formatTimer(elapsed));
      }
    }, 100);

    const ts = getTimestamp();
    setLogs((prev) => [
      `[${ts}] > [SYSTEM] Transmitting incident payload: "${alertMessage}"...`,
      ...prev,
    ]);

    const targetUrl = process.env.NEXT_PUBLIC_SWITCH_URL || "http://127.0.0.1:8000/webhook/datadog";
    const endpoint = targetUrl.endsWith("/webhook/datadog") ? targetUrl : `${targetUrl}/webhook/datadog`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert_type: "Custom",
          message: alertMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      setLogs((prev) => [
        `[${getTimestamp()}] [ACK] Webhook received by 127.0.0.1:8000: Swarm workflow active`,
        ...prev,
      ]);
    } catch (err: any) {
      console.error("Failed to transmit incident payload:", err);
      setLogs((prev) => [
        `[${getTimestamp()}] > [ERROR] Backend unreachable at 127.0.0.1:8000/webhook/datadog: ${
          err?.message || "Connection refused"
        }`,
        ...prev,
      ]);
      setIsSimulating(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  // Determine stage states
  const getStageStatus = (stage: "investigator" | "patcher" | "ops") => {
    if (stage === "investigator") {
      if (prUrl || activeCoordinator === "swarm-patcher" || activeCoordinator === "swarm-ops") {
        return "COMPLETED";
      }
      if (isSimulating || activeCoordinator === "swarm-investigator") {
        return "ANALYZING";
      }
      return "STANDBY";
    }

    if (stage === "patcher") {
      if (prUrl) {
        return "COMPLETED";
      }
      if (activeCoordinator === "swarm-patcher") {
        return "SYNTHESIZING";
      }
      return "STANDBY";
    }

    if (stage === "ops") {
      if (isApproved) {
        return "ROLLOUT_ACTIVE";
      }
      if (prUrl) {
        return "AWAITING_APPROVAL";
      }
      return "STANDBY";
    }

    return "STANDBY";
  };

  const investigatorStatus = getStageStatus("investigator");
  const patcherStatus = getStageStatus("patcher");
  const opsStatus = getStageStatus("ops");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col p-6 gap-5 antialiased selection:bg-zinc-100 selection:text-zinc-950">
      {/* 1. Header: Brand, WS Status, and Tabular MTTR Clock */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-zinc-800 bg-zinc-900 rounded-2xl p-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <h1 className="text-sm font-semibold tracking-wider font-mono text-zinc-100 uppercase">
              PRAESYNC HUD
            </h1>
            <span className="text-zinc-700 font-mono text-xs">/</span>
            <span className="text-xs font-mono text-zinc-400">
              CLUSTER TELEMETRY MESH
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Switch AI Multi-Agent Sev-1 Incident Command & Autonomous ReAct Hotpatch
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* SWITCH_ORCHESTRATOR Badge */}
          <div className="flex items-center gap-2 px-3 h-10 rounded-xl border border-zinc-800 bg-zinc-950 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-zinc-500">SWITCH_MESH:</span>
            <span className="text-blue-400 font-medium">ARMED</span>
          </div>

          {/* WS_FEED Badge */}
          <div className="flex items-center gap-2 px-3 h-10 rounded-xl border border-zinc-800 bg-zinc-950 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === "ONLINE"
                  ? "bg-emerald-400"
                  : wsStatus === "CONNECTING"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-zinc-600"
              }`}
            />
            <span className="text-zinc-500">WS_FEED:</span>
            <span
              className={`tabular-nums font-medium ${
                wsStatus === "ONLINE"
                  ? "text-emerald-400"
                  : wsStatus === "CONNECTING"
                  ? "text-amber-400"
                  : "text-zinc-500"
              }`}
            >
              {wsStatus}
            </span>
          </div>

          {/* Resolution Clock */}
          <div className="flex items-center gap-2.5 px-4 h-10 rounded-xl border border-zinc-800 bg-zinc-950 font-mono">
            <span className="text-xs text-zinc-500">MTTR_CLOCK:</span>
            <span
              className={`text-sm tabular-nums font-semibold tracking-tight ${
                isSimulating ? "text-amber-400 animate-pulse" : prUrl ? "text-emerald-400" : "text-zinc-300"
              }`}
            >
              {timeElapsed}
            </span>
          </div>
        </div>
      </header>

      {/* 2. Mission Control Bar: Incident Input & Presets */}
      <section className="border border-zinc-800 bg-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>INCIDENT COMMAND CENTER</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            ReAct Target: Gemini-3.5-Flash
          </span>
        </div>

        {/* Input & Dispatch Button (44px hit slop) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={customAlertText}
              onChange={(e) => setCustomAlertText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSimulating && customAlertText.trim()) {
                  triggerDatadogAlert();
                }
              }}
              placeholder="Enter Sev-1 incident telemetry or select a preset below..."
              disabled={isSimulating}
              className="w-full h-11 px-4 rounded-xl text-xs font-mono bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors disabled:opacity-50"
            />
          </div>

          <button
            onClick={triggerDatadogAlert}
            disabled={isSimulating || !customAlertText.trim()}
            className={`min-h-[44px] h-11 px-6 rounded-xl text-xs font-mono font-medium border border-zinc-700 bg-zinc-800 text-zinc-100 transition-all duration-200 ease-out flex items-center justify-center gap-2.5 shrink-0 ${
              isSimulating || !customAlertText.trim()
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-zinc-700/80 active:scale-[0.98] cursor-pointer"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSimulating ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
              }`}
            />
            <span>{isSimulating ? "DISPATCHING SWARM..." : "DISPATCH INCIDENT"}</span>
          </button>
        </div>

        {/* 1-Click Preset Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800/80">
          <span className="text-[11px] font-mono text-zinc-500 mr-1">PRESETS:</span>
          {INCIDENT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                if (!isSimulating) setCustomAlertText(preset.payload);
              }}
              disabled={isSimulating}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-mono border transition-all duration-150 ${
                customAlertText === preset.payload
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Connected 3-Stage Autonomous Pipeline */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stage 1: Investigator */}
        <div
          className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors ${
            investigatorStatus === "ANALYZING"
              ? "border-amber-400/80 bg-zinc-900"
              : investigatorStatus === "COMPLETED"
              ? "border-zinc-800 bg-zinc-900"
              : "border-zinc-800/80 bg-zinc-900/60"
          }`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-blue-400 font-medium">SWITCH_AGENT: 01</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                  investigatorStatus === "ANALYZING"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                    : investigatorStatus === "COMPLETED"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500"
                }`}
              >
                {investigatorStatus}
              </span>
            </div>
            <h2 className="text-sm font-semibold font-mono text-zinc-100">
              @swarm-investigator
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Isolates failing microservice, parses socket telemetry, and defines the remediation scope.
            </p>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>TARGET:</span>
            <span className="text-zinc-300">auth-db-primary</span>
          </div>
        </div>

        {/* Stage 2: Patcher & Pull Request */}
        <div
          className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors ${
            prUrl
              ? "border-emerald-400/80 bg-zinc-900"
              : patcherStatus === "SYNTHESIZING"
              ? "border-amber-400/80 bg-zinc-900"
              : "border-zinc-800/80 bg-zinc-900/60"
          }`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-blue-400 font-medium">SWITCH_AGENT: 02</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                  prUrl
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                    : patcherStatus === "SYNTHESIZING"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500"
                }`}
              >
                {prUrl ? "PR_DEPLOYED" : patcherStatus}
              </span>
            </div>
            <h2 className="text-sm font-semibold font-mono text-zinc-100">
              @swarm-patcher
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Synthesizes atomic Python patch via ReAct engine and natively commits to GitHub.
            </p>
          </div>

          {/* Dynamic PR Action Buttons */}
          {prUrl ? (
            <div className="flex flex-col gap-2">
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] h-10 px-3 rounded-xl text-xs font-mono font-medium border border-emerald-400 bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25 transition-all duration-200 flex items-center justify-center gap-2 text-center"
              >
                <span>REVIEW PR ON GITHUB →</span>
              </a>
              {codeDiff && (
                <button
                  type="button"
                  onClick={() => setIsDiffModalOpen(true)}
                  className="min-h-[34px] h-8.5 px-3 rounded-xl text-[11px] font-mono border border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800 transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>⚡ PREVIEW HOTPATCH DIFF</span>
                </button>
              )}
            </div>
          ) : (
            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-500">
              <span>TOOL_BINDING:</span>
              <span className="text-zinc-300">create_github_pr</span>
            </div>
          )}
        </div>

        {/* Stage 3: Ops Gatekeeper */}
        <div
          className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors ${
            opsStatus === "ROLLOUT_ACTIVE"
              ? "border-emerald-400/80 bg-zinc-900"
              : opsStatus === "AWAITING_APPROVAL"
              ? "border-amber-400/80 bg-zinc-900"
              : "border-zinc-800/80 bg-zinc-900/60"
          }`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-blue-400 font-medium">SWITCH_AGENT: 03</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                  opsStatus === "ROLLOUT_ACTIVE"
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                    : opsStatus === "AWAITING_APPROVAL"
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-400 animate-pulse"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500"
                }`}
              >
                {opsStatus}
              </span>
            </div>
            <h2 className="text-sm font-semibold font-mono text-zinc-100">
              @swarm-ops
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {opsStatus === "ROLLOUT_ACTIVE"
                ? "Human sign-off verified. Canary progressive rollout active across 3 zones. Sev-1 incident closed."
                : "Deployment gatekeeper. Awaiting human lead sign-off to initiate production canary rollout."}
            </p>
          </div>

          {/* Interactive Gatekeeper Sign-off Button */}
          {opsStatus === "ROLLOUT_ACTIVE" ? (
            <div className="min-h-[44px] h-11 px-4 rounded-xl text-xs font-mono font-medium border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 flex items-center justify-center gap-2 text-center">
              <span>✓ CANARY ROLLOUT ACTIVE (100% HEALTHY)</span>
            </div>
          ) : opsStatus === "AWAITING_APPROVAL" ? (
            <button
              onClick={handleApproveDeployment}
              disabled={isApproving}
              className="min-h-[44px] h-11 px-4 rounded-xl text-xs font-mono font-medium border border-amber-400 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 transition-all duration-200 flex items-center justify-center gap-2 text-center cursor-pointer disabled:opacity-50 shadow-[0_0_15px_rgba(251,191,36,0.2)]"
            >
              <span>{isApproving ? "APPROVING ROLLOUT..." : "APPROVE & DEPLOY →"}</span>
            </button>
          ) : (
            <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-500">
              <span>BRIDGE:</span>
              <span className="text-zinc-300">Switch Slack War Room</span>
            </div>
          )}
        </div>
      </section>

      {/* 4. Full-Width Monospace Telemetry Stream */}
      <section className="border border-zinc-800 bg-zinc-900 rounded-2xl p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <h3 className="text-xs font-mono text-zinc-300 uppercase tracking-wider">
              LIVE WEBSOCKET STREAM (/WS/LOGS)
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-zinc-500">
              {logs.length} FRAMES
            </span>
            <button
              onClick={() => setLogs([])}
              className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              CLEAR
            </button>
          </div>
        </div>

        {/* Monospace Log Rows */}
        <div className="h-64 overflow-y-auto font-mono text-xs space-y-1.5 pr-2 select-text">
          {logs.map((log, index) => {
            const isError = log.includes("[ERROR]");
            const isInvestigator = log.includes("[SWARM-INVESTIGATOR]");
            const isPatcher = log.includes("[SWARM-PATCHER]") || log.includes("[SWARM_PATCHER]");
            const isAck = log.includes("[ACK]") || log.includes("Handshake");

            return (
              <div
                key={index}
                className={`leading-relaxed break-all ${
                  isError
                    ? "text-red-400"
                    : isPatcher
                    ? "text-emerald-400"
                    : isInvestigator
                    ? "text-amber-300"
                    : isAck
                    ? "text-emerald-400/90"
                    : "text-zinc-400"
                }`}
              >
                {log}
              </div>
            );
          })}
          <div ref={terminalBottomRef} />
        </div>
      </section>

      {/* 5. In-HUD Hotpatch Code Diff Inspector Modal */}
      {isDiffModalOpen && codeDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/60">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <div className="flex flex-col">
                  <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider">
                    AUTONOMOUS REMEDIATION CODE DIFF
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-500">
                    TARGET: app/database/connection.py
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiffModalOpen(false)}
                className="h-8 px-3 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 text-xs font-mono transition-colors cursor-pointer"
              >
                ✕ CLOSE [ESC]
              </button>
            </div>

            {/* Code Body */}
            <div className="p-4 overflow-y-auto font-mono text-xs text-zinc-300 bg-zinc-950/90 flex-1 leading-relaxed">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-zinc-800 text-[11px] text-zinc-500">
                <span>SYNTHESIZED BY @SWARM-PATCHER (GEMINI-3.5-FLASH)</span>
                <span className="text-emerald-400">STATUS: COMMITTED TO GITHUB</span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-emerald-300/95 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800/80 overflow-x-auto selection:bg-emerald-950 selection:text-emerald-200">
                {codeDiff}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-zinc-800 bg-zinc-950/60">
              <span className="text-[11px] font-mono text-zinc-500">
                VERIFIED BY PYGITHUB ENGINE
              </span>
              <div className="flex items-center gap-3">
                {prUrl && (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-9 px-4 rounded-xl text-xs font-mono border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors flex items-center gap-1.5"
                  >
                    <span>VIEW ON GITHUB ↗</span>
                  </a>
                )}
                {opsStatus === "AWAITING_APPROVAL" && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDiffModalOpen(false);
                      handleApproveDeployment();
                    }}
                    disabled={isApproving}
                    className="h-9 px-4 rounded-xl text-xs font-mono font-medium border border-amber-400 bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                  >
                    <span>APPROVE & DEPLOY →</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
