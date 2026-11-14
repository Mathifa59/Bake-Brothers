import type pg from 'pg'

type Db = pg.Pool | pg.PoolClient

export interface ConexionInstagramGuardada {
  id: string
  igUserId: string
  tipo: 'facebook_login' | 'instagram_login'
  pageId: string | null
  tokenCifrado: string
}

export async function conexionInstagramActiva(db: Db, igUserId: string): Promise<ConexionInstagramGuardada | null> {
  const { rows } = await db.query(
    `select id, ig_user_id, tipo, page_id, token_cifrado from instagram_conexion where ig_user_id = $1 and activa`,
    [igUserId]
  )
  const r = rows[0]
  return r ? { id: r.id, igUserId: r.ig_user_id, tipo: r.tipo, pageId: r.page_id, tokenCifrado: r.token_cifrado } : null
}

/** Deja el último error visible en el panel (o lo limpia con null). */
export async function marcarErrorConexionInstagram(db: Db, id: string, error: string | null): Promise<void> {
  await db.query(
    `update instagram_conexion
        set ultimo_error = $2, ultimo_error_en = case when $2::text is null then ultimo_error_en else now() end, actualizado_en = now()
      where id = $1`,
    [id, error]
  )
}

/** Registra la conexión (script instagram:registrar). Una sola cuenta: la misma ig_user_id se actualiza. */
export async function guardarConexionInstagram(
  db: Db,
  datos: { igUserId: string; usuario: string | null; tipo: 'facebook_login' | 'instagram_login'; pageId: string | null; tokenCifrado: string }
): Promise<void> {
  await db.query(
    `insert into instagram_conexion (ig_user_id, usuario, tipo, page_id, token_cifrado, activa)
     values ($1, $2, $3, $4, $5, true)
     on conflict (ig_user_id) do update
       set usuario = excluded.usuario, tipo = excluded.tipo, page_id = excluded.page_id, token_cifrado = excluded.token_cifrado,
           activa = true, ultimo_error = null, actualizado_en = now()`,
    [datos.igUserId, datos.usuario, datos.tipo, datos.pageId, datos.tokenCifrado]
  )
}

export interface ReglaGuardada {
  id: string
  nombre: string
  palabras: string[]
  respuestasPublicas: string[]
  mensajeDm: string
  mensajeWhatsapp: string
  referencia: string
  activa: boolean
}

const aRegla = (r: Record<string, unknown>): ReglaGuardada => ({
  id: r.id as string,
  nombre: r.nombre as string,
  palabras: r.palabras as string[],
  respuestasPublicas: r.respuestas_publicas as string[],
  mensajeDm: r.mensaje_dm as string,
  mensajeWhatsapp: r.mensaje_whatsapp as string,
  referencia: r.referencia as string,
  activa: r.activa as boolean,
})

/** Reglas activas de Instagram, la más antigua primero (si dos coinciden, gana la que existía antes). */
export async function reglasActivasInstagram(db: Db): Promise<ReglaGuardada[]> {
  const { rows } = await db.query(
    `select id, nombre, palabras, respuestas_publicas, mensaje_dm, mensaje_whatsapp, referencia, activa
       from respuestas_automaticas where red = 'instagram' and activa order by creado_en, id`
  )
  return rows.map(aRegla)
}

/**
 * Marca el comentario como tomado. Devuelve false si ya estaba (Meta reintentó el webhook): en ese caso no se hace
 * nada más. Es la única barrera contra responder dos veces el mismo comentario.
 */
export async function tomarComentario(
  db: Db,
  datos: { reglaId: string; comentarioId: string; mediaId: string | null; autorId: string | null; autorUsuario: string | null; texto: string }
): Promise<string | null> {
  const { rows } = await db.query(
    `insert into respuestas_automaticas_envios (regla_id, comentario_id, media_id, autor_id, autor_usuario, texto)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (comentario_id) do nothing
     returning id`,
    [datos.reglaId, datos.comentarioId, datos.mediaId, datos.autorId, datos.autorUsuario, datos.texto.slice(0, 1000)]
  )
  return rows[0]?.id ?? null
}

/** ¿Esta persona ya recibió el DM de esta regla en las últimas `horas`? (sin contar el comentario actual) */
export async function yaRecibioDm(db: Db, reglaId: string, autorId: string, horas: number, excepto: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from respuestas_automaticas_envios
      where regla_id = $1 and autor_id = $2 and dm_ok and id <> $3 and creado_en > now() - make_interval(hours => $4)
      limit 1`,
    [reglaId, autorId, excepto, horas]
  )
  return rows.length > 0
}

export async function cerrarEnvio(
  db: Db,
  id: string,
  datos: { respuestaPublica: string | null; respuestaPublicaOk: boolean | null; dmOk: boolean | null; estado: string; motivo: string | null }
): Promise<void> {
  await db.query(
    `update respuestas_automaticas_envios
        set respuesta_publica = $2, respuesta_publica_ok = $3, dm_ok = $4, estado = $5, motivo = $6
      where id = $1`,
    [id, datos.respuestaPublica, datos.respuestaPublicaOk, datos.dmOk, datos.estado, datos.motivo]
  )
}

/** Link corto: suma un clic a la regla y la devuelve (aunque esté pausada: un link ya enviado debe seguir funcionando). */
export async function sumarClic(db: Db, referencia: string): Promise<ReglaGuardada | null> {
  const { rows } = await db.query(
    `update respuestas_automaticas set clics = clics + 1 where referencia = $1
     returning id, nombre, palabras, respuestas_publicas, mensaje_dm, mensaje_whatsapp, referencia, activa`,
    [referencia]
  )
  return rows[0] ? aRegla(rows[0]) : null
}
