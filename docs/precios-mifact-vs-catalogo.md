# Precios: nuestro catálogo vs. Excel de Mifact (2026-10-30)

Generado con el importador de Mifact, solo lectura: **no se cambió ningún precio**. El catálogo es el de producción
(se verificó con una huella de las 86 filas de productos y tamaños).

**Lo que hay que decidir antes de actualizar nada:** Mifact tiene varios precios para el mismo producto, según el
almacén (CENTRAL, santa marina, TODOS). En **18 de estos 20** el precio de CENTRAL es igual al nuestro; lo que cambia es
el precio de *santa marina* o de *TODOS*. Nuestro sistema tiene un solo precio por producto para las dos sedes, así que
"usar el de Mifact" depende de qué almacén se tome como referencia (ver las preguntas al final).

| Nuestro producto | Producto de Mifact con el que calza | Precio actual (S/) | CENTRAL | santa marina | TODOS | Calce |
|---|---|---|---|---|---|---|
| Cheesecake de Fresa Familiar 24cm | Cheesecake fresa familiar | 89.90 | 89.90 | 79.90 | — | probable |
| Cheesecake de Fresa Individual | Cheesecake de fresa (porcion) | 9.90 | 9.90 | — | 8.90 | exacta |
| Cheesecake de Fresa Mini 18cm | Mini Cheesecake Fresa | 49.90 | 49.90 | 48.50 | — | probable |
| Cheesecake de Maracuyá Familiar 24cm | Cheesecake maracuya familiar | 89.90 | 89.90 | 79.90 | — | probable |
| Cheesecake de Maracuyá Individual | Cheesecake de maracuya (porcion) | 9.90 | 9.90 | — | 8.90 | exacta |
| Cheesecake de Maracuyá Mini 18cm | Mini Cheesecake Maracuya | 49.90 | 49.90 | 48.50 | — | probable |
| Cheesecake de Oreo Familiar 24cm | Cheesecake de oreo familiar | 99.90 | 99.90 | 89.90 | — | probable |
| Cheesecake de Oreo Individual | Cheesecake de oreo (porcion) | 10.90 | 10.90 | — | 9.90 | exacta |
| Cheesecake de Oreo Mini 18cm | Mini Cheesecake Oreo | 59.90 | 59.90 | 48.50 | — | probable |
| Crema Volteada Individual | Crema volteada (porcion) | 9.90 | 9.90 | — | 8.90 | exacta |
| Crema Volteada Mini 20cm | Mini Crema Volteada | 39.90 | 39.90 | 35.00 | — | probable |
| Croissant con pollo | Croissant con pollo | 13.90 | 13.90 | 14.00 | — | exacta |
| Jugo surtido | Jugo surtido | 11.00 | 11.00 | — | 12.00 | exacta |
| Mixto de jamón y queso | Mixto caliente de jamon y queso | 9.90 | 9.90 | 11.00 | — | probable |
| Pie de Limón Mini 18cm | Mini Pie de Limon | 49.90 | 49.90 | 48.50 | — | probable |
| Pie de Manzana Familiar 28cm | Pie de manzana familiar | 54.90 | 54.90 | 49.90 | — | probable |
| Pie de Manzana Mini 18cm | Mini Pie de Manzana | 35.90 | 35.90 | 29.90 | — | probable |
| Triple de palta, tomate y huevo | Triple de palta huevo y tomate | 12.90 | — | 12.00 | — | exacta |
| Triple de pollo, jamón y queso | Triple de jamon, queso y pollo (personal) | 11.90 | 11.90 | 9.00 | — | probable |
| Trufas | Caja de trufas | 7.90 | — | — | 25.90 | exacta |

## Dos filas que probablemente NO son una diferencia de precio

- **Trufas** (nuestro S/ 7.90) ↔ "Caja de trufas" de Mifact en TODOS a S/ 25.90: casi seguro es otra presentación
  (una caja más grande), no el mismo producto con otro precio.
- **Triple de palta, tomate y huevo** (S/ 12.90): Mifact solo trae una fila de *santa marina* (S/ 12.00), no hay fila de CENTRAL.

## Preguntas para el cliente

1. ¿Cuál almacén de Mifact es la referencia de precio de cada sede? (¿CENTRAL = Cedros y "santa marina" = Santa Marina?)
2. ¿Santa Marina vende de verdad más barato algunos productos (cheesecakes familiares, minis, pies, triples)? Si es así, hace
   falta un **precio por sede**, que hoy el sistema no tiene (es un cambio de modelo, no solo de datos).
3. ¿Qué significa el almacén "TODOS"? En las porciones individuales de cheesecake y crema volteada trae S/ 8.90 contra S/ 9.90 en CENTRAL.
