# Perfiles del equipo en Bake OS

Una cuenta tiene uno o varios **perfiles**; su acceso es la **unión** de ellos. Migración `0054`. Lista y matriz de
acceso en `packages/domain/src/permisosPanel.ts` (la usan el menú, las rutas del panel, la API y los tests).

| Perfil | Ve | Alcance por local |
|---|---|---|
| **Administración** | Todo (Resumen, Métricas, Clientes completo, Catálogo, Atención, Origen de clientes, Mifact…) | Todos |
| **Caja** | Pedidos del día (los que se entregan hoy) y Stock | Solo su local (y los pedidos sin local, que puede «tomar») |
| **Venta digital** | Conversaciones, Pedidos, Nuevo pedido, Clientes reducido | **Sin filtro**: Cedros, Santa Marina y el delivery sin local |
| **Órdenes** | Órdenes (registrar e imprimir la hoja del día) | **Sin filtro**: todas las órdenes y todos los mayoristas |
| **Producción y empaque** | Producción, plan del día y hojas para imprimir | Solo su local |
| *Empleado (transitorio)* | Lo que ya tenían `adminalameda` y `adminsantamaria` | Solo su local |

Ajustes y Avisos son de todos. `usuarios_dashboard.rol` sigue existiendo pero queda **derivado** (`admin` si y solo si la
cuenta tiene Administración; lo sostienen un trigger y un `check`).

## Dónde se hace cumplir (tres capas)
1. **Menú y rutas del panel**: `puedeVerRuta` / `rutaInicial` (una ruta ajena devuelve a la pantalla de inicio del perfil).
2. **API**: `exigirPerfil(...)` en cada ruta del panel (403 `SIN_PERFIL_PARA_ESTA_ACCION`) y `veTodosLosLocalesEn` para decidir
   si una cuenta se queda en su local o elige. Probado por ruta × perfil en `apiPerfiles.test.ts`.
3. **Base de datos (RLS)**: funciones `acceso_a_sede`, `tiene_perfil_panel`, `usuario_recibe_aviso` y políticas de pedidos,
   líneas, clientes, conversaciones, stock, producción y avisos. Probado con roles reales en `rlsPerfiles.test.ts`.
   Una cuenta no puede cambiarse sus propios perfiles (la tabla no tiene permiso de escritura para el panel).

Cosas a saber:
- **Caja «solo del día»** es un filtro de la pantalla (entrega hoy, hora de Lima), no un candado en la base: «del día» puede ser
  por fecha de entrega o de creación y un candado ahí podría esconder pedidos reales.
- **Cambiar el estado de un pedido**: Venta digital (cualquiera, incluido el delivery sin local), Caja y Producción (solo
  los de su local). Órdenes registra y mira, no cambia estados. Un pedido sin local lo toman primero («Me lo quedo»).
- **Clientes reducido**: la base solo deja leer clientes con pedidos o conversaciones; los contactos de la agenda sin pedidos
  son de Administración. El perfil Órdenes además lee a todos los mayoristas (antes un empleado no veía a los importados).

## Avisos (campana y push)
Una sola regla en la base (`usuario_recibe_aviso`) para la campana y para el push.
- `mensaje_nuevo` / `esperando_persona`: Administración y Venta digital (todos los locales).
- `orden_nueva` (algo registrado en Órdenes o en Nuevo pedido) y `pedido_nuevo` (pedido para hoy del bot): solo cuentas con
  **aviso de órdenes** (`avisa_ordenes`), del local del aviso o sin local; Venta digital, Órdenes y Administración, de cualquiera.
  A quien registró la orden no se le manda el push.
- `pago_reportado` (el bot leyó una captura de pago): solo cuentas con **aviso de pagos** (`avisa_pagos`) que vean pedidos.

## Crear o cambiar una cuenta
1. Supabase → Authentication → Users → **Invite user** (el correo lleva a `dashboard.bakebrothers.pe` → «Define tu contraseña»).
2. Asignar perfiles (idempotente, por correo; ejemplo con un correo de muestra):
   ```sql
   insert into usuarios_dashboard (id, rol, sede_id, perfiles, nombre, avisa_ordenes, avisa_pagos)
   select u.id, 'operador', (select id from sedes where nombre = 'Cedros'), array['caja'], 'Caja Cedros', true, false
     from auth.users u where lower(u.email) = lower('correo@ejemplo.com')
   on conflict (id) do update set sede_id = excluded.sede_id, perfiles = excluded.perfiles, nombre = excluded.nombre,
        avisa_ordenes = excluded.avisa_ordenes, avisa_pagos = excluded.avisa_pagos;
   ```
   Sin fila en `usuarios_dashboard`, la persona define su contraseña pero ve «Tu cuenta no tiene acceso al panel».
3. Los correos reales del equipo **no** van al repo (viven en `BakeBrothers-datos-privados\perfiles-equipo\`).

## Retirar las cuentas anteriores
`adminalameda` y `adminsantamaria` conservan su acceso hasta que las cuentas nuevas estén probadas. Después se desactivan (sin
borrar nada) con el script `3_DESACTIVAR_cuentas_anteriores…` y se retira el perfil `empleado_temporal`.

## Orden de despliegue
1. Aplicar `0054` (y, aparte, `0055` de precios y códigos de Mifact) al Supabase real.
2. Correr el SQL que borra la cuenta de prueba y, ya invitadas las cuentas, el que asigna perfiles.
3. Redeploy de `apps/api` y deploy de `apps/admin`. Ninguno de los dos exige un orden estricto con la migración: la API y el
   panel leen la cuenta sin la columna `perfiles` si todavía no existe y la derivan del rol (nadie queda sin acceso).
