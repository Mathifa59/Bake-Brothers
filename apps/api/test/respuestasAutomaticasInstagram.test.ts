// Respuestas automáticas de Instagram (0052): comentario con palabra clave → respuesta pública + DM con link corto a
// WhatsApp. Meta se simula con un fetch falso (nunca se llama a la API real); la base es la de pruebas.
//   - lectura del payload real de Meta (campo «comments»), sin base;
//   - un comentario se atiende una sola vez, la misma persona no recibe dos DMs de la misma campaña en 24 h,
//     un error de Meta queda registrado (comentario y conexión) sin romper nada;
//   - el webhook responde 200 y atiende el comentario después;
//   - el link corto cuenta el clic y redirige a WhatsApp con la referencia;
//   - RLS: solo dirección ve reglas y resultados, y nadie del panel lee el token.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { buildApp } from '../src/app.js'
import { parsearComentariosInstagram } from '../src/bot/instagram.js'
import { procesarComentarioInstagram } from '../src/services/respuestasAutomaticas.js'
import { cifrarTokenWhatsApp } from '../src/bot/tokensWhatsApp.js'
import { DATABASE_URL_PLACEHOLDER } from './testEnv.js'

const hayBaseDeDatosReal = !!process.env.DATABASE_URL && process.env.DATABASE_URL !== DATABASE_URL_PLACEHOLDER

const IG = `1784${Date.now()}`
const PAGE = `PAGE_${Date.now()}`

function payloadComentario(
  comentarioId: string,
  texto: string,
  autor = { id: 'USR_1', username: 'cliente_uno' },
  cuenta = IG,
  time = Math.floor(Date.now() / 1000)
) {
  return {
    object: 'instagram',
    entry: [
      {
        id: cuenta,
        time,
        changes: [
          {
            field: 'comments',
            value: { from: autor, media: { id: 'MEDIA_1', media_product_type: 'REELS' }, id: comentarioId, text: texto },
          },
        ],
      },
    ],
  }
}

describe('parsearComentariosInstagram (sin base)', () => {
  it('lee el comentario con autor, texto, publicación y fecha (entry.time en segundos o milisegundos)', () => {
    expect(parsearComentariosInstagram(payloadComentario('C1', 'ALFAJOR 😍', undefined, IG, 1794600000))).toEqual([
      {
        igUserId: IG,
        comentarioId: 'C1',
        texto: 'ALFAJOR 😍',
        autorId: 'USR_1',
        autorUsuario: 'cliente_uno',
        mediaId: 'MEDIA_1',
        comentadoEn: new Date(1794600000 * 1000),
      },
    ])
    const [enMs] = parsearComentariosInstagram(payloadComentario('C1', 'x', undefined, IG, 1794600000123))
    expect(enMs.comentadoEn).toEqual(new Date(1794600000123))
  })

  it('ignora los comentarios de la propia cuenta (sus respuestas públicas también llegan como comments)', () => {
    expect(parsearComentariosInstagram(payloadComentario('C2', 'alfajor', { id: IG, username: 'bakebrothers.pe' }))).toEqual([])
  })

  it('ignora lo que no es un comentario: mensajes, otros campos, otros objetos o basura', () => {
    expect(parsearComentariosInstagram({ object: 'instagram', entry: [{ id: IG, messaging: [{ message: { text: 'alfajor' } }] }] })).toEqual([])
    expect(parsearComentariosInstagram({ object: 'instagram', entry: [{ id: IG, changes: [{ field: 'mentions', value: { id: 'X' } }] }] })).toEqual([])
    expect(parsearComentariosInstagram({ ...payloadComentario('C3', 'alfajor'), object: 'page' })).toEqual([])
    expect(parsearComentariosInstagram(null)).toEqual([])
    expect(parsearComentariosInstagram({ object: 'instagram', entry: 'x' })).toEqual([])
  })
})

describe.skipIf(!hayBaseDeDatosReal)('respuestas automáticas de Instagram (base de pruebas)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const sufijo = String(Date.now()).slice(-6)
  const REF = `ig-alfajortest${sufijo}`
  const REF_SIN_PUBLICA = `ig-empanadatest${sufijo}`
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
  let llamadas: { url: string; cuerpo: Record<string, unknown> }[] = []
  let fallarCon: number | null = null

  beforeAll(async () => {
    await pool.query(
      `insert into instagram_conexion (ig_user_id, usuario, tipo, page_id, token_cifrado) values ($1, 'bakebrothers.pe', 'facebook_login', $2, $3)`,
      [IG, PAGE, cifrarTokenWhatsApp('TOKEN_DE_PRUEBA')]
    )
    await pool.query(
      `insert into respuestas_automaticas (nombre, palabras, respuestas_publicas, mensaje_dm, mensaje_whatsapp, referencia)
       values ('alfajortest', array['alfajortest${sufijo}', 'alfajortest'], array['¡Te escribimos por DM!', 'Revisa tus mensajes'],
               'Nuestros alfajores 🍪', 'Hola, vengo por los alfajores', $1),
              ('empanadatest', array['empanadatest'], '{}', 'Empanadas 🥟', 'Hola, vengo por las empanadas', $2)`,
      [REF, REF_SIN_PUBLICA]
    )
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      llamadas.push({ url, cuerpo: JSON.parse(init.body) })
      if (fallarCon) return new Response(JSON.stringify({ error: { code: 10, message: 'Permiso faltante' } }), { status: fallarCon })
      return new Response(JSON.stringify({ id: 'ok' }), { status: 200 })
    })
  })

  afterEach(() => {
    llamadas = []
    fallarCon = null
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await pool.query(`delete from respuestas_automaticas where referencia in ($1, $2)`, [REF, REF_SIN_PUBLICA])
    await pool.query(`delete from instagram_conexion where ig_user_id = $1`, [IG])
    await pool.end()
  })

  const envio = async (comentarioId: string) =>
    (await pool.query(`select * from respuestas_automaticas_envios where comentario_id = $1`, [comentarioId])).rows[0]

  it('comentario con la palabra clave: respuesta pública + DM al comentario con el link corto', async () => {
    const [c] = parsearComentariosInstagram(payloadComentario(`A${sufijo}`, '¡¡ALFAJORTEST!! 😍'))
    const r = await procesarComentarioInstagram(log, c)
    expect(r.estado).toBe('enviado')
    expect(llamadas).toHaveLength(2)
    expect(llamadas[0].url).toMatch(new RegExp(`/v\\d+\\.\\d+/A${sufijo}/replies$`))
    expect(['¡Te escribimos por DM!', 'Revisa tus mensajes']).toContain(llamadas[0].cuerpo.message)
    expect(llamadas[1].url).toMatch(new RegExp(`graph\\.facebook\\.com/v\\d+\\.\\d+/${PAGE}/messages$`))
    // Respuesta privada, no un DM normal: el destinatario es SOLO el comentario (nunca un id de persona) y el mensaje
    // es solo texto (lo único que admite una respuesta privada).
    expect(llamadas[1].cuerpo).toEqual({ recipient: { comment_id: `A${sufijo}` }, message: { text: expect.any(String) } })
    const texto = (llamadas[1].cuerpo.message as { text: string }).text
    expect(texto.startsWith('Nuestros alfajores 🍪')).toBe(true)
    expect(texto).toContain(`https://www.bakebrothers.pe/w/${REF}`)
    expect(texto).not.toContain('api.bake-brothers.com')
    const fila = await envio(`A${sufijo}`)
    expect(fila).toMatchObject({ estado: 'enviado', dm_ok: true, respuesta_publica_ok: true, autor_usuario: 'cliente_uno' })
  })

  it('el mismo comentario dos veces (Meta reintenta) se atiende una sola vez', async () => {
    const [c] = parsearComentariosInstagram(payloadComentario(`A${sufijo}`, 'alfajortest'))
    expect((await procesarComentarioInstagram(log, c)).estado).toBe('repetido')
    expect(llamadas).toHaveLength(0)
  })

  it('la misma persona comenta otra vez: respuesta pública sí, DM no (24 h)', async () => {
    const [c] = parsearComentariosInstagram(payloadComentario(`B${sufijo}`, 'alfajortest otra vez'))
    const r = await procesarComentarioInstagram(log, c)
    expect(r.estado).toBe('omitido')
    expect(llamadas.map((l) => l.url.split('/').pop())).toEqual(['replies'])
    expect(await envio(`B${sufijo}`)).toMatchObject({ estado: 'omitido', dm_ok: null })
  })

  it('sin respuestas públicas en la regla solo va el DM; sin palabra clave no pasa nada', async () => {
    const [c] = parsearComentariosInstagram(payloadComentario(`C${sufijo}`, 'empanadatest', { id: 'USR_2', username: 'dos' }))
    expect((await procesarComentarioInstagram(log, c)).estado).toBe('enviado')
    expect(llamadas.map((l) => l.url.split('/').pop())).toEqual(['messages'])
    llamadas = []
    const [d] = parsearComentariosInstagram(payloadComentario(`D${sufijo}`, 'qué rico se ve', { id: 'USR_3', username: 'tres' }))
    expect((await procesarComentarioInstagram(log, d)).estado).toBe('sin_regla')
    expect(llamadas).toHaveLength(0)
    expect(await envio(`D${sufijo}`)).toBeUndefined()
  })

  it('un error de Meta queda registrado en el comentario y en la conexión; el siguiente envío limpio lo borra', async () => {
    fallarCon = 400
    const [c] = parsearComentariosInstagram(payloadComentario(`E${sufijo}`, 'alfajortest', { id: 'USR_4', username: 'cuatro' }))
    expect((await procesarComentarioInstagram(log, c)).estado).toBe('error')
    const fila = await envio(`E${sufijo}`)
    expect(fila.estado).toBe('error')
    expect(fila.motivo).toContain('Permiso faltante')
    const con = (await pool.query(`select ultimo_error from instagram_conexion where ig_user_id = $1`, [IG])).rows[0]
    expect(con.ultimo_error).toContain('Permiso faltante')

    fallarCon = null
    const [d] = parsearComentariosInstagram(payloadComentario(`F${sufijo}`, 'alfajortest', { id: 'USR_5', username: 'cinco' }))
    expect((await procesarComentarioInstagram(log, d)).estado).toBe('enviado')
    expect((await pool.query(`select ultimo_error from instagram_conexion where ig_user_id = $1`, [IG])).rows[0].ultimo_error).toBeNull()
  })

  it('un comentario de hace más de 7 días (webhook reintentado tarde): respuesta pública sí, respuesta privada no', async () => {
    const hace8Dias = Math.floor(Date.now() / 1000) - 8 * 24 * 3600
    const [c] = parsearComentariosInstagram(payloadComentario(`V${sufijo}`, 'alfajortest', { id: 'USR_7', username: 'siete' }, IG, hace8Dias))
    expect((await procesarComentarioInstagram(log, c)).estado).toBe('omitido')
    expect(llamadas.map((l) => l.url.split('/').pop())).toEqual(['replies'])
    const fila = await envio(`V${sufijo}`)
    expect(fila).toMatchObject({ estado: 'omitido', dm_ok: null })
    expect(fila.motivo).toContain('7 días')
  })

  it('una cuenta sin conexión no dispara nada', async () => {
    const [c] = parsearComentariosInstagram(payloadComentario(`G${sufijo}`, 'alfajortest', undefined, 'OTRA_CUENTA'))
    expect((await procesarComentarioInstagram(log, c)).estado).toBe('sin_conexion')
    expect(llamadas).toHaveLength(0)
  })

  it('POST /webhook responde 200, guarda el evento crudo y atiende el comentario después', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/webhook',
      payload: payloadComentario(`H${sufijo}`, 'alfajortest', { id: 'USR_6', username: 'seis' }),
    })
    expect(res.statusCode).toBe(200)
    let fila
    for (let i = 0; i < 50 && !(fila = await envio(`H${sufijo}`))?.estado?.match(/enviado|error|parcial/); i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(fila?.estado).toBe('enviado')
    const crudo = await pool.query(`select 1 from eventos_meta_sin_procesar where payload->'entry'->0->>'id' = $1`, [IG])
    expect(crudo.rowCount).toBeGreaterThan(0)
    await pool.query(`delete from eventos_meta_sin_procesar where payload->'entry'->0->>'id' = $1`, [IG])
    await app.close()
  })

  it('GET /w/:referencia cuenta el clic y redirige a WhatsApp con el mensaje y la referencia', async () => {
    const app = await buildApp()
    const antes = (await pool.query(`select clics from respuestas_automaticas where referencia = $1`, [REF])).rows[0].clics
    const res = await app.inject({ method: 'GET', url: `/w/${REF}` })
    expect(res.statusCode).toBe(302)
    expect(res.headers['cache-control']).toBe('no-store')
    const destino = new URL(res.headers.location as string)
    expect(destino.host).toBe('wa.me')
    expect(destino.searchParams.get('text')).toBe(`Hola, vengo por los alfajores (ref: ${REF})`)
    const despues = (await pool.query(`select clics from respuestas_automaticas where referencia = $1`, [REF])).rows[0].clics
    expect(despues).toBe(antes + 1)

    const otra = await app.inject({ method: 'GET', url: '/w/no-existe-esta' })
    expect(otra.statusCode).toBe(302)
    expect(new URL(otra.headers.location as string).searchParams.get('text')).toBe('Hola Bake Brothers 👋')
    await app.close()
  })

  describe('RLS: solo dirección, y nadie del panel lee el token', () => {
    const ADMIN = '55555555-0000-0000-0000-000000000001'
    const EMP = '55555555-0000-0000-0000-000000000002'
    let client: pg.PoolClient

    beforeAll(async () => {
      client = await pool.connect()
    })
    afterAll(() => client.release())

    async function como<T>(uid: string, fn: () => Promise<T>): Promise<T | { error: string }> {
      await client.query('savepoint s')
      try {
        await client.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [
          JSON.stringify({ sub: uid, role: 'authenticated' }),
          uid,
        ])
        await client.query('set local role authenticated')
        const r = await fn()
        await client.query('reset role')
        await client.query('release savepoint s')
        return r
      } catch (e) {
        await client.query('rollback to savepoint s')
        await client.query('reset role')
        return { error: (e as { code?: string }).code ?? String(e) }
      }
    }

    it('admin ve reglas, resultados y el estado de la conexión; empleado no ve nada; el token no se concede a nadie', async () => {
      await client.query('begin')
      try {
        const sede = (await client.query(`insert into sedes (nombre) values ('RA Sede') returning id`)).rows[0].id
        await client.query(`insert into auth.users (id) values ($1), ($2)`, [ADMIN, EMP])
        await client.query(`insert into usuarios_dashboard (id, rol, sede_id) values ($1, 'admin', null), ($2, 'operador', $3)`, [ADMIN, EMP, sede])
        const tenantId = (await client.query(`select id from tenants where slug = 'bake-brothers'`)).rows[0].id
        const cliente = (
          await client.query(`insert into customers (tenant_id, nombre, telefono) values ($1, 'RA Cliente', '+51900000555') returning id`, [tenantId])
        ).rows[0].id
        await client.query(
          `insert into orders (tenant_id, numero, customer_id, canal, estado, tipo_entrega, sede_id, fecha_entrega, horario_entrega, metodo_pago, subtotal, total, campana)
           values ($1, 'RA-1', $2, 'whatsapp', 'confirmed', 'tienda', $3, current_date + 3, '4pm', 'yape', 25, 25, $4)`,
          [tenantId, cliente, sede, REF]
        )

        const reglasAdmin = await como(ADMIN, async () => (await client.query(`select referencia from respuestas_automaticas where referencia = $1`, [REF])).rows)
        expect(reglasAdmin).toEqual([{ referencia: REF }])
        const resumen = (await como(ADMIN, async () =>
          (await client.query(`select * from respuestas_automaticas_resumen() r join respuestas_automaticas a on a.id = r.regla_id where a.referencia = $1`, [REF])).rows
        )) as Record<string, unknown>[]
        expect(Number(resumen[0].pedidos)).toBe(1)
        expect(Number(resumen[0].ingresos)).toBe(25)
        expect(Number(resumen[0].dms)).toBeGreaterThanOrEqual(2)
        const conexion = await como(ADMIN, async () => (await client.query(`select usuario, activa from instagram_conexion where ig_user_id = $1`, [IG])).rows)
        expect(conexion).toEqual([{ usuario: 'bakebrothers.pe', activa: true }])
        expect(await como(ADMIN, async () => (await client.query(`select token_cifrado from instagram_conexion`)).rows)).toEqual({ error: '42501' })
        const enviosAdmin = (await como(ADMIN, async () => (await client.query(`select count(*)::int as n from respuestas_automaticas_envios`)).rows)) as { n: number }[]
        expect(enviosAdmin[0].n).toBeGreaterThan(0)

        expect(await como(EMP, async () => (await client.query(`select * from respuestas_automaticas`)).rows)).toEqual([])
        expect(await como(EMP, async () => (await client.query(`select * from respuestas_automaticas_envios`)).rows)).toEqual([])
        expect(await como(EMP, async () => (await client.query(`select usuario from instagram_conexion`)).rows)).toEqual([])
        expect(await como(EMP, async () => (await client.query(`select * from respuestas_automaticas_resumen()`)).rows)).toEqual({ error: '42501' })
        expect(
          await como(EMP, async () =>
            (await client.query(`insert into respuestas_automaticas (nombre, palabras, mensaje_dm, mensaje_whatsapp, referencia) values ('x', array['x'], 'x', 'x', 'ig-x-emp') returning id`)).rows
          )
        ).toEqual({ error: '42501' })
        const creada = await como(ADMIN, async () =>
          (await client.query(`insert into respuestas_automaticas (nombre, palabras, mensaje_dm, mensaje_whatsapp, referencia) values ('x', array['x'], 'x', 'x', 'ig-x-admin') returning referencia`)).rows
        )
        expect(creada).toEqual([{ referencia: 'ig-x-admin' }])
      } finally {
        await client.query('rollback')
      }
    })
  })
})
