// Gráfico de barras simple en SVG puro — sin librería de charts nueva
// (apps/admin no tenía ninguna, ver package.json). Pensado para series
// cortas (día por día dentro de un rango filtrado), no para volúmenes
// grandes de puntos.
const ALTO = 180
const ANCHO_VIEWBOX = 600
const PADDING_INFERIOR = 28

function formatoFechaCorta(fechaISO) {
  const [, mes, dia] = fechaISO.split('-')
  return `${dia}/${mes}`
}

export default function GraficoBarras({ datos, formatoValor = (v) => v, color = 'var(--color-acento)' }) {
  if (!datos || datos.length === 0) {
    return <p className="text-sm text-gris">Sin datos para graficar.</p>
  }

  const max = Math.max(...datos.map((d) => d.valor), 1)
  const anchoBarra = ANCHO_VIEWBOX / datos.length
  const altoUtil = ALTO - PADDING_INFERIOR

  // Con muchos días, mostrar una etiqueta por barra se superpone — se
  // muestra como mucho ~8 etiquetas, espaciadas parejo.
  const pasoEtiqueta = Math.max(1, Math.ceil(datos.length / 8))

  return (
    <svg viewBox={`0 0 ${ANCHO_VIEWBOX} ${ALTO}`} className="w-full" role="img" aria-label="Gráfico de tendencia">
      {datos.map((d, i) => {
        const alto = max === 0 ? 0 : (d.valor / max) * altoUtil
        const x = i * anchoBarra
        return (
          <g key={d.fecha}>
            <rect
              x={x + anchoBarra * 0.15}
              y={altoUtil - alto}
              width={anchoBarra * 0.7}
              height={Math.max(alto, d.valor > 0 ? 2 : 0)}
              fill={color}
              rx="2"
            >
              <title>
                {formatoFechaCorta(d.fecha)}: {formatoValor(d.valor)}
              </title>
            </rect>
            {i % pasoEtiqueta === 0 && (
              <text
                x={x + anchoBarra / 2}
                y={ALTO - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--color-gris)"
              >
                {formatoFechaCorta(d.fecha)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
