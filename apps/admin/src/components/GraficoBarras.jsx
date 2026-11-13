// Gráfico de barras simple en SVG puro — sin librería de charts nueva
// (apps/admin no tenía ninguna, ver package.json). Pensado para series
// cortas (día por día dentro de un rango filtrado), no para volúmenes
// grandes de puntos. Dibujado a tamaño real: el ancho sale del contenedor (useAncho) y el texto mide siempre 11 px.
import { useAncho } from '../lib/useAncho'

const PADDING_INFERIOR = 28
const PX_POR_ETIQUETA = 56

function formatoFechaCorta(fechaISO) {
  const [, mes, dia] = fechaISO.split('-')
  return `${dia}/${mes}`
}

export default function GraficoBarras({ datos, formatoValor = (v) => v, color = 'var(--color-acento)' }) {
  const [ref, ancho] = useAncho(600)
  if (!datos || datos.length === 0) {
    return <p className="text-sm text-gris">Sin datos para graficar.</p>
  }

  const alto = ancho >= 640 ? 240 : 180
  const max = Math.max(...datos.map((d) => d.valor), 1)
  const anchoBarra = ancho / datos.length
  const altoUtil = alto - PADDING_INFERIOR

  // Con muchos días, una etiqueta por barra se superpone: solo las que caben (≈56 px cada una), espaciadas parejo.
  const pasoEtiqueta = Math.max(1, Math.ceil(datos.length / Math.max(1, Math.floor(ancho / PX_POR_ETIQUETA))))

  return (
    <div ref={ref} className="w-full">
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block max-w-full" role="img" aria-label="Gráfico de tendencia">
        {datos.map((d, i) => {
          const altoBarra = max === 0 ? 0 : (d.valor / max) * altoUtil
          const x = i * anchoBarra
          return (
            <g key={d.fecha}>
              <rect
                x={x + anchoBarra * 0.15}
                y={altoUtil - altoBarra}
                width={anchoBarra * 0.7}
                height={Math.max(altoBarra, d.valor > 0 ? 2 : 0)}
                fill={color}
                rx="2"
              >
                <title>
                  {formatoFechaCorta(d.fecha)}: {formatoValor(d.valor)}
                </title>
              </rect>
              {i % pasoEtiqueta === 0 && (
                <text x={x + anchoBarra / 2} y={alto - 8} textAnchor="middle" fontSize="11" fill="var(--color-gris)">
                  {formatoFechaCorta(d.fecha)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
