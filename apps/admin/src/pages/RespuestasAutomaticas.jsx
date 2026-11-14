import { useCallback, useEffect, useMemo, useState } from 'react'
import { Instagram, MessageSquareReply, MousePointerClick, Pause, Pencil, Play, Plus, Send, ShoppingBag, TriangleAlert, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatoPrecio } from '../utils/formato'
import { Cargando, EncabezadoBloque, ErrorCarga, Kpi, Pill, Portada, Tarjeta } from '../components/bakeos/ui'
import FormRespuestaAutomatica from '../components/respuestas/FormRespuestaAutomatica'

const ESTADOS = {
  enviado: { texto: 'DM enviado', tono: 'ok' },
  omitido: { texto: 'Ya tenía el DM', tono: 'neutro' },
  parcial: { texto: 'A medias', tono: 'prioridad' },
  error: { texto: 'Error', tono: 'prioridad' },
  procesando: { texto: 'Enviando…', tono: 'lila' },
}

const fechaCorta = (iso) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/**
 * Respuestas automáticas de Instagram (solo dirección): comentan una palabra clave en un reel y Bake OS les responde el
 * comentario y les manda un DM con el link a WhatsApp de la campaña. Las reglas y los resultados se leen directo de
 * Supabase (RLS: solo admin); el envío lo hace la API cuando llega el comentario (webhook de Meta).
 */
export default function RespuestasAutomaticas() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // null | 'nueva' | regla
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState(null)

  const cargar = useCallback(async () => {
    setError(null)
    const [reglas, resumen, conexion, envios] = await Promise.all([
      supabase.from('respuestas_automaticas').select('*').order('creado_en'),
      supabase.rpc('respuestas_automaticas_resumen'),
      // Columna por columna: el token no está concedido al panel.
      supabase.from('instagram_conexion').select('usuario, activa, ultimo_error, ultimo_error_en').eq('activa', true).limit(1),
      supabase
        .from('respuestas_automaticas_envios')
        .select('id, regla_id, autor_usuario, texto, estado, motivo, creado_en')
        .order('creado_en', { ascending: false })
        .limit(15),
    ])
    const fallo = [reglas, resumen, conexion, envios].find((r) => r.error)
    if (fallo) return setError(fallo.error.message)
    const porRegla = new Map((resumen.data ?? []).map((r) => [r.regla_id, r]))
    setDatos({ reglas: reglas.data, porRegla, conexion: conexion.data?.[0] ?? null, envios: envios.data })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totales = useMemo(() => {
    const t = { comentarios: 0, dms: 0, clics: 0, pedidos: 0, ingresos: 0 }
    for (const r of datos?.porRegla.values() ?? []) {
      t.comentarios += Number(r.comentarios)
      t.dms += Number(r.dms)
      t.clics += Number(r.clics)
      t.pedidos += Number(r.pedidos)
      t.ingresos += Number(r.ingresos)
    }
    return t
  }, [datos])

  async function guardar(valores) {
    setGuardando(true)
    setErrorForm(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const consulta =
      editando === 'nueva'
        ? supabase.from('respuestas_automaticas').insert({ ...valores, creado_por: user?.id ?? null })
        : supabase
            .from('respuestas_automaticas')
            .update({
              palabras: valores.palabras,
              respuestas_publicas: valores.respuestas_publicas,
              mensaje_dm: valores.mensaje_dm,
              mensaje_whatsapp: valores.mensaje_whatsapp,
              actualizado_en: new Date().toISOString(),
            })
            .eq('id', editando.id)
    const { error: e } = await consulta
    setGuardando(false)
    if (e) return setErrorForm(e.code === '23505' ? 'Ya existe una respuesta automática con esa palabra clave.' : e.message)
    setEditando(null)
    cargar()
  }

  async function alternar(regla) {
    const { error: e } = await supabase
      .from('respuestas_automaticas')
      .update({ activa: !regla.activa, actualizado_en: new Date().toISOString() })
      .eq('id', regla.id)
    if (e) return setError(e.message)
    cargar()
  }

  return (
    <>
      <Portada
        titulo="Respuestas automáticas"
        subtitulo="Comentan una palabra en Instagram y Bake OS les responde con el link de WhatsApp"
        accion={false}
      />

      {error && <ErrorCarga mensaje={error} />}
      {!error && !datos && <Cargando />}

      {datos && (
        <>
          <EstadoConexion conexion={datos.conexion} />

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi icono={MessageSquareReply} etiqueta="Comentarios atendidos" valor={totales.comentarios} />
            <Kpi icono={Send} tono="lila" etiqueta="DMs enviados" valor={totales.dms} />
            <Kpi icono={MousePointerClick} tono="azul" etiqueta="Tocaron el link" valor={totales.clics} />
            <Kpi icono={ShoppingBag} tono="verde" etiqueta="Pedidos" valor={totales.pedidos} />
            <Kpi icono={Zap} etiqueta="Ventas" valor={formatoPrecio(totales.ingresos)} detalle="Pedidos que llegaron con la campaña" />
          </div>

          {editando ? (
            <Tarjeta className="mt-5 p-5">
              <EncabezadoBloque
                etiqueta={editando === 'nueva' ? 'Nueva respuesta automática' : `Editando · ${editando.nombre}`}
                titulo={editando === 'nueva' ? 'Qué palabra activa la respuesta y qué se manda' : 'Cambia los mensajes o las palabras'}
              />
              <FormRespuestaAutomatica
                regla={editando === 'nueva' ? null : editando}
                guardando={guardando}
                error={errorForm}
                onGuardar={guardar}
                onCancelar={() => {
                  setEditando(null)
                  setErrorForm(null)
                }}
              />
            </Tarjeta>
          ) : (
            <button
              type="button"
              onClick={() => setEditando('nueva')}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-tinta px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 sm:w-auto"
            >
              <Plus size={16} aria-hidden="true" /> Nueva respuesta automática
            </button>
          )}

          <section className="mt-5">
            <EncabezadoBloque etiqueta="Campañas" titulo={`${datos.reglas.length} respuesta${datos.reglas.length === 1 ? '' : 's'} automática${datos.reglas.length === 1 ? '' : 's'}`} />
            {datos.reglas.length === 0 ? (
              <Tarjeta className="bg-gradient-to-br from-acento-suave/70 to-lila-suave/50 p-5 text-sm leading-relaxed">
                <p className="font-bold">Todavía no hay ninguna.</p>
                <p className="mt-1 text-gris">
                  Crea la primera con la palabra que vas a pedir en el reel (por ejemplo «comenta ALFAJOR y te mandamos la promo»).
                  Desde ese momento, cada comentario con esa palabra recibe la respuesta y el DM, sin que nadie tenga que hacer nada.
                </p>
              </Tarjeta>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {datos.reglas.map((r) => (
                  <TarjetaRegla key={r.id} regla={r} resultados={datos.porRegla.get(r.id)} onEditar={() => setEditando(r)} onAlternar={() => alternar(r)} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-6">
            <EncabezadoBloque etiqueta="Actividad" titulo="Últimos comentarios atendidos" />
            {datos.envios.length === 0 ? (
              <p className="text-sm text-gris">Aquí aparece cada comentario que dispara una respuesta.</p>
            ) : (
              <Tarjeta className="divide-y divide-borde p-0">
                {datos.envios.map((e) => {
                  const est = ESTADOS[e.estado] ?? ESTADOS.procesando
                  const regla = datos.reglas.find((r) => r.id === e.regla_id)
                  return (
                    <div key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <strong>{e.autor_usuario ? `@${e.autor_usuario}` : 'Alguien'}</strong>{' '}
                          <span className="text-gris">«{e.texto}»</span>
                        </p>
                        <p className="text-xs text-gris">
                          {fechaCorta(e.creado_en)}
                          {regla && ` · ${regla.nombre.toUpperCase()}`}
                          {e.motivo && e.estado !== 'enviado' && ` · ${e.motivo}`}
                        </p>
                      </div>
                      <Pill tono={est.tono}>{est.texto}</Pill>
                    </div>
                  )
                })}
              </Tarjeta>
            )}
          </section>
        </>
      )}
    </>
  )
}

function EstadoConexion({ conexion }) {
  if (!conexion) {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-acento/50 bg-acento-suave/50 p-4 text-sm">
        <Instagram size={20} className="mt-0.5 shrink-0 text-acento-oscuro" aria-hidden="true" />
        <div>
          <p className="font-bold">Instagram todavía no está conectado</p>
          <p className="mt-0.5 text-gris">
            Puedes crear las respuestas desde ya; empiezan a funcionar cuando se conecte la cuenta (se hace una sola vez, en Meta).
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-hero text-white shadow-lg">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]">
          <Instagram size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Conectado</p>
          <p className="font-semibold">{conexion.usuario ? `@${conexion.usuario}` : 'Cuenta de Instagram'}</p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
          <span className={`h-2 w-2 rounded-full ${conexion.ultimo_error ? 'bg-amber-400' : 'bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.25)]'}`} />
          {conexion.ultimo_error ? 'Con avisos' : 'Respondiendo'}
        </span>
      </div>
      {conexion.ultimo_error && (
        <p className="flex items-start gap-2 border-t border-white/10 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Último error de Meta{conexion.ultimo_error_en ? ` (${fechaCorta(conexion.ultimo_error_en)})` : ''}: {conexion.ultimo_error}
        </p>
      )}
    </div>
  )
}

function TarjetaRegla({ regla, resultados, onEditar, onAlternar }) {
  const r = resultados ?? { comentarios: 0, dms: 0, clics: regla.clics, pedidos: 0, ingresos: 0 }
  const metricas = [
    ['Comentarios', r.comentarios],
    ['DMs', r.dms],
    ['Clics', r.clics],
    ['Pedidos', r.pedidos],
  ]
  return (
    <Tarjeta className={`group relative overflow-hidden p-5 transition-shadow hover:shadow-md ${regla.activa ? '' : 'opacity-75'}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${regla.activa ? 'bg-acento' : 'bg-borde'}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold uppercase tracking-wide">{regla.nombre}</h3>
            <Pill tono={regla.activa ? 'ok' : 'neutro'}>{regla.activa ? 'Activa' : 'Pausada'}</Pill>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {regla.palabras.map((p) => (
              <span key={p} className="rounded-md bg-crema px-2 py-0.5 text-[11px] font-semibold text-gris">
                {p}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar ${regla.nombre}`}
            className="grid h-9 w-9 place-items-center rounded-xl border border-borde text-gris transition-colors hover:border-acento hover:text-acento-oscuro"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onAlternar}
            aria-label={regla.activa ? `Pausar ${regla.nombre}` : `Activar ${regla.nombre}`}
            className="grid h-9 w-9 place-items-center rounded-xl border border-borde text-gris transition-colors hover:border-acento hover:text-acento-oscuro"
          >
            {regla.activa ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metricas.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-crema px-2.5 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-gris">{k}</dt>
            <dd className="text-lg font-bold leading-tight">{Number(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gris">
        <span>
          <strong className="text-acento-oscuro">{formatoPrecio(Number(r.ingresos))}</strong> en ventas con esta campaña
        </span>
        <code className="rounded bg-crema px-1.5 py-0.5 text-[11px]">{regla.referencia}</code>
      </p>
    </Tarjeta>
  )
}
