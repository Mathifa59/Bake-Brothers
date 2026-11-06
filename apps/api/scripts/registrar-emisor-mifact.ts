/**
 * Carga RUC, series y/o token de Mifact del emisor de una sede (tabla `emisores_mifact`, 0037). Cada sede factura
 * con su propia razón social: Cedros → Corporación Hermanos Loarte S.A.C.; Santa Marina → BAKER BROTHERS E.I.R.L.
 * (las razones sociales ya vienen cargadas por la migración; esto completa lo que faltaba).
 *
 * El token va por variable de entorno, NO por argumento: no queda en el historial del shell ni en la lista de
 * procesos. Se guarda cifrado (misma clave AES que los tokens de WhatsApp, WHATSAPP_TOKEN_ENCRYPTION_KEY).
 * Un dato que no se pasa no se toca. Desde apps/api, con DATABASE_URL y WHATSAPP_TOKEN_ENCRYPTION_KEY en .env:
 *
 *   MIFACT_TOKEN_A_REGISTRAR=<token> pnpm mifact:emisor -- --sede Cedros --ruc 20XXXXXXXXX --serie-boleta B001 --serie-factura F001
 */
import { parseArgs } from 'node:util'
import { pool } from '../src/db.js'
import { guardarCredencialesEmisor } from '../src/repositories/emisoresMifactRepo.js'

const { values } = parseArgs({
  options: {
    sede: { type: 'string' },
    ruc: { type: 'string' },
    'serie-boleta': { type: 'string' },
    'serie-factura': { type: 'string' },
  },
})

const token = process.env.MIFACT_TOKEN_A_REGISTRAR
if (!values.sede || (!values.ruc && !values['serie-boleta'] && !values['serie-factura'] && !token)) {
  console.error('Uso: --sede <uuid o nombre exacto> y al menos uno de --ruc, --serie-boleta, --serie-factura o la variable MIFACT_TOKEN_A_REGISTRAR.')
  process.exit(1)
}

try {
  const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.sede)
  const { rows } = await pool.query(
    esUuid ? `select id, nombre from sedes where id = $1` : `select id, nombre from sedes where nombre = $1`,
    [values.sede]
  )
  if (rows.length !== 1) throw new Error(`No encontré exactamente una sede para "${values.sede}" (encontradas: ${rows.length})`)

  const emisor = await guardarCredencialesEmisor(pool, rows[0].id, {
    ruc: values.ruc,
    serieBoleta: values['serie-boleta'],
    serieFactura: values['serie-factura'],
    token,
  })
  console.log(
    `OK — ${rows[0].nombre}: ${emisor.razonSocial} · RUC ${emisor.ruc ?? '(falta)'} · boleta ${emisor.serieBoleta ?? '(falta)'} · factura ${emisor.serieFactura ?? '(falta)'} · token ${emisor.tieneToken ? 'cargado' : '(falta)'}`
  )
} catch (err) {
  console.error('No se guardó:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await pool.end()
}
