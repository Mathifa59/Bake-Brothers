import { useEffect, useState } from 'react'
import { useConversaciones } from '../hooks/useConversaciones'

const NOMBRE_CANAL = { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram' }

function Mensaje({ m }) {
  const esOperador = m.rol === 'operador'
  return (
    <div className={`flex ${esOperador ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          esOperador ? 'bg-tinta text-white' : 'bg-hueso text-tinta'
        }`}
      >
        <p>{m.texto}</p>
        <p className={`mt-1 text-[10px] ${esOperador ? 'text-white/60' : 'text-gris'}`}>
          {m.rol} · {m.en ? new Date(m.en).toLocaleString('es-PE') : ''}
        </p>
      </div>
    </div>
  )
}

export default function Conversaciones() {
  const { conversaciones, error, enviando, errorEnvio, enviarMensaje } = useConversaciones()
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [texto, setTexto] = useState('')

  const seleccionado = conversaciones?.find((c) => c.id === seleccionadoId) ?? null

  // Si la conversación seleccionada salió de la bandeja (ya fue atendida),
  // se limpia la selección en vez de dejar un panel apuntando a nada.
  useEffect(() => {
    if (seleccionadoId && conversaciones && !seleccionado) setSeleccionadoId(null)
  }, [conversaciones, seleccionadoId, seleccionado])

  const enviar = async (e) => {
    e.preventDefault()
    if (!seleccionado) return
    const ok = await enviarMensaje(seleccionado, texto)
    if (ok) setTexto('')
  }

  if (error) return <p className="p-6 text-sm text-red-600">Error al cargar conversaciones: {error}</p>
  if (!conversaciones) return <p className="p-6 text-sm text-gris">Cargando conversaciones…</p>

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-bold">Conversaciones</h1>
      <p className="mb-4 text-sm text-gris">Chats escalados por el bot, esperando un operador.</p>

      {conversaciones.length === 0 ? (
        <p className="text-sm text-gris">No hay conversaciones escaladas para tu alcance ahora mismo.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-borde/60 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borde/60 bg-hueso text-xs font-bold uppercase tracking-wide text-gris">
                <tr>
                  <th className="px-4 py-3">Canal</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Sede</th>
                </tr>
              </thead>
              <tbody>
                {conversaciones.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSeleccionadoId(c.id)}
                    className={`cursor-pointer border-b border-borde/40 last:border-0 transition-colors hover:bg-hueso ${
                      seleccionadoId === c.id ? 'bg-acento-suave' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold">{NOMBRE_CANAL[c.canal] ?? c.canal}</td>
                    <td className="px-4 py-3">{c.external_id}</td>
                    <td className="px-4 py-3">{c.sedes?.nombre ?? <span className="text-gris">sin asignar</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            {!seleccionado ? (
              <p className="text-sm text-gris">Elegí una conversación para ver el historial y responder.</p>
            ) : (
              <div className="flex h-full flex-col rounded-2xl border border-borde/60 bg-white">
                <div className="border-b border-borde/60 px-5 py-3">
                  <p className="font-semibold">
                    {NOMBRE_CANAL[seleccionado.canal] ?? seleccionado.canal} · {seleccionado.external_id}
                  </p>
                  <p className="text-xs text-gris">{seleccionado.sedes?.nombre ?? 'sin sede asignada'}</p>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5" style={{ maxHeight: 420 }}>
                  {(seleccionado.historial ?? []).length === 0 ? (
                    <p className="text-sm text-gris">Sin mensajes en el historial todavía.</p>
                  ) : (
                    seleccionado.historial.map((m, i) => <Mensaje key={i} m={m} />)
                  )}
                </div>

                {errorEnvio && (
                  <p className="border-t border-borde/60 bg-red-50 px-4 py-2 text-sm text-red-600">
                    No se pudo enviar el mensaje por WhatsApp: {errorEnvio.message}
                    {errorEnvio.detalle ? (
                      <span className="block text-xs opacity-80">{JSON.stringify(errorEnvio.detalle)}</span>
                    ) : null}
                  </p>
                )}
                <form onSubmit={enviar} className="flex gap-2 border-t border-borde/60 p-4">
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escribí una respuesta…"
                    disabled={enviando === seleccionado.id}
                    className="flex-1 rounded-full border border-borde bg-white px-4 py-2.5 text-sm outline-none focus:border-acento focus:ring-2 focus:ring-acento/20"
                  />
                  <button
                    type="submit"
                    disabled={enviando === seleccionado.id || !texto.trim()}
                    className="rounded-full bg-tinta px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
                  >
                    {enviando === seleccionado.id ? 'Enviando…' : 'Enviar'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
