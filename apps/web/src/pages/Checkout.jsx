import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Store, Truck, PartyPopper } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useCatalogo } from '../context/CatalogContext'
import { extrasDisponibles } from '../data/mock'
import { formatoPrecio } from '../utils/formato'
import { api } from '../api/client'
import CheckoutSteps from '../components/CheckoutSteps'
import Button from '../components/Button'
import Input from '../components/Input'
import DatePicker from '../components/DatePicker'
import Badge from '../components/Badge'

const pasos = ['Datos', 'Entrega', 'Fecha', 'Pago', 'Confirmar']

const metodosPago = [
  { id: 'yape', nombre: 'Yape', detalle: 'Te enviaremos el QR al confirmar', marcas: ['Yape'] },
  { id: 'plin', nombre: 'Plin', detalle: 'Te enviaremos el QR al confirmar', marcas: ['Plin'] },
  { id: 'transferencia', nombre: 'Transferencia bancaria', detalle: 'Depósito o transferencia directa', marcas: ['BCP', 'Interbank', 'BBVA'] },
  { id: 'tarjeta', nombre: 'Tarjeta de crédito o débito', detalle: 'En una sola cuota', marcas: ['Visa', 'Mastercard', 'Amex'] },
  { id: 'contraentrega', nombre: 'Pago contra entrega', detalle: 'Efectivo o Yape al recibir', marcas: [] },
]

const rangosHorarios = [
  '9:00 am – 12:00 pm',
  '12:00 pm – 3:00 pm',
  '3:00 pm – 6:00 pm',
  '6:00 pm – 8:00 pm',
]

// El id de extra que guarda el carrito ('Dedicatoria') se traduce al slug de la BD.
const slugDeExtra = (idExtra) =>
  extrasDisponibles.find((e) => e.id === idExtra)?.slug ?? idExtra

const hoyISO = () => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
}

const mensajesError = {
  ANTICIPACION_INSUFICIENTE:
    'La fecha elegida no respeta la anticipación mínima de uno de tus productos (las tortas necesitan 48 h). Elige una fecha más adelante.',
  SIN_CUPO_DISPONIBLE:
    'Ese día ya no tenemos cupo de producción disponible para uno de tus productos. Elige otra fecha.',
  CUPON_INVALIDO: 'El cupón aplicado ya no es válido.',
  ZONA_NO_CUBIERTA: 'Aún no hacemos delivery a ese distrito.',
  PRODUCTO_NO_DISPONIBLE: 'Uno de los productos de tu carrito ya no está disponible.',
}

export default function Checkout() {
  const { items, totales, vaciarCarrito, precioLinea, setUltimoPedido, cupon } = useCart()
  const { distritos } = useCatalogo()
  const navigate = useNavigate()
  const [paso, setPaso] = useState(0)
  const [confirmado, setConfirmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const [datos, setDatos] = useState({
    nombre: '', telefono: '', correo: '', dni: '',
    tipoEntrega: 'delivery', direccion: '', distrito: distritos[0], referencia: '',
    fecha: '', horario: rangosHorarios[0], nota: '',
    pago: 'yape',
  })

  const set = (campo) => (e) => {
    setDatos((d) => ({ ...d, [campo]: e.target.value }))
    setError('')
  }

  if (items.length === 0 && !confirmado) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center md:px-6">
        <span className="text-7xl">🛒</span>
        <h1 className="mt-5 font-display text-3xl font-semibold">Aún no tienes productos</h1>
        <p className="mt-2 text-gris">Agrega algo delicioso antes de finalizar tu pedido.</p>
        <Button className="mt-6" to="/catalogo">Ir al catálogo</Button>
      </div>
    )
  }

  const validarPaso = () => {
    if (paso === 0) {
      if (!datos.nombre.trim() || !datos.telefono.trim() || !datos.correo.trim())
        return 'Completa tu nombre, teléfono y correo para continuar.'
    }
    if (paso === 1 && datos.tipoEntrega === 'delivery') {
      if (!datos.direccion.trim()) return 'Ingresa la dirección de entrega.'
    }
    if (paso === 2 && !datos.fecha) return 'Elige la fecha de entrega de tu pedido.'
    return ''
  }

  const siguiente = () => {
    const err = validarPaso()
    if (err) return setError(err)
    setError('')
    setPaso((p) => Math.min(p + 1, pasos.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // El pedido se crea en el servidor: la API recalcula precios con
  // @bakebrothers/domain y valida anticipación, cupo, zona y cupón.
  const confirmarPedido = async () => {
    setEnviando(true)
    setError('')
    try {
      const respuesta = await api.crearPedido({
        cliente: {
          nombre: datos.nombre,
          telefono: datos.telefono,
          correo: datos.correo || null,
          dni: datos.dni || null,
        },
        tipoEntrega: datos.tipoEntrega === 'tienda' ? 'tienda' : 'delivery',
        direccion: datos.direccion || null,
        distrito: datos.tipoEntrega === 'delivery' ? datos.distrito : null,
        referencia: datos.referencia || null,
        fechaEntrega: datos.fecha,
        horario: datos.horario,
        nota: datos.nota || null,
        metodoPago: datos.pago,
        cuponCodigo: cupon?.codigo || null,
        items: items.map((i) => ({
          productoId: i.producto.id,
          tamano: i.tamano || null,
          extras: (i.extras || []).map(slugDeExtra),
          cantidad: i.cantidad,
        })),
      })
      setUltimoPedido({
        numero: respuesta.numero,
        datos,
        items: items.map((i) => ({
          nombre: i.producto.nombre,
          cantidad: i.cantidad,
          precio: precioLinea(i),
          emoji: i.producto.emoji,
          detalle: [i.tamano, ...(i.extras || [])].filter(Boolean).join(' · '),
        })),
        totales: {
          subtotal: respuesta.subtotal,
          descuentoCupon: respuesta.descuentoCupon,
          delivery: respuesta.delivery,
          total: respuesta.total,
        },
      })
      setConfirmado(true)
      vaciarCarrito()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(
        mensajesError[e.cuerpo?.error] ||
          'No pudimos registrar tu pedido. Verifica tu conexión e inténtalo de nuevo.'
      )
    } finally {
      setEnviando(false)
    }
  }

  // ——— Pantalla de éxito ———
  if (confirmado) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center md:px-6">
        <div className="anim-pop mx-auto grid h-24 w-24 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
          <Check size={44} strokeWidth={3} />
        </div>
        <h1 className="anim-fade-up delay-1 mt-7 font-display text-4xl font-semibold md:text-5xl">
          ¡Pedido recibido! <PartyPopper className="inline text-acento" size={36} />
        </h1>
        <p className="anim-fade-up delay-2 mx-auto mt-4 max-w-md leading-relaxed text-gris">
          Gracias por comprar en <strong className="text-tinta">Bake Brothers</strong>. Nos
          comunicaremos contigo para confirmar los detalles de tu pedido.
        </p>
        <div className="anim-fade-up delay-3 mt-8 flex flex-wrap justify-center gap-3">
          <Button tamano="lg" to="/">Volver al inicio</Button>
          <Button tamano="lg" variante="secundario" to="/cuenta/pedidos">Ver mi pedido</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 lg:py-14">
      <h1 className="mb-2 text-center font-display text-4xl font-semibold">Finalizar pedido</h1>
      <p className="mb-8 text-center text-sm text-gris">Pide hoy y coordina tu entrega 🧡</p>

      <CheckoutSteps pasos={pasos} actual={paso} />

      <div className="mt-8 rounded-[2rem] border border-borde/60 bg-white p-6 shadow-sm md:p-8">
        {/* PASO 1 — Datos del cliente */}
        {paso === 0 && (
          <div className="anim-fade-in space-y-4">
            <h2 className="font-display text-2xl font-semibold">Datos del cliente</h2>
            <Input label="Nombre completo *" placeholder="Ej. Lucía Fernández" value={datos.nombre} onChange={set('nombre')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Teléfono *" type="tel" placeholder="999 999 999" value={datos.telefono} onChange={set('telefono')} />
              <Input label="DNI (opcional)" placeholder="12345678" value={datos.dni} onChange={set('dni')} />
            </div>
            <Input label="Correo electrónico *" type="email" placeholder="tucorreo@ejemplo.com" value={datos.correo} onChange={set('correo')} />
          </div>
        )}

        {/* PASO 2 — Tipo de entrega */}
        {paso === 1 && (
          <div className="anim-fade-in space-y-5">
            <h2 className="font-display text-2xl font-semibold">Tipo de entrega</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { id: 'tienda', Icono: Store, titulo: 'Recojo en tienda', texto: 'Av. Los Pasteles 456, Miraflores. Sin costo.' },
                { id: 'delivery', Icono: Truck, titulo: 'Delivery', texto: 'Llevamos tu pedido a la puerta de tu casa.' },
              ].map(({ id, Icono, titulo, texto }) => (
                <button
                  key={id}
                  onClick={() => setDatos((d) => ({ ...d, tipoEntrega: id }))}
                  className={`rounded-3xl border-2 p-5 text-left transition-all cursor-pointer ${
                    datos.tipoEntrega === id
                      ? 'border-acento bg-acento-suave'
                      : 'border-borde bg-white hover:border-acento/40'
                  }`}
                >
                  <Icono size={26} className={datos.tipoEntrega === id ? 'text-acento-oscuro' : 'text-gris'} />
                  <p className="mt-2.5 font-display font-semibold">{titulo}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gris">{texto}</p>
                </button>
              ))}
            </div>

            {datos.tipoEntrega === 'delivery' && (
              <div className="anim-fade-in space-y-4 rounded-3xl bg-hueso p-5 ring-1 ring-borde/60">
                <Input label="Dirección *" placeholder="Calle, número, dpto." value={datos.direccion} onChange={set('direccion')} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Distrito" opciones={distritos} value={datos.distrito} onChange={set('distrito')} />
                  <Input label="Referencia" placeholder="Ej. frente al parque" value={datos.referencia} onChange={set('referencia')} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 3 — Fecha y hora */}
        {paso === 2 && (
          <div className="anim-fade-in space-y-4">
            <h2 className="font-display text-2xl font-semibold">Fecha y hora</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DatePicker label="Fecha de entrega *" min={hoyISO()} value={datos.fecha} onChange={set('fecha')} />
              <Input label="Rango horario" opciones={rangosHorarios} value={datos.horario} onChange={set('horario')} />
            </div>
            <Input
              label="Nota para el pedido"
              textarea
              placeholder="Ej. la dedicatoria debe decir «Feliz cumple, Vale 🎉»"
              value={datos.nota}
              onChange={set('nota')}
            />
            <p className="rounded-2xl bg-acento-suave px-4 py-3 text-xs font-semibold leading-relaxed text-acento-oscuro">
              🕐 Recuerda: las tortas necesitan al menos 48 h de anticipación y los bocaditos 24 h.
            </p>
          </div>
        )}

        {/* PASO 4 — Método de pago */}
        {paso === 3 && (
          <div className="anim-fade-in space-y-4">
            <h2 className="font-display text-2xl font-semibold">Elige un medio de pago</h2>
            <div className="overflow-hidden rounded-xl border border-borde">
              {metodosPago.map((m, i) => (
                <label
                  key={m.id}
                  htmlFor={`pago-${m.id}`}
                  className={`flex cursor-pointer items-start gap-3.5 px-4 py-3.5 transition-colors ${
                    i > 0 ? 'border-t border-borde' : ''
                  } ${datos.pago === m.id ? 'bg-hueso' : 'bg-white hover:bg-hueso/60'}`}
                >
                  <input
                    id={`pago-${m.id}`}
                    type="radio"
                    name="pago"
                    checked={datos.pago === m.id}
                    onChange={() => setDatos((d) => ({ ...d, pago: m.id }))}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-tinta"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-tinta">{m.nombre}</span>
                    <span className="block text-xs text-gris">{m.detalle}</span>
                    {m.marcas.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.marcas.map((marca) => (
                          <span
                            key={marca}
                            className="rounded border border-borde bg-white px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide text-gris"
                          >
                            {marca}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gris">
              Esta tienda es una demostración: no se procesará ningún pago real.
            </p>
          </div>
        )}

        {/* PASO 5 — Confirmación */}
        {paso === 4 && (
          <div className="anim-fade-in space-y-6">
            <h2 className="font-display text-2xl font-semibold">Revisa y confirma</h2>

            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-gris">Productos</h3>
              <ul className="divide-y divide-borde/60 rounded-2xl bg-hueso px-4 ring-1 ring-borde/60">
                {items.map((i) => (
                  <li key={i.clave} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">{i.producto.emoji}</span>
                      <span className="truncate">
                        <span className="font-semibold">{i.producto.nombre}</span>
                        {(i.tamano || i.extras?.length > 0) && (
                          <span className="block text-xs text-gris">
                            {[i.tamano, ...(i.extras || [])].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold">
                      {i.cantidad} × {formatoPrecio(precioLinea(i))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-hueso p-4 ring-1 ring-borde/60">
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.15em] text-gris">Cliente</h3>
                <p className="text-sm font-semibold">{datos.nombre}</p>
                <p className="text-xs text-gris">{datos.telefono} · {datos.correo}</p>
              </div>
              <div className="rounded-2xl bg-hueso p-4 ring-1 ring-borde/60">
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.15em] text-gris">Entrega</h3>
                <p className="text-sm font-semibold">
                  {datos.tipoEntrega === 'delivery'
                    ? `Delivery — ${datos.distrito}`
                    : 'Recojo en tienda'}
                </p>
                <p className="text-xs text-gris">
                  {datos.fecha} · {datos.horario}
                  {datos.tipoEntrega === 'delivery' && datos.direccion && ` · ${datos.direccion}`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-tinta px-5 py-4 text-white">
              <div className="text-sm">
                <p className="font-bold">Total a pagar</p>
                <p className="text-xs text-white/60">
                  Pago con {metodosPago.find((m) => m.id === datos.pago)?.nombre}
                  {cupon && ` · Cupón ${cupon.codigo}`}
                  {totales.delivery === 0 && ' · Delivery gratis'}
                </p>
              </div>
              <span className="text-2xl font-extrabold text-acento">{formatoPrecio(totales.total)}</span>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-200">
            {error}
          </p>
        )}

        {/* Navegación entre pasos */}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-borde pt-6">
          {paso > 0 ? (
            <Button variante="fantasma" onClick={() => { setPaso(paso - 1); setError('') }}>
              <ArrowLeft size={16} /> Atrás
            </Button>
          ) : (
            <Button variante="fantasma" to="/carrito">
              <ArrowLeft size={16} /> Volver al carrito
            </Button>
          )}
          {paso < pasos.length - 1 ? (
            <Button onClick={siguiente}>
              Continuar <ArrowRight size={16} />
            </Button>
          ) : (
            <Button tamano="lg" onClick={confirmarPedido} disabled={enviando}>
              {enviando ? 'Registrando pedido…' : 'Confirmar pedido'} <Check size={17} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
