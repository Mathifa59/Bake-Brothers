import type pg from 'pg'

/**
 * Interruptor del bot (tabla `configuracion_bot`, una sola fila; ver 0040). El admin lo cambia desde el panel y la
 * API lo lee en CADA mensaje entrante, así que cambiarlo no necesita redeploy.
 *
 * Si la fila (o la tabla, si la API se despliega antes que la migración) no existe, se trata como APAGADO: es el
 * valor con el que se lanza, y apagado nunca llama a Claude ni responde nada por su cuenta.
 */
export interface ConfiguracionBot {
  botActivo: boolean
  bienvenidaActiva: boolean
  mensajeBienvenida: string
}

export const MENSAJE_BIENVENIDA_POR_DEFECTO = 'Hola, gracias por escribir a Bake Brothers. En unos minutos te atendemos.'

export const CONFIGURACION_BOT_APAGADO: ConfiguracionBot = {
  botActivo: false,
  bienvenidaActiva: false,
  mensajeBienvenida: MENSAJE_BIENVENIDA_POR_DEFECTO,
}

const TABLA_INEXISTENTE = '42P01'

export async function leerConfiguracionBot(db: pg.Pool | pg.PoolClient): Promise<ConfiguracionBot> {
  try {
    const { rows } = await db.query(
      `select bot_activo, bienvenida_activa, mensaje_bienvenida from configuracion_bot where id`
    )
    const fila = rows[0]
    if (!fila) return CONFIGURACION_BOT_APAGADO
    return {
      botActivo: fila.bot_activo === true,
      bienvenidaActiva: fila.bienvenida_activa === true,
      mensajeBienvenida: (fila.mensaje_bienvenida as string)?.trim() || MENSAJE_BIENVENIDA_POR_DEFECTO,
    }
  } catch (err) {
    if ((err as { code?: string }).code === TABLA_INEXISTENTE) return CONFIGURACION_BOT_APAGADO
    throw err
  }
}
