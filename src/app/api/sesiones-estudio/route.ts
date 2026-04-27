import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ─── GET: devuelve todas las sesiones ────────────────────────────────────────
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('sesiones_estudio')
    .select('tipo, segundos, fecha')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching sesiones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sesiones: data ?? [] })
}

// ─── POST: guarda una o varias sesiones ──────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Acepta un objeto único o un array (para la migración desde localStorage)
    const lista = Array.isArray(body) ? body : [body]

    // Solo tipos válidos; descarta residuos del tipo 'estudio' anterior
    const TIPOS_VALIDOS = new Set(['lectura', 'test', 'descanso'])
    const rows = lista
      .filter((s) => TIPOS_VALIDOS.has(s.tipo) && s.segundos > 0 && s.fecha)
      .map((s) => ({
        tipo:              s.tipo,
        segundos:          s.segundos,
        fecha:             s.fecha,
        inicio_timestamp:  s.inicio_timestamp ?? null,
        fin_timestamp:     s.fin_timestamp    ?? null,
      }))

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 })
    }

    const { error } = await supabaseAdmin
      .from('sesiones_estudio')
      .insert(rows)

    if (error) {
      console.error('Error inserting sesiones:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, inserted: rows.length })
  } catch (err) {
    console.error('Unexpected error in POST /api/sesiones-estudio:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
