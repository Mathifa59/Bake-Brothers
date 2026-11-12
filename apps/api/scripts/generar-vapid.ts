/**
 * Genera el par de claves VAPID de las notificaciones push (Web Push). Se corre UNA vez; el resultado va a las
 * variables de entorno de la API en Coolify y NO se guarda en el repo ni se manda por chat:
 *
 *   VAPID_PUBLIC_KEY=...    (la que el panel le pide a la API; no es secreta)
 *   VAPID_PRIVATE_KEY=...   (SECRETA)
 *   VAPID_SUBJECT=https://dashboard.bakebrothers.pe   (opcional; una URL https o un mailto:)
 *
 * Si se regeneran, los celulares que ya activaron avisos tienen que volver a activarlos (la clave pública cambió).
 *
 *   pnpm --filter @bakebrothers/api vapid:generar
 */
import { generateVAPIDKeys } from 'web-push'

const { publicKey, privateKey } = generateVAPIDKeys()
console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log('VAPID_SUBJECT=https://dashboard.bakebrothers.pe')
