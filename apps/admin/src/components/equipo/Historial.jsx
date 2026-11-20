import { useCallback, useEffect, useMemo, useState } from 'react'
import { cambiosAuditoria, resumenCreacion, tituloAuditoria } from '@bakebrothers/domain'
import { leerAuditoria } from '../../hooks/useEquipo'
import { fechaHoraLegible, haceCuanto, mensajeDeErrorEquipo } from '../../utils/equipo'
import { Cargando, ErrorCarga } from '../bakeos/ui'

/**
 * Registro de auditoría: quién creó, cambió o desactivó cada cuenta y cuándo. Lo escribe la base (no se puede editar ni
 * borrar). Con `objetivoId` muestra solo el historial de esa cuenta.
 */
export default function Historial({ sedes, objetivoId, limite = 30, compacto = false }) {
  const [estado, setEstado] = useState({ registros: [], cargando: true, error: null, hayMas: false })
  const nombreSede = useMemo(() => {
    const porId = new Map(sedes.map((s) => [s.id, s.nombre]))
    return (id) => porId.get(id) ?? 'otro local'
  }, [sedes])

  const cargar = useCallback(
    async (desde) => {
      try {
        const d = await leerAuditoria({ objetivoId, limite, desde })
        const lote = d.registros ?? []
        setEstado((e) => ({
          registros: desde === 0 ? lote : [...e.registros, ...lote],
          cargando: false,
          error: null,
          hayMas: lote.length === limite,
        }))
      } catch (error) {
        setEstado((e) => ({ ...e, cargando: false, error }))
      }
    },
    [objetivoId, limite]
  )

  useEffect(() => {
    setEstado({ registros: [], cargando: true, error: null, hayMas: false })
    cargar(0)
  }, [cargar])

  if (estado.cargando) return <Cargando texto="Leyendo el historial…" />
  if (estado.error) return <ErrorCarga mensaje={mensajeDeErrorEquipo(estado.error)} />
  if (estado.registros.length === 0) return <p className="py-6 text-center text-sm text-gris">Todavía no hay movimientos registrados.</p>

  return (
    <div>
      <ul className="flex flex-col gap-2.5">
        {estado.registros.map((r) => {
          const lineas = r.accion === 'editar' ? cambiosAuditoria(r.detalle, nombreSede) : []
          const resumen = r.accion === 'crear' ? resumenCreacion(r.detalle, nombreSede) : null
          return (
            <li key={r.id} className={`rounded-2xl border border-borde bg-hueso ${compacto ? 'p-3' : 'p-3.5'}`}>
              <p className="text-sm font-semibold leading-snug">{tituloAuditoria(r)}</p>
              {resumen && <p className="mt-1 text-xs text-gris">{resumen}</p>}
              {lineas.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-gris">
                  {lineas.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[11px] text-gris" title={fechaHoraLegible(r.cuando)}>
                {fechaHoraLegible(r.cuando)} · {haceCuanto(r.cuando)}
              </p>
            </li>
          )
        })}
      </ul>
      {estado.hayMas && !compacto && (
        <button
          type="button"
          onClick={() => cargar(estado.registros.length)}
          className="mt-3 h-11 w-full rounded-xl border border-borde bg-white text-sm font-semibold"
        >
          Ver más
        </button>
      )}
    </div>
  )
}
