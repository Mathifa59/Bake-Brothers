import type pg from 'pg'
import { horarioJsonLd, renglonesHorarioWeb } from '@bakebrothers/domain'
import { horariosDeLocales } from './repositories/horariosRepo.js'

/**
 * El horario que muestra la web (renglones de «Nuestros locales») y el JSON-LD de Google, GENERADO desde la tabla por día
 * (`sedes_horarios`): la única fuente. La web es estática (Vercel) y no consulta la API, así que el resultado se guarda en
 * `apps/web/src/config/horarios.generated.json` (con `pnpm --filter @bakebrothers/api horarios:web`) y se publica con el
 * siguiente deploy. Un test compara ese archivo contra la tabla: si el horario cambia y no se regenera, el test falla.
 */
export interface HorariosWeb {
  _aviso: string
  locales: Record<string, { renglones: { dias: string; horas: string }[]; jsonld: ReturnType<typeof horarioJsonLd> }>
}

export const AVISO_ARCHIVO_GENERADO =
  'GENERADO desde la tabla sedes_horarios (única fuente del horario). No se edita a mano: cambia el horario en la tabla y corre `pnpm --filter @bakebrothers/api horarios:web`.'

export async function generarHorariosWeb(client: pg.PoolClient): Promise<HorariosWeb> {
  const locales = await horariosDeLocales(client)
  return {
    _aviso: AVISO_ARCHIVO_GENERADO,
    locales: Object.fromEntries(locales.map((l) => [l.nombre, { renglones: renglonesHorarioWeb(l.horarios), jsonld: horarioJsonLd(l.horarios) }])),
  }
}

/** El texto exacto que se guarda en el archivo (JSON con sangría y salto de línea final). */
export const serializarHorariosWeb = (h: HorariosWeb): string => `${JSON.stringify(h, null, 2)}\n`
