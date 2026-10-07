import { useId } from 'react'

const W = 320
const H = 150
const M = { izq: 40, der: 8, arr: 8, abajo: 22 }

/** "10 a. m." / "6 p. m." para una hora 0-23. */
export function etiquetaHora(h) {
  const suf = h < 12 ? 'a. m.' : 'p. m.'
  return `${h % 12 === 0 ? 12 : h % 12} ${suf}`
}

// Escala "bonita" para el eje Y: 4 divisiones con paso redondo (100, 200, 500…).
function escalaY(max) {
  const bruto = Math.max(max, 1) / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? mag * 10
  return { paso, tope: paso * 4 }
}

/**
 * Área de ventas por hora (SVG propio, sin librerías). `puntos` = [{ hora, ventas }]
 * ya con todas las horas del rango (con 0 donde no hubo ventas — un hueco
 * silencioso mentiría sobre si la hora tuvo 0 o no se calculó).
 */
export default function GraficoArea({ puntos, alt }) {
  const id = useId().replace(/:/g, '')
  if (!puntos.length) return null
  const { paso, tope } = escalaY(Math.max(...puntos.map((p) => p.ventas)))
  const ancho = W - M.izq - M.der
  const alto = H - M.arr - M.abajo
  const x = (i) => M.izq + (puntos.length === 1 ? ancho / 2 : (i / (puntos.length - 1)) * ancho)
  const y = (v) => M.arr + alto - (v / tope) * alto
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ventas).toFixed(1)}`).join(' ')
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${M.arr + alto} L${x(0).toFixed(1)},${M.arr + alto} Z`
  const cadaN = puntos.length > 8 ? 2 : 1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={alt} className="h-auto w-full">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D86820" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#D86820" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line x1={M.izq} x2={W - M.der} y1={y(i * paso)} y2={y(i * paso)} stroke="#E8E5DE" strokeWidth="1" />
          <text x={M.izq - 6} y={y(i * paso) + 3} textAnchor="end" fontSize="9" fill="#6B665E">
            S/ {i * paso}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#g${id})`} />
      <path d={linea} fill="none" stroke="#D86820" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {puntos.map((p, i) =>
        i % cadaN === 0 ? (
          <text key={p.hora} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6B665E">
            {etiquetaHora(p.hora)}
          </text>
        ) : null
      )}
    </svg>
  )
}
