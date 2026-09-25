// Aviso sonoro corto para escaladas nuevas en /conversaciones — dos tonos
// breves generados con Web Audio API, sin ningún archivo de audio ni
// librería nueva. Un solo AudioContext reusado (crear uno por aviso es
// innecesario y algunos navegadores limitan cuántos podés tener vivos).
let audioContext = null

function obtenerAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) audioContext = new Ctor()
  return audioContext
}

function tono(ctx, frecuencia, inicioEn, duracionSeg) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frecuencia, inicioEn)
  // Rampa exponencial (no lineal) para que el ataque/caída no suene como un
  // "click" — 0.2 de ganancia máxima, corto y no invasivo.
  gain.gain.setValueAtTime(0.0001, inicioEn)
  gain.gain.exponentialRampToValueAtTime(0.2, inicioEn + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, inicioEn + duracionSeg)
  osc.start(inicioEn)
  osc.stop(inicioEn + duracionSeg)
}

// Los navegadores bloquean audio hasta que hay una interacción real del
// usuario con la página (click, tecla, touch) — el login ya cuenta como esa
// interacción, así que para cuando el operador llega a /conversaciones el
// AudioContext ya puede reproducir sin pasos extra. Si por lo que sea sigue
// suspendido (o el navegador no soporta AudioContext), falla en silencio:
// nunca debe romper la bandeja de conversaciones por esto.
export function reproducirAvisoEscalada() {
  try {
    const ctx = obtenerAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const ahora = ctx.currentTime
    tono(ctx, 880, ahora, 0.12)
    tono(ctx, 1108, ahora + 0.13, 0.16)
  } catch (err) {
    console.warn('No se pudo reproducir el aviso sonoro de escalada', err)
  }
}
