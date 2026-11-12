/**
 * Prepara una foto para subirla al catálogo: la achica (lado largo máx. 1280 px), respeta la orientación de la cámara y la
 * guarda como WebP; si pesa más de `maxBytes` baja la calidad y, si hace falta, el tamaño, hasta que quepa. El resultado
 * siempre pesa menos que el límite del bucket de Supabase Storage (1 MB). Corre en el navegador (canvas).
 */
export const MAX_BYTES_FOTO = 900 * 1024 // margen bajo el 1 MB del bucket

const aBlob = (canvas, tipo, calidad) => new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad))

export async function comprimirImagen(archivo, { maxLado = 1280, maxBytes = MAX_BYTES_FOTO } = {}) {
  if (!archivo?.type?.startsWith('image/')) throw new Error('El archivo no es una imagen.')
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  try {
    let lado = maxLado
    let calidad = 0.82
    for (let intento = 0; intento < 12; intento++) {
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
      const ancho = Math.max(1, Math.round(bitmap.width * escala))
      const alto = Math.max(1, Math.round(bitmap.height * escala))
      const canvas = document.createElement('canvas')
      canvas.width = ancho
      canvas.height = alto
      canvas.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto)
      // Safari antiguo no sabe WebP y devuelve PNG: en ese caso se usa JPEG.
      let blob = await aBlob(canvas, 'image/webp', calidad)
      if (!blob || blob.type !== 'image/webp') blob = await aBlob(canvas, 'image/jpeg', calidad)
      if (blob && blob.size <= maxBytes) return { blob, ancho, alto, tipo: blob.type }
      if (calidad > 0.55) calidad -= 0.1
      else lado = Math.round(lado * 0.8)
    }
    throw new Error('No se pudo reducir la foto a menos de 1 MB. Prueba con otra.')
  } finally {
    bitmap.close?.()
  }
}

export const extensionDeTipo = (tipo) => (tipo === 'image/jpeg' ? 'jpg' : 'webp')
