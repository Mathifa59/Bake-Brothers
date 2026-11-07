import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConversaciones, useRespuestasRapidas } from '../hooks/useConversaciones'
import { supabase } from '../lib/supabase'
import { useAhora } from '../lib/datos'
import { Cargando, ErrorCarga, Portada } from '../components/bakeos/ui'
import { AvisoBotApagado } from '../components/bakeos/InterruptorBot'
import ListaConversaciones from '../components/conversaciones/ListaConversaciones'
import ChatConversacion from '../components/conversaciones/ChatConversacion'
import { FILTROS_BANDEJA, clienteDe, nombreDeConversacion, ordenarBandeja, telefonoDeConversacion } from '../utils/conversaciones'

/**
 * Bandeja de Conversaciones, pensada primero para el celular: en pantalla chica la lista y el chat son vistas
 * separadas (tocar una conversación abre el chat; la flecha vuelve a la lista); en pantalla grande van lado a lado.
 */
export default function Conversaciones() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const ahora = useAhora(30_000)
  const bandeja = useConversaciones()
  const respuestas = useRespuestasRapidas()

  const [seleccionadoId, setSeleccionadoId] = useState(null)
  const [filtro, setFiltro] = useState('esperando')
  const [filtroSede, setFiltroSede] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [sedes, setSedes] = useState([])

  useEffect(() => {
    supabase
      .from('sedes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setSedes(data ?? []))
  }, [])

  const todas = bandeja.conversaciones ?? []
  const visibles = useMemo(() => {
    const regla = FILTROS_BANDEJA.find((f) => f.clave === filtro) ?? FILTROS_BANDEJA[2]
    const texto = busqueda.trim().toLowerCase()
    const digitos = texto.replace(/\D/g, '')
    return ordenarBandeja(
      todas.filter((c) => {
        if (!regla.cumple(c)) return false
        if (filtroSede === 'sin' ? c.sede_id : filtroSede && c.sede_id !== filtroSede) return false
        if (!texto) return true
        const nombre = nombreDeConversacion(c, bandeja.clientes).toLowerCase()
        const ultimo = (c.historial ?? []).at(-1)?.texto?.toLowerCase() ?? ''
        return (
          nombre.includes(texto) ||
          ultimo.includes(texto) ||
          telefonoDeConversacion(c).toLowerCase().includes(texto) ||
          (digitos.length >= 3 && c.external_id.includes(digitos))
        )
      })
    )
  }, [todas, filtro, filtroSede, busqueda, bandeja.clientes])

  // Tocar un aviso o una notificación abre esa conversación (/conversaciones?c=<id>).
  const [params, setParams] = useSearchParams()
  const pedida = params.get('c')
  useEffect(() => {
    if (!pedida || !bandeja.conversaciones) return
    if (bandeja.conversaciones.some((c) => c.id === pedida)) {
      setSeleccionadoId(pedida)
      setFiltro('todas') // si ya no está «esperando», igual se ve
    }
    setParams({}, { replace: true })
  }, [pedida, bandeja.conversaciones, setParams])

  const seleccionada = todas.find((c) => c.id === seleccionadoId) ?? null
  useEffect(() => {
    if (seleccionadoId && bandeja.conversaciones && !seleccionada) setSeleccionadoId(null)
  }, [bandeja.conversaciones, seleccionadoId, seleccionada])

  if (bandeja.error) return <ErrorCarga mensaje={`No se pudieron cargar las conversaciones: ${bandeja.error}`} />

  return (
    <>
      <div className={seleccionada ? 'hidden lg:block' : ''}>
        <Portada titulo="Conversaciones" subtitulo="Chats con clientes: lo que espera a una persona, primero" accion={false} />
        <AvisoBotApagado />
      </div>
      <div className="py-4">
        {!bandeja.conversaciones ? (
          <Cargando texto="Cargando conversaciones…" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <div className={seleccionada ? 'hidden lg:block' : 'block'}>
              <ListaConversaciones
                conversaciones={visibles}
                todas={todas}
                clientes={bandeja.clientes}
                ahora={ahora}
                seleccionadoId={seleccionadoId}
                onSeleccionar={setSeleccionadoId}
                filtro={filtro}
                onFiltro={setFiltro}
                sedes={sedes}
                filtroSede={filtroSede}
                onFiltroSede={setFiltroSede}
                busqueda={busqueda}
                onBusqueda={setBusqueda}
              />
            </div>

            <div className={seleccionada ? 'block' : 'hidden lg:block'}>
              {!seleccionada ? (
                <p className="rounded-2xl border border-borde bg-hueso p-6 text-center text-sm text-gris">
                  Elige una conversación para ver el historial y responder.
                </p>
              ) : (
                <ChatConversacion
                  conversacion={seleccionada}
                  cliente={clienteDe(seleccionada, bandeja.clientes)}
                  ahora={ahora}
                  esAdmin={esAdmin}
                  sedes={sedes}
                  trabajando={bandeja.trabajando}
                  errorAccion={bandeja.errorAccion}
                  onLimpiarError={bandeja.limpiarError}
                  onVolver={() => setSeleccionadoId(null)}
                  onTomar={bandeja.tomar}
                  onDevolver={bandeja.devolverAlBot}
                  onCerrar={bandeja.cerrar}
                  onAsignarSede={bandeja.asignarSede}
                  onEnviar={bandeja.enviarMensaje}
                  respuestas={respuestas}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
