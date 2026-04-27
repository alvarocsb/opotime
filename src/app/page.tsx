"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Sesion {
  fecha: string; // YYYY-MM-DD
  tipo: "lectura" | "test" | "descanso";
  segundos: number;
}

interface EstadoActual {
  modo: "lectura" | "test" | "descanso" | null;
  inicio_timestamp: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const OBJETIVO_NETO_SEMANAL = 43.07;
const OBJETIVO_BRUTO_SEMANAL = 51.69;
const OBJETIVO_NETO_TOTAL = 560;
const OBJETIVO_BRUTO_TOTAL = 672;
const OBJETIVO_LECTURA_PCT = 0.35;
const OBJETIVO_TEST_PCT = 0.65;

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
interface PeriodMetrics {
  lectura: number;
  test: number;
  descanso: number;
}

interface AllMetrics {
  today: PeriodMetrics;
  week: PeriodMetrics;
  total: PeriodMetrics;
}

function computeMetrics(
  sesiones: Sesion[],
  estado: EstadoActual,
  liveSeconds: number
): AllMetrics {
  const today = todayStr();
  const monday = getMondayStr(new Date());

  const liveLectura = estado.modo === "lectura" ? liveSeconds : 0;
  const liveTest = estado.modo === "test" ? liveSeconds : 0;
  const liveDescanso = estado.modo === "descanso" ? liveSeconds : 0;

  const acc = (base: PeriodMetrics): PeriodMetrics => ({
    lectura: base.lectura,
    test: base.test,
    descanso: base.descanso,
  });

  const result: AllMetrics = {
    today: { lectura: liveLectura, test: liveTest, descanso: liveDescanso },
    week: { lectura: liveLectura, test: liveTest, descanso: liveDescanso },
    total: { lectura: liveLectura, test: liveTest, descanso: liveDescanso },
  };

  void acc; // suppress unused

  for (const s of sesiones) {
    const isToday = s.fecha === today;
    const isThisWeek = s.fecha >= monday;

    if (s.tipo === "lectura") {
      if (isToday) result.today.lectura += s.segundos;
      if (isThisWeek) result.week.lectura += s.segundos;
      result.total.lectura += s.segundos;
    } else if (s.tipo === "test") {
      if (isToday) result.today.test += s.segundos;
      if (isThisWeek) result.week.test += s.segundos;
      result.total.test += s.segundos;
    } else {
      // descanso
      if (isToday) result.today.descanso += s.segundos;
      if (isThisWeek) result.week.descanso += s.segundos;
      result.total.descanso += s.segundos;
    }
  }

  return result;
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function ratioNetoColor(ratio: number): string {
  if (ratio >= 0.83) return "#34C759";
  if (ratio >= 0.75) return "#FF9500";
  return "#FF3B30";
}

function mixColor(ratio: number, target: number): string {
  const diff = Math.abs(ratio - target);
  if (diff <= 0.05) return "#34C759"; // ±5% — verde
  if (diff <= 0.10) return "#FF9500"; // ±10% — amarillo
  return "#FF3B30";                   // fuera — rojo
}

// ─── Sub-components ───────────────────────────────────────────────────────────
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

function ColorDot({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 9,
        height: 9,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

function MetricSection({
  title,
  m,
  objetivoNeto,
  objetivoBruto,
}: {
  title: string;
  m: PeriodMetrics;
  objetivoNeto?: number;
  objetivoBruto?: number;
}) {
  const neto = m.lectura + m.test;
  const bruto = neto + m.descanso;
  const ratioNeto = bruto > 0 ? neto / bruto : 0;

  const lecturaRatio = neto > 0 ? m.lectura / neto : 0;
  const testRatio = neto > 0 ? m.test / neto : 0;

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
      {/* Title */}
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

      {/* Row 1: Neto / Bruto / Ratio */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <ColorDot color={ratioNetoColor(ratioNeto)} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>
              {ratioNeto.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#F2F2F7", marginBottom: 12 }} />

      {/* Row 2: Lectura / Test breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {/* Lectura */}
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>
            Lectura{" "}
            <span style={{ color: "#C7C7CC" }}>(obj. 35%)</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{formatDecimalH(m.lectura)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <ColorDot color={neto > 0 ? mixColor(lecturaRatio, OBJETIVO_LECTURA_PCT) : "#C7C7CC"} />
            <span style={{ fontSize: 13, color: "#555" }}>
              {(lecturaRatio * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        {/* Test */}
        <div>
          <div style={{ fontSize: 11, color: "#8E8E93", marginBottom: 4 }}>
            Test{" "}
            <span style={{ color: "#C7C7CC" }}>(obj. 65%)</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{formatDecimalH(m.test)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <ColorDot color={neto > 0 ? mixColor(testRatio, OBJETIVO_TEST_PCT) : "#C7C7CC"} />
            <span style={{ fontSize: 13, color: "#555" }}>
              {(testRatio * 100).toFixed(0)}%
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

  useEffect(() => {
    setSesiones(loadSesiones());
    setEstado(loadEstado());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  // Midnight reset
  useEffect(() => {
    const check = () => {
      const d = new Date();
      if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() < 5) {
        if (estado.modo && estado.inicio_timestamp) {
          const secs = Math.floor((Date.now() - estado.inicio_timestamp) / 1000);
          if (secs > 0) {
            const y = new Date(); y.setDate(y.getDate() - 1);
            const yStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
            const updated = [...sesiones, { fecha: yStr, tipo: estado.modo, segundos: secs }];
            saveSesiones(updated); setSesiones(updated);
          }
          const e: EstadoActual = { modo: null, inicio_timestamp: null };
          saveEstado(e); setEstado(e);
        }
      }
    };
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [estado, sesiones]);

  // ── Actions ──
  function stopCurrentAndGet(base: Sesion[]): Sesion[] {
    if (estado.modo && estado.inicio_timestamp) {
      const secs = Math.floor((Date.now() - estado.inicio_timestamp) / 1000);
      if (secs > 0) return [...base, { fecha: todayStr(), tipo: estado.modo, segundos: secs }];
    }
    return base;
  }

  function apply(newEstado: EstadoActual, newSesiones: Sesion[]) {
    saveSesiones(newSesiones); saveEstado(newEstado);
    setSesiones(newSesiones); setEstado(newEstado);
  }

  const handleLectura = () => apply({ modo: "lectura", inicio_timestamp: Date.now() }, stopCurrentAndGet([...sesiones]));
  const handleTest    = () => apply({ modo: "test",    inicio_timestamp: Date.now() }, stopCurrentAndGet([...sesiones]));
  const handleDescanso = () => apply({ modo: "descanso", inicio_timestamp: Date.now() }, stopCurrentAndGet([...sesiones]));
  const handlePausa   = () => apply({ modo: null, inicio_timestamp: null }, stopCurrentAndGet([...sesiones]));
  const handleFinalizar = () => apply({ modo: null, inicio_timestamp: null }, stopCurrentAndGet([...sesiones]));

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

  // Button active helpers
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

      {/* Status line */}
      <div style={{ height: 28, padding: "0 24px", display: "flex", alignItems: "center" }}>
        {statusLabel && <span style={{ fontSize: 13, color: "#8E8E93" }}>{statusLabel}</span>}
      </div>

      {/* Timer */}
      <div style={{
        background: "#FFFFFF", borderRadius: 20,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid #F2F2F7",
        margin: "0 16px 16px", padding: "28px 24px", textAlign: "center",
      }}>
        <div style={{
          fontSize: 64, fontWeight: 300, letterSpacing: 2,
          color: timerColor, fontVariantNumeric: "tabular-nums", lineHeight: 1,
        }}>
          {formatHHMMSS(liveSeconds)}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ padding: "0 16px", marginBottom: 8 }}>
        {/* Row 1: Lectura / Test / Descanso / Pausa */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <button onClick={handleLectura} style={{
            background: btnLectura ? "#34C759" : "#E8F8EC",
            color: btnLectura ? "#FFFFFF" : "#34C759",
            border: "none", borderRadius: 14, padding: "13px 4px",
            fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Lectura
          </button>
          <button onClick={handleTest} style={{
            background: btnTest ? "#1A7A35" : "#D6EFE0",
            color: btnTest ? "#FFFFFF" : "#1A7A35",
            border: "none", borderRadius: 14, padding: "13px 4px",
            fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Test
          </button>
          <button onClick={handleDescanso} style={{
            background: btnDescanso ? "#FF9500" : "#FFF3E0",
            color: btnDescanso ? "#FFFFFF" : "#FF9500",
            border: "none", borderRadius: 14, padding: "13px 4px",
            fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Descanso
          </button>
          <button onClick={handlePausa} style={{
            background: btnPausa ? "#8E8E93" : "#F2F2F7",
            color: btnPausa ? "#FFFFFF" : "#8E8E93",
            border: "none", borderRadius: 14, padding: "13px 4px",
            fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Pausa
          </button>
        </div>
        {/* Row 2: Finalizar día */}
        <div style={{ textAlign: "center" }}>
          <button onClick={handleFinalizar} style={{
            background: "transparent", color: "#8E8E93",
            border: "1px solid #E5E5EA", borderRadius: 10,
            padding: "8px 20px", fontSize: 13, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Finalizar día
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ padding: "8px 16px 0" }}>
        <MetricSection title="Hoy" m={metrics.today} />
        <MetricSection
          title="Esta semana"
          m={metrics.week}
          objetivoNeto={OBJETIVO_NETO_SEMANAL}
          objetivoBruto={OBJETIVO_BRUTO_SEMANAL}
        />
        <MetricSection
          title="Total histórico"
          m={metrics.total}
          objetivoNeto={OBJETIVO_NETO_TOTAL}
          objetivoBruto={OBJETIVO_BRUTO_TOTAL}
        />
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
