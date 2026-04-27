"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Sesion {
  fecha: string; // ISO date string YYYY-MM-DD
  tipo: "estudio" | "descanso";
  segundos: number;
}

interface EstadoActual {
  modo: "estudio" | "descanso" | null;
  inicio_timestamp: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const OBJETIVO_NETO_SEMANAL = 43.07;
const OBJETIVO_BRUTO_SEMANAL = 51.69;
const OBJETIVO_NETO_TOTAL = 560;
const OBJETIVO_BRUTO_TOTAL = 672;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMondayStr(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatHHMMSS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDecimalH(seconds: number): string {
  return (seconds / 3600).toFixed(2).replace(".", ",") + " h";
}

function formatHora(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function loadSesiones(): Sesion[] {
  try {
    const raw = localStorage.getItem("opotime_sesiones");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSesiones(sesiones: Sesion[]) {
  localStorage.setItem("opotime_sesiones", JSON.stringify(sesiones));
}

function loadEstado(): EstadoActual {
  try {
    const raw = localStorage.getItem("opotime_estado_actual");
    return raw ? JSON.parse(raw) : { modo: null, inicio_timestamp: null };
  } catch {
    return { modo: null, inicio_timestamp: null };
  }
}

function saveEstado(estado: EstadoActual) {
  localStorage.setItem("opotime_estado_actual", JSON.stringify(estado));
}

// ─── Metrics computation ──────────────────────────────────────────────────────
function computeMetrics(
  sesiones: Sesion[],
  estadoActual: EstadoActual,
  liveSeconds: number
) {
  const today = todayStr();
  const monday = getMondayStr(new Date());

  const liveEstudio = estadoActual.modo === "estudio" ? liveSeconds : 0;
  const liveDescanso = estadoActual.modo === "descanso" ? liveSeconds : 0;

  let todayNeto = liveEstudio;
  let todayBruto = liveEstudio + liveDescanso;
  let weekNeto = liveEstudio;
  let weekBruto = liveEstudio + liveDescanso;
  let totalNeto = liveEstudio;
  let totalBruto = liveEstudio + liveDescanso;

  for (const s of sesiones) {
    const isEstudio = s.tipo === "estudio";
    const isToday = s.fecha === today;
    const isThisWeek = s.fecha >= monday;

    if (isEstudio) {
      if (isToday) todayNeto += s.segundos;
      if (isThisWeek) weekNeto += s.segundos;
      totalNeto += s.segundos;
    }
    if (isToday) todayBruto += s.segundos;
    if (isThisWeek) weekBruto += s.segundos;
    totalBruto += s.segundos;
  }

  return {
    today: { neto: todayNeto, bruto: todayBruto },
    week: { neto: weekNeto, bruto: weekBruto },
    total: { neto: totalNeto, bruto: totalBruto },
  };
}

function ratioColor(ratio: number): string {
  if (ratio >= 0.83) return "#34C759";
  if (ratio >= 0.75) return "#FF9500";
  return "#FF3B30";
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ background: "#F2F2F7", borderRadius: 4, height: 4, marginTop: 6 }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: "#4492F8",
          borderRadius: 4,
          transition: "width 0.5s ease",
        }}
      />
    </div>
  );
}

// ─── Metric Section ───────────────────────────────────────────────────────────
function MetricSection({
  title,
  neto,
  bruto,
  objetivoNeto,
  objetivoBruto,
}: {
  title: string;
  neto: number;
  bruto: number;
  objetivoNeto?: number;
  objetivoBruto?: number;
}) {
  const ratio = bruto > 0 ? neto / bruto : 0;
  const rColor = ratioColor(ratio);

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 20,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        border: "1px solid #F2F2F7",
        padding: "16px 20px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#8E8E93",
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Neto</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDecimalH(neto)}</div>
          {objetivoNeto !== undefined && (
            <>
              <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>
                / {objetivoNeto.toFixed(2).replace(".", ",")} h
              </div>
              <ProgressBar value={neto / 3600} max={objetivoNeto} />
            </>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Bruto</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDecimalH(bruto)}</div>
          {objetivoBruto !== undefined && (
            <>
              <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>
                / {objetivoBruto.toFixed(2).replace(".", ",")} h
              </div>
              <ProgressBar value={bruto / 3600} max={objetivoBruto} />
            </>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Ratio</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: rColor,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {ratio.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OpoTime() {
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [estado, setEstado] = useState<EstadoActual>({ modo: null, inicio_timestamp: null });
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [now, setNow] = useState(Date.now());
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setSesiones(loadSesiones());
    setEstado(loadEstado());
  }, []);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute live seconds
  useEffect(() => {
    if (estado.modo && estado.inicio_timestamp) {
      setLiveSeconds(Math.floor((now - estado.inicio_timestamp) / 1000));
    } else {
      setLiveSeconds(0);
    }
  }, [now, estado]);

  // Wake Lock
  const acquireWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        /* ignore */
      }
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (estado.modo) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [estado.modo, acquireWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && estado.modo) {
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [estado.modo, acquireWakeLock]);

  // Midnight auto-reset
  useEffect(() => {
    const checkMidnight = () => {
      const d = new Date();
      if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() < 5) {
        if (estado.modo && estado.inicio_timestamp) {
          const secs = Math.floor((Date.now() - estado.inicio_timestamp) / 1000);
          if (secs > 0) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
            const updated = [...sesiones, { fecha: yStr, tipo: estado.modo, segundos: secs }];
            saveSesiones(updated);
            setSesiones(updated);
          }
          const newEstado: EstadoActual = { modo: null, inicio_timestamp: null };
          saveEstado(newEstado);
          setEstado(newEstado);
        }
      }
    };
    const id = setInterval(checkMidnight, 5000);
    return () => clearInterval(id);
  }, [estado, sesiones]);

  // ── Actions ──
  function stopCurrentAndGet(base: Sesion[]): Sesion[] {
    if (estado.modo && estado.inicio_timestamp) {
      const secs = Math.floor((Date.now() - estado.inicio_timestamp) / 1000);
      if (secs > 0) {
        return [...base, { fecha: todayStr(), tipo: estado.modo, segundos: secs }];
      }
    }
    return base;
  }

  function applyNewEstado(newEstado: EstadoActual, newSesiones: Sesion[]) {
    saveSesiones(newSesiones);
    saveEstado(newEstado);
    setSesiones(newSesiones);
    setEstado(newEstado);
  }

  function handleEstudio() {
    applyNewEstado(
      { modo: "estudio", inicio_timestamp: Date.now() },
      stopCurrentAndGet([...sesiones])
    );
  }

  function handleDescanso() {
    applyNewEstado(
      { modo: "descanso", inicio_timestamp: Date.now() },
      stopCurrentAndGet([...sesiones])
    );
  }

  function handlePausa() {
    applyNewEstado(
      { modo: null, inicio_timestamp: null },
      stopCurrentAndGet([...sesiones])
    );
  }

  function handleFinalizarDia() {
    applyNewEstado(
      { modo: null, inicio_timestamp: null },
      stopCurrentAndGet([...sesiones])
    );
  }

  // ── Derived ──
  const metrics = computeMetrics(sesiones, estado, liveSeconds);

  const timerColor =
    estado.modo === "estudio"
      ? "#34C759"
      : estado.modo === "descanso"
      ? "#FF9500"
      : "#C7C7CC";

  const statusLabel =
    estado.modo === "estudio" && estado.inicio_timestamp
      ? `Estudiando desde las ${formatHora(estado.inicio_timestamp)}`
      : estado.modo === "descanso" && estado.inicio_timestamp
      ? `Descansando desde las ${formatHora(estado.inicio_timestamp)}`
      : "";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#FFFFFF",
        paddingBottom: 40,
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ padding: "52px 24px 8px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>OpoTime</h1>
        <p style={{ fontSize: 15, color: "#8E8E93", marginTop: 2 }}>Cronómetro de estudio</p>
      </div>

      {/* Status line */}
      <div style={{ height: 28, padding: "0 24px", display: "flex", alignItems: "center" }}>
        {statusLabel && (
          <span style={{ fontSize: 13, color: "#8E8E93" }}>{statusLabel}</span>
        )}
      </div>

      {/* Timer */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 20,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          border: "1px solid #F2F2F7",
          margin: "0 16px 16px",
          padding: "28px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 300,
            letterSpacing: 2,
            color: timerColor,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {formatHHMMSS(liveSeconds)}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ padding: "0 16px", marginBottom: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <button
            onClick={handleEstudio}
            style={{
              background: estado.modo === "estudio" ? "#34C759" : "#E8F8EC",
              color: estado.modo === "estudio" ? "#FFFFFF" : "#34C759",
              border: "none",
              borderRadius: 14,
              padding: "14px 8px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Estudio
          </button>
          <button
            onClick={handleDescanso}
            style={{
              background: estado.modo === "descanso" ? "#FF9500" : "#FFF3E0",
              color: estado.modo === "descanso" ? "#FFFFFF" : "#FF9500",
              border: "none",
              borderRadius: 14,
              padding: "14px 8px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Descanso
          </button>
          <button
            onClick={handlePausa}
            style={{
              background: estado.modo === null ? "#8E8E93" : "#F2F2F7",
              color: estado.modo === null ? "#FFFFFF" : "#8E8E93",
              border: "none",
              borderRadius: 14,
              padding: "14px 8px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Pausa
          </button>
        </div>
        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleFinalizarDia}
            style={{
              background: "transparent",
              color: "#8E8E93",
              border: "1px solid #E5E5EA",
              borderRadius: 10,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Finalizar día
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: "8px 16px 0" }}>
        <MetricSection title="Hoy" neto={metrics.today.neto} bruto={metrics.today.bruto} />
        <MetricSection
          title="Esta semana"
          neto={metrics.week.neto}
          bruto={metrics.week.bruto}
          objetivoNeto={OBJETIVO_NETO_SEMANAL}
          objetivoBruto={OBJETIVO_BRUTO_SEMANAL}
        />
        <MetricSection
          title="Total histórico"
          neto={metrics.total.neto}
          bruto={metrics.total.bruto}
          objetivoNeto={OBJETIVO_NETO_TOTAL}
          objetivoBruto={OBJETIVO_BRUTO_TOTAL}
        />
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 24px 0", textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "#C7C7CC", lineHeight: 1.5 }}>
          Objetivo: ratio neto/bruto de 0,83 (50 min de estudio por cada hora bruta).
          <br />
          Plan: 560 h netas totales (43,07 h netas semanales).
        </p>
      </div>
    </div>
  );
}
