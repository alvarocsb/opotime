"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Sesion {
  tipo: "lectura" | "test" | "descanso";
  segundos: number;
  fecha: string; // YYYY-MM-DD
}

// Full payload sent to the API (includes timestamps when available)
interface SesionPayload extends Sesion {
  inicio_timestamp?: number;
  fin_timestamp?: number;
}

interface EstadoActual {
  modo: "lectura" | "test" | "descanso" | null;
  inicio_timestamp: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const OBJETIVO_NETO_SEMANAL  = 43.07;
const OBJETIVO_BRUTO_SEMANAL = 51.69;
const OBJETIVO_NETO_TOTAL    = 560;
const OBJETIVO_BRUTO_TOTAL   = 672;
const OBJETIVO_LECTURA_PCT   = 0.35;
const OBJETIVO_TEST_PCT      = 0.65;

const LS_ESTADO   = "opotime_estado_actual";
const LS_LEGACY   = "opotime_sesiones";   // old localStorage key — migrate once
const LS_MIGRATED = "opotime_migrated";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateStrFromTs(ts: number): string {
  const d = new Date(ts);
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

// ─── localStorage helpers (solo para estado_actual) ───────────────────────────
function loadEstado(): EstadoActual {
  try {
    const raw = localStorage.getItem(LS_ESTADO);
    return raw ? JSON.parse(raw) : { modo: null, inicio_timestamp: null };
  } catch {
    return { modo: null, inicio_timestamp: null };
  }
}
function saveEstado(e: EstadoActual) {
  localStorage.setItem(LS_ESTADO, JSON.stringify(e));
}

// ─── Supabase API helpers ─────────────────────────────────────────────────────
async function fetchSesiones(): Promise<Sesion[]> {
  const res = await fetch("/api/sesiones-estudio");
  if (!res.ok) throw new Error("Failed to fetch sesiones");
  const { sesiones } = await res.json();
  return sesiones as Sesion[];
}

async function postSesiones(sesiones: SesionPayload[]): Promise<boolean> {
  try {
    const res = await fetch("/api/sesiones-estudio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sesiones),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Metrics computation ──────────────────────────────────────────────────────
interface PeriodMetrics { lectura: number; test: number; descanso: number; }
interface AllMetrics    { today: PeriodMetrics; week: PeriodMetrics; total: PeriodMetrics; }

function computeMetrics(sesiones: Sesion[], estado: EstadoActual, liveSeconds: number): AllMetrics {
  const today  = todayStr();
  const monday = getMondayStr(new Date());

  const liveLectura  = estado.modo === "lectura"  ? liveSeconds : 0;
  const liveTest     = estado.modo === "test"     ? liveSeconds : 0;
  const liveDescanso = estado.modo === "descanso" ? liveSeconds : 0;

  const result: AllMetrics = {
    today: { lectura: liveLectura, test: liveTest, descanso: liveDescanso },
    week:  { lectura: liveLectura, test: liveTest, descanso: liveDescanso },
    total: { lectura: liveLectura, test: liveTest, descanso: liveDescanso },
  };

  for (const s of sesiones) {
    const isToday    = s.fecha === today;
    const isThisWeek = s.fecha >= monday;
    if (s.tipo === "lectura") {
      if (isToday)    result.today.lectura += s.segundos;
      if (isThisWeek) result.week.lectura  += s.segundos;
      result.total.lectura += s.segundos;
    } else if (s.tipo === "test") {
      if (isToday)    result.today.test += s.segundos;
      if (isThisWeek) result.week.test  += s.segundos;
      result.total.test += s.segundos;
    } else {
      if (isToday)    result.today.descanso += s.segundos;
      if (isThisWeek) result.week.descanso  += s.segundos;
      result.total.descanso += s.segundos;
    }
  }
  return result;
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function ratioNetoColor(r: number) { return r >= 0.83 ? "#34C759" : r >= 0.75 ? "#FF9500" : "#FF3B30"; }
function mixColor(r: number, target: number) {
  const d = Math.abs(r - target);
  return d <= 0.05 ? "#34C759" : d <= 0.10 ? "#FF9500" : "#FF3B30";
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ background: "#F2F2F7", borderRadius: 4, height: 4, marginTop: 6 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "#4492F8", borderRadius: 4, transition: "width 0.5s ease" }} />
    </div>
  );
}
function ColorDot({ color }: { color: string }) {
  return <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />;
}

function MetricSection({ title, m, objetivoNeto, objetivoBruto }: {
  title: string; m: PeriodMetrics; objetivoNeto?: number; objetivoBruto?: number;
}) {
  const neto  = m.lectura + m.test;
  const bruto = neto + m.descanso;
  const ratioNeto    = bruto > 0 ? neto / bruto : 0;
  const lecturaRatio = neto  > 0 ? m.lectura / neto : 0;
  const testRatio    = neto  > 0 ? m.test    / neto : 0;

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid #F2F2F7", padding: "16px 20px", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#8E8E93", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>

      {/* Neto / Bruto / Ratio */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Neto</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDecimalH(neto)}</div>
          {objetivoNeto !== undefined && (<>
            <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>/ {objetivoNeto.toFixed(2).replace(".", ",")} h</div>
            <ProgressBar value={neto / 3600} max={objetivoNeto} />
          </>)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Bruto</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDecimalH(bruto)}</div>
          {objetivoBruto !== undefined && (<>
            <div style={{ fontSize: 11, color: "#8E8E93", marginTop: 2 }}>/ {objetivoBruto.toFixed(2).replace(".", ",")} h</div>
            <ProgressBar value={bruto / 3600} max={objetivoBruto} />
          </>)}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Ratio</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <ColorDot color={ratioNetoColor(ratioNeto)} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>{ratioNeto.toFixed(2).replace(".", ",")}</span>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "#F2F2F7", marginBottom: 12 }} />

      {/* Lectura / Test */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Lectura <span style={{ color: "#C7C7CC" }}>(obj. 35%)</span></div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{formatDecimalH(m.lectura)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <ColorDot color={neto > 0 ? mixColor(lecturaRatio, OBJETIVO_LECTURA_PCT) : "#C7C7CC"} />
            <span style={{ fontSize: 13, color: "#555" }}>{(lecturaRatio * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>Test <span style={{ color: "#C7C7CC" }}>(obj. 65%)</span></div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{formatDecimalH(m.test)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <ColorDot color={neto > 0 ? mixColor(testRatio, OBJETIVO_TEST_PCT) : "#C7C7CC"} />
            <span style={{ fontSize: 13, color: "#555" }}>{(testRatio * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OpoTime() {
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [estado, setEstado]     = useState<EstadoActual>({ modo: null, inicio_timestamp: null });
  const [loading, setLoading]   = useState(true);
  const [saveError, setSaveError] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Tick to force re-renders; liveSeconds computed directly in render
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const liveSeconds = (estado.modo && estado.inicio_timestamp)
    ? Math.floor((Date.now() - estado.inicio_timestamp) / 1000)
    : 0;

  // ── Init: load from Supabase + migrate from localStorage ──────────────────
  useEffect(() => {
    async function init() {
      // Load estado_actual from localStorage (ephemeral, not in Supabase)
      setEstado(loadEstado());

      try {
        // 1. Fetch historical sessions from Supabase
        const remote = await fetchSesiones();

        // 2. One-time migration from old localStorage sessions
        const alreadyMigrated = localStorage.getItem(LS_MIGRATED);
        const legacyRaw       = localStorage.getItem(LS_LEGACY);

        if (!alreadyMigrated && legacyRaw) {
          try {
            const legacy: SesionPayload[] = JSON.parse(legacyRaw);
            const valid = legacy.filter(s =>
              ["lectura", "test", "descanso"].includes(s.tipo) && s.segundos > 0
            );
            if (valid.length > 0) {
              await postSesiones(valid);
              // Add them to local state immediately (optimistic)
              setSesiones([...remote, ...valid]);
            } else {
              setSesiones(remote);
            }
          } catch {
            setSesiones(remote);
          }
          // Mark migration done regardless (avoid infinite retries)
          localStorage.setItem(LS_MIGRATED, "1");
          localStorage.removeItem(LS_LEGACY);
        } else {
          setSesiones(remote);
        }
      } catch (err) {
        console.error("Failed to load sessions from Supabase:", err);
        // Fallback: try legacy localStorage so the app still works offline
        try {
          const legacyRaw = localStorage.getItem(LS_LEGACY);
          if (legacyRaw) setSesiones(JSON.parse(legacyRaw));
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []); // run once on mount

  // ── Wake Lock ──────────────────────────────────────────────────────────────
  const acquireWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try { wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch { /* ignore */ }
    }
  }, []);
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try { await wakeLockRef.current.release(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (estado.modo) acquireWakeLock(); else releaseWakeLock();
  }, [estado.modo, acquireWakeLock, releaseWakeLock]);

  useEffect(() => {
    const fn = () => { if (document.visibilityState === "visible" && estado.modo) acquireWakeLock(); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [estado.modo, acquireWakeLock]);

  // ── Day-boundary check (robust: fires on every tick, not just at midnight) ──
  useEffect(() => {
    const checkDayBoundary = async () => {
      if (!estado.modo || !estado.inicio_timestamp) return;
      const startDate   = dateStrFromTs(estado.inicio_timestamp);
      const currentDate = todayStr();
      if (startDate === currentDate) return;

      // Day has changed — close current session attributed to its start date
      const finTs = Date.now();
      const secs  = Math.floor((finTs - estado.inicio_timestamp) / 1000);
      if (secs > 0) {
        const sesion: SesionPayload = {
          tipo:              estado.modo,
          fecha:             startDate,
          segundos:          secs,
          inicio_timestamp:  estado.inicio_timestamp,
          fin_timestamp:     finTs,
        };
        setSesiones(prev => [...prev, sesion]);
        const ok = await postSesiones([sesion]);
        if (!ok) setSaveError(true);
      }
      const cleared: EstadoActual = { modo: null, inicio_timestamp: null };
      saveEstado(cleared);
      setEstado(cleared);
    };

    checkDayBoundary();
    const id = setInterval(checkDayBoundary, 5000);
    return () => clearInterval(id);
  }, [estado]); // sesiones not needed — uses functional update

  // ── Core action: close current session, transition to new estado ───────────
  // Extracts the current live session as a payload (null if < 1 s)
  function extractCurrentSesion(): SesionPayload | null {
    if (!estado.modo || !estado.inicio_timestamp) return null;
    const finTs = Date.now();
    const secs  = Math.floor((finTs - estado.inicio_timestamp) / 1000);
    if (secs <= 0) return null;
    return {
      tipo:             estado.modo,
      fecha:            dateStrFromTs(estado.inicio_timestamp),
      segundos:         secs,
      inicio_timestamp: estado.inicio_timestamp,
      fin_timestamp:    finTs,
    };
  }

  async function transitionTo(newEstado: EstadoActual) {
    const sesion = extractCurrentSesion();

    // 1. Update local state immediately (optimistic — UI never stalls)
    if (sesion) setSesiones(prev => [...prev, sesion]);
    saveEstado(newEstado);
    setEstado(newEstado);
    setSaveError(false);

    // 2. Persist to Supabase in the background
    if (sesion) {
      const ok = await postSesiones([sesion]);
      if (!ok) setSaveError(true);
    }
  }

  const handleLectura  = () => transitionTo({ modo: "lectura",  inicio_timestamp: Date.now() });
  const handleTest     = () => transitionTo({ modo: "test",     inicio_timestamp: Date.now() });
  const handleDescanso = () => transitionTo({ modo: "descanso", inicio_timestamp: Date.now() });
  const handlePausa    = () => transitionTo({ modo: null, inicio_timestamp: null });
  const handleFinalizar = () => transitionTo({ modo: null, inicio_timestamp: null });

  // ── Derived ──
  const metrics = computeMetrics(sesiones, estado, liveSeconds);

  const timerColor =
    estado.modo === "lectura"  ? "#34C759" :
    estado.modo === "test"     ? "#1A7A35" :
    estado.modo === "descanso" ? "#FF9500" :
    "#C7C7CC";

  const statusLabel =
    estado.modo === "lectura"  && estado.inicio_timestamp ? `Leyendo desde las ${formatHora(estado.inicio_timestamp)}` :
    estado.modo === "test"     && estado.inicio_timestamp ? `Test desde las ${formatHora(estado.inicio_timestamp)}` :
    estado.modo === "descanso" && estado.inicio_timestamp ? `Descansando desde las ${formatHora(estado.inicio_timestamp)}` :
    "";

  const btnLectura  = estado.modo === "lectura";
  const btnTest     = estado.modo === "test";
  const btnDescanso = estado.modo === "descanso";
  const btnPausa    = estado.modo === null;

  return (
    <div style={{ minHeight: "100dvh", background: "#FFFFFF", paddingBottom: 40, maxWidth: 480, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ padding: "52px 24px 8px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>OpoTime</h1>
        <p style={{ fontSize: 15, color: "#8E8E93", marginTop: 2 }}>Cronómetro de estudio</p>
      </div>

      {/* Status / error line */}
      <div style={{ height: 28, padding: "0 24px", display: "flex", alignItems: "center" }}>
        {saveError ? (
          <span style={{ fontSize: 12, color: "#FF3B30" }}>⚠ Error al guardar — reintenta en breve</span>
        ) : statusLabel ? (
          <span style={{ fontSize: 13, color: "#8E8E93" }}>{statusLabel}</span>
        ) : null}
      </div>

      {/* Timer */}
      <div style={{ background: "#FFFFFF", borderRadius: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid #F2F2F7", margin: "0 16px 16px", padding: "28px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 64, fontWeight: 300, letterSpacing: 2, color: timerColor, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {formatHHMMSS(liveSeconds)}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ padding: "0 16px", marginBottom: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <button onClick={handleLectura} style={{ background: btnLectura ? "#34C759" : "#E8F8EC", color: btnLectura ? "#FFF" : "#34C759", border: "none", borderRadius: 14, padding: "13px 4px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Lectura
          </button>
          <button onClick={handleTest} style={{ background: btnTest ? "#1A7A35" : "#D6EFE0", color: btnTest ? "#FFF" : "#1A7A35", border: "none", borderRadius: 14, padding: "13px 4px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Test
          </button>
          <button onClick={handleDescanso} style={{ background: btnDescanso ? "#FF9500" : "#FFF3E0", color: btnDescanso ? "#FFF" : "#FF9500", border: "none", borderRadius: 14, padding: "13px 4px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Descanso
          </button>
          <button onClick={handlePausa} style={{ background: btnPausa ? "#8E8E93" : "#F2F2F7", color: btnPausa ? "#FFF" : "#8E8E93", border: "none", borderRadius: 14, padding: "13px 4px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Pausa
          </button>
        </div>
        <div style={{ textAlign: "center" }}>
          <button onClick={handleFinalizar} style={{ background: "transparent", color: "#8E8E93", border: "1px solid #E5E5EA", borderRadius: 10, padding: "8px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Finalizar día
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: "8px 16px 0" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#8E8E93", fontSize: 14 }}>
            Cargando datos…
          </div>
        ) : (
          <>
            <MetricSection title="Hoy" m={metrics.today} />
            <MetricSection title="Esta semana" m={metrics.week} objetivoNeto={OBJETIVO_NETO_SEMANAL} objetivoBruto={OBJETIVO_BRUTO_SEMANAL} />
            <MetricSection title="Total histórico" m={metrics.total} objetivoNeto={OBJETIVO_NETO_TOTAL} objetivoBruto={OBJETIVO_BRUTO_TOTAL} />
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 24px 0", textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "#C7C7CC", lineHeight: 1.5 }}>
          Objetivo: 35% lectura y 65% test.
          <br />
          Plan: 560 h netas totales (43,07 h netas semanales).
        </p>
      </div>
    </div>
  );
}
