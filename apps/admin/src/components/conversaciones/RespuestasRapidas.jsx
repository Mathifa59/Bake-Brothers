import { useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'

/** Lista de respuestas rápidas: tocar una la pone en el cuadro de texto. El admin además las edita aquí mismo. */
export default function RespuestasRapidas({ respuestas, esAdmin, error, onElegir, onGuardar, onBorrar, onCerrar }) {
  const [editando, setEditando] = useState(null) // { id?, titulo, texto }
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    if (!editando.titulo.trim() || !editando.texto.trim()) return
    setGuardando(true)
    const ok = await onGuardar(editando)
    setGuardando(false)
    if (ok) setEditando(null)
  }

  return (
    <div className="rounded-2xl border border-borde bg-hueso p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gris">Respuestas rápidas</p>
        <button onClick={onCerrar} aria-label="Cerrar respuestas rápidas" className="grid h-9 w-9 place-items-center rounded-lg text-gris">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {editando ? (
        <form onSubmit={guardar} className="flex flex-col gap-2">
          <input
            value={editando.titulo}
            onChange={(e) => setEditando({ ...editando, titulo: e.target.value })}
            maxLength={40}
            placeholder="Título (ej. Saludo)"
            className="min-h-11 rounded-xl border border-borde bg-white px-3 text-sm outline-none focus:border-acento"
          />
          <textarea
            value={editando.texto}
            onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
            maxLength={1000}
            rows={4}
            placeholder="Texto que se envía al cliente"
            className="rounded-xl border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-acento"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={guardando} className="min-h-11 flex-1 rounded-xl bg-tinta text-sm font-semibold text-white disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => setEditando(null)} className="min-h-11 rounded-xl border border-borde px-4 text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          {respuestas.length === 0 && <p className="py-3 text-sm text-gris">Todavía no hay respuestas rápidas.</p>}
          <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
            {respuestas.map((r) => (
              <li key={r.id} className="flex items-stretch gap-1.5">
                <button onClick={() => onElegir(r.texto)} className="min-h-11 flex-1 rounded-xl border border-borde bg-white px-3 py-2 text-left">
                  <span className="block text-sm font-semibold">{r.titulo}</span>
                  <span className="line-clamp-1 text-xs text-gris">{r.texto}</span>
                </button>
                {esAdmin && (
                  <>
                    <button onClick={() => setEditando(r)} aria-label={`Editar ${r.titulo}`} className="grid w-11 place-items-center rounded-xl border border-borde bg-white text-gris">
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button onClick={() => onBorrar(r.id)} aria-label={`Borrar ${r.titulo}`} className="grid w-11 place-items-center rounded-xl border border-borde bg-white text-red-600">
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {esAdmin && (
            <button onClick={() => setEditando({ titulo: '', texto: '' })} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-borde text-sm font-semibold">
              <Plus size={15} aria-hidden="true" /> Nueva respuesta
            </button>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
