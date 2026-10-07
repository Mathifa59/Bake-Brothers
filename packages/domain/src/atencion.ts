/** Un turno del historial de una conversación (`conversaciones.historial`). */
export interface TurnoAtencion {
  rol: 'cliente' | 'bot' | 'operador'
  en: string
  /** Mensajes traídos de la sincronización de Coexistence (anteriores a conectar): no miden la atención actual. */
  importado?: boolean
}

export interface TiemposRespuesta {
  /** Segundos entre el primer mensaje del cliente y la primera respuesta del bot; null si no hubo. */
  botSegundos: number | null
  /** Segundos que esperó el cliente a un humano; null si ningún humano respondió. */
  humanaSegundos: number | null
}

const aMs = (iso: string) => new Date(iso).getTime()

/**
 * Tiempos de primera respuesta de UNA conversación, desde su historial.
 *
 *  - Bot: primer mensaje del cliente → primera respuesta del bot.
 *  - Humana: la espera del cliente hasta la PRIMERA respuesta de un operador,
 *    medida desde que el bot lo derivó (el último mensaje del bot antes de esa
 *    respuesta — el aviso de "te paso con alguien del equipo"). Si el bot no
 *    intervino, desde el primer mensaje del cliente. Si el operador escribió
 *    primero (el cliente no había pedido nada), no hay espera que medir.
 *
 * Límite conocido: hasta que los echoes de Coexistence estén activos, lo que
 * el equipo responde desde el celular NO queda en el historial; solo cuentan
 * las respuestas dadas desde el dashboard.
 */
export function tiemposDeRespuesta(historial: TurnoAtencion[]): TiemposRespuesta {
  const turnos = historial.filter((t) => !t.importado)

  const primerCliente = turnos.findIndex((t) => t.rol === 'cliente')
  let botSegundos: number | null = null
  if (primerCliente >= 0) {
    const resp = turnos.slice(primerCliente + 1).find((t) => t.rol === 'bot')
    if (resp) botSegundos = Math.max(0, (aMs(resp.en) - aMs(turnos[primerCliente].en)) / 1000)
  }

  let humanaSegundos: number | null = null
  const idxOperador = turnos.findIndex((t) => t.rol === 'operador')
  if (idxOperador >= 0) {
    const previos = turnos.slice(0, idxOperador)
    const ultimoBot = [...previos].reverse().find((t) => t.rol === 'bot')
    const inicio = ultimoBot ?? previos.find((t) => t.rol === 'cliente')
    if (inicio) humanaSegundos = Math.max(0, (aMs(turnos[idxOperador].en) - aMs(inicio.en)) / 1000)
  }

  return { botSegundos, humanaSegundos }
}

export interface ResumenAtencion {
  conversaciones: number
  bot: { promedioSegundos: number | null; muestras: number }
  humana: { promedioSegundos: number | null; muestras: number }
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Promedios sobre un conjunto de conversaciones (cada una cuenta una vez, sin importar cuántos mensajes tenga). */
export function resumirAtencion(historiales: TurnoAtencion[][]): ResumenAtencion {
  const bot: number[] = []
  const humana: number[] = []
  for (const h of historiales) {
    const t = tiemposDeRespuesta(h)
    if (t.botSegundos !== null) bot.push(t.botSegundos)
    if (t.humanaSegundos !== null) humana.push(t.humanaSegundos)
  }
  return {
    conversaciones: historiales.length,
    bot: { promedioSegundos: promedio(bot), muestras: bot.length },
    humana: { promedioSegundos: promedio(humana), muestras: humana.length },
  }
}
