# Catálogo real Bake Brothers — referencia para migración 0006

Extraído de los documentos oficiales del cliente (Carta Interna v1.1 actualizada
15/09/2026, Guía de Conocimiento de Producto v5.1, Guía Comercial de
Promociones/Combos v2.0, Guía de Agendamiento de Catering v2.0, Ficha de
Información). Esta es la fuente de verdad — no inventar ni aproximar ningún
precio, ingrediente o alérgeno que no esté aquí. Si algo no está cubierto,
dejarlo pendiente y señalarlo, no asumir.

---

## 0. Datos generales del negocio

**Sedes:**
| Sede | Dirección | Horario |
|---|---|---|
| Cedros | Av. Alameda los Horizontes 820, Chorrillos | Lun-vie 7:30am-8:30pm / domingo 10am-8:30pm |
| Santa Marina | Av. Defensores del Morro 2270 | Lun-domingo 12pm-10pm |

- WhatsApp: cada sede tiene su propio número (el 912944096 de la ficha es solo el número principal/de referencia — pendiente obtener el número específico de cada sede para configurar el webhook).
- Instagram/Facebook: `Bakebrothers.pe` — cuenta única de marca, no por sede.
- Correo de contacto: sara.leon@bakebrothers.pe
- Escalar a humano (persona/área): **Ventas**
- Zonas de delivery para pedidos de TIENDA (no catering): Chorrillos, Surco, Miraflores, San Isidro, Villa el Salvador, San Juan de Miraflores, La Victoria, Jesús María, Lince.
- Productos estrella: caja de alfajores mix x18, caja de alfajores con manjarblanco x18, cuchareables de 16oz, empanadas BigBro.
- Productos de mayor margen / a posicionar: tortas familiares (chocolate, red velvet, carrot cake, crema volteada, pie de limón, pie de manzana).
- Personalización: dedicatorias hasta 8 palabras sin costo; toppers "feliz cumpleaños" desde S/7.90. Apenas el cliente mande una imagen de referencia de diseño de torta → derivar a un asesor, no prometer el diseño.
- Datos que el bot debe pedir en pedido de tienda: nombre, producto, cantidad, fecha; + específicos: jugos/helados (con azúcar / sin azúcar), empanadas (calientes / sin calentar).
- **Confirmación de pedido de TIENDA = pago total** (no adelanto — distinto del catering, ver sección 10).
- Métodos de pago aceptados en tienda: Yape, transferencia, **link de pago** (herramienta sin identificar — preguntar al cliente qué servicio usan; si es una pasarela con webhook, podría habilitar confirmación automática de pago más adelante).
- Escalar a humano también en: reclamos, reembolsos, problemas con el pago, cliente molesto, delivery perdido/retrasado, tortas personalizadas.
- Tono del bot: cercano, con emojis, puede tutear. Nunca usar: "oki", "oka", "porfis".
- Estados de pedido según el cliente: Nuevo → Confirmado → En preparación → Listo → En delivery/Entregado → Cierre de chat.
- Notificaciones automáticas requeridas (van a la lista de plantillas de Meta a aprobar en Semana 2): confirmación de pedido, confirmación de pago, recordatorio antes de la entrega, pedido en preparación, pedido listo/en delivery, pedido entregado, solicitud de reseña.

---

## 1. Tortas y Kekes

### Carrot Cake
- Qué es: torta de zanahoria especiada, esponjosa y firme, con pasas, pecanas y frosting.
- Ingredientes: harina, zanahoria, pasas, pecanas, azúcar, aceite, canela, huevos, agua.
- Alérgenos: gluten, huevo, lácteos, frutos secos (pecanas).
- Relleno/cobertura: frosting de queso crema, margarina, azúcar impalpable, limón.
- Respuesta rápida: "Torta de zanahoria con canela, pasas y pecanas, cubierta con frosting de queso crema."
- Tamaños y precios: Familiar 24cm S/89.90 · Mini 16cm S/49.90.

### Torta de Chocolate con Manjar
- Qué es: bizcocho de chocolate esponjoso, relleno con manjar, terminado con fudge.
- Ingredientes: harina, cocoa, azúcar, aceite, huevos, leche, agua, vainilla, vinagre.
- Alérgenos: gluten, huevo, lácteos.
- Relleno/cobertura: manjar y fudge.
- Respuesta rápida: "Bizcocho de chocolate relleno con manjar y terminado con fudge."
- Tamaños y precios: Familiar 24cm S/79.90 · Mini 16cm S/48.50.

### Red Velvet
- Qué es: bizcocho rojizo con yogurt de vainilla, esponjoso y firme.
- Ingredientes: harina, yogurt de vainilla, margarina, huevos, azúcar, polvo de hornear, bicarbonato, colorante.
- Alérgenos: gluten, huevo, lácteos.
- Relleno/cobertura: frosting de queso crema, margarina, azúcar impalpable, limón.
- Respuesta rápida: "Es un bizcocho rojo, suave y esponjoso, elaborado con yogurt de vainilla."
- Tamaños y precios: Familiar 24cm S/89.90 · Mini 16cm S/49.90.

### Torta Selva Negra *(en Carta Interna, no en la Guía de Producto — pendiente descripción/ingredientes/alérgenos, confirmar con el cliente)*
- Tamaños y precios: Familiar 24cm S/89.90 · Mini 16cm S/49.90.

### Torta de Alfajor *(solo Carta Interna — pendiente descripción/ingredientes)*
- Solo Mini 16cm S/48.50 (sin presentación familiar).

### Torta Tres Leches Chocolate *(distinta del "Tres Leches de Chocolate" en porción individual de la sección 2 — pendiente confirmar si es el mismo producto en formato torta o algo distinto)*
- Solo Mini 16cm S/48.50 (sin presentación familiar).

### Pionono Familiar
- Solo Familiar 20cm S/39.90 (sin mini). Ver ficha de producto del Pionono en sección 3 (versión "caja x16").

### Mil Hojas
- Familiar 1kg S/49.90 (sin mini; se vende por kg, no por porciones).

---

## 2. Postres (porción individual/personal, mini y familiar)

### Tres Leches de Vainilla
- Ingredientes: huevos, azúcar, harina, maicena, aceite, manjar, mezcla de tres leches, chantilly.
- Alérgenos: gluten, huevo, lácteos.
- Respuesta rápida: "Bizcocho humedecido con tres leches, con manjar y chantilly."
- Precios (como "Torta tres leches" en Carta Interna): Familiar 24cm S/79.90 · Mini 16cm S/48.50.
- Porción individual: S/8.90 (Carta Interna, "Torta tres leches").

### Tres Leches de Chocolate
- Ingredientes: huevos, azúcar, harina, maicena, aceite, manjar, tres leches de chocolate, chantilly, fudge.
- Alérgenos: gluten, huevo, lácteos.
- Respuesta rápida: "Tres leches de chocolate con manjar, chantilly y fudge."
- Porción individual: S/8.90 (Carta Interna, "Torta tres leches chocolate").

### Crema Volteada
- Ingredientes: huevos, leche condensada, leche evaporada, azúcar.
- Alérgenos: huevo, lácteos.
- Presentaciones: Mini 20cm (6-10 porciones) · Familiar 26cm (10-20 porciones).
- Respuesta rápida: "Crema volteada clásica de huevo y leche, con caramelo."
- Precios: Familiar 26cm S/69.90 · Mini 20cm S/39.90 · Porción individual S/9.90.

### Pie de Limón
- Ingredientes: galleta de vainilla, margarina, limón, leche condensada, huevos, azúcar, cremor tártaro.
- Alérgenos: huevo, lácteos (posible gluten por la galleta, confirmar ficha del insumo).
- Presentaciones: Mini 18cm (6-10 porciones) · Familiar 28cm (12-24 porciones).
- Respuesta rápida: "Base de galleta, relleno cremoso de limón y merengue."
- Precios: Familiar 28cm S/79.90 · Mini 18cm S/49.90 · Porción individual S/8.90.

### Pie de Manzana
- Ingredientes: masa quebrada, manzana, azúcar, canela, harina (pintado con huevo).
- Alérgenos: gluten, huevo.
- Presentaciones: Mini 18cm (6-10 porciones) · Familiar 28cm (12-24 porciones).
- Respuesta rápida: "Pie de manzana con canela, masa dorada y relleno frutal."
- Precios: Familiar 28cm S/54.90 · Mini 18cm S/35.90 · Porción individual S/6.90.

### Cheesecake de Fresa
- Ingredientes: queso crema, leche condensada, crema de leche, colapiz, yogurt de fresa, base de galleta, fresa.
- Alérgenos: lácteos (posible gluten por la base, confirmar).
- Presentaciones: Mini 18cm (6-10 porciones) · Familiar 24cm (12-20 porciones).
- Respuesta rápida: "Cheesecake cremoso de fresa sobre base de galleta, con fresa y chantilly."
- Precios: Familiar 24cm S/89.90 · Mini 18cm S/49.90 · Porción individual S/9.90.

### Cheesecake de Maracuyá
- Ingredientes: queso crema, leche condensada, crema de leche, colapiz, zumo de maracuyá, base de galleta, jalea.
- Alérgenos: lácteos (posible gluten por la base, confirmar).
- Presentaciones: Mini 18cm (6-10 porciones) · Familiar 24cm (12-20 porciones).
- Respuesta rápida: "Cheesecake cremoso de maracuyá con base de galleta, jalea y chantilly."
- Precios: Familiar 24cm S/89.90 · Mini 18cm S/49.90 · Porción individual S/9.90.

### Cheesecake de Oreo
- Ingredientes: queso crema, leche condensada, crema de leche, colapiz, crema de Oreo, base de galleta.
- Alérgenos: lácteos (posible gluten por la galleta/Oreo, confirmar).
- Presentaciones: Mini 18cm (6-10 porciones) · Familiar 24cm (12-20 porciones).
- Respuesta rápida: "Cheesecake cremoso de Oreo con base de galleta, chantilly y chocolate blanco."
- Precios: Familiar 24cm S/99.90 · Mini 18cm S/59.90 · Porción individual S/10.90.

*(Nota general de alergias: "Ante alergias severas, intolerancias específicas o consultas 'libre de', no confirmar sin validación adicional" — el bot debe escalar, nunca confirmar por su cuenta.)*

---

## 3. Postres en Caja

### Pionono
- Qué es: bizcocho suave enrollado, relleno con manjar.
- Ingredientes: huevos, azúcar, maicena, vainilla, leche, manjar, manteca.
- Alérgenos: huevo, lácteos.
- Presentación: caja x16 unidades (~4cm c/u). Precio: S/11.90 (cajita, ver sección 7).

### Brownie
- Qué es: brownie con cocoa, chocolate bitter y castañas.
- Ingredientes: huevos, harina, cocoa, castañas, azúcar rubia, azúcar blanca, chocolate bitter.
- Alérgenos: gluten, huevo, frutos secos (castañas).
- Presentación: caja x16 unidades (~4cm c/u). Precio: S/11.90 (cajita, ver sección 7).

---

## 4. Alfajores ⭐ (producto estrella)

- Qué es: alfajor de maicena con galletas suaves, varios rellenos.
- Ingredientes: manteca, margarina, harina, azúcar impalpable, maicena, esencia de vainilla.
- Alérgenos: gluten; posibles lácteos/frutos secos según relleno (confirmar por insumo compuesto).
- Rellenos disponibles: manjar, lúcuma, pistacho, Nutella. Chocoalfajor = manjar + cubierto en chocolate.
- Presentaciones: caja x10 o x18 (~4cm c/u) · Mini 16cm (6-10 porciones, 4 capas) · Familiar 24cm (12-20 porciones, 4 capas).
- Precios por caja (ver sección 7 para detalle completo por sabor).

---

## 5. Empanadas "BigBro" (10 variedades — línea de venta retail individual)

Todas comparten la misma masa base: manteca, margarina, azúcar rubia, harina de pastelería, agua, sal (alérgeno: gluten por la masa en todas).

| Producto | Relleno | Alérgenos adicionales | Precio |
|---|---|---|---|
| Empanada de Pollo | Filete de pollo, cebolla, aceite, sal, pimienta, ajo, sillao con champiñones, perejil, ají amarillo | Sillao: confirmar ficha | S/7.90 (como "Pollo en trozos") |
| Empanada de Carne | Carne molida, cebolla, aceite, sal, pimienta, orégano | — | S/7.90 (como "Carne tradicional") |
| Empanada de Jamón y Queso | Jamón, queso dambo | Lácteos; jamón: confirmar ficha | S/8.90 |
| Empanada de Ají de Gallina | Pechuga de pollo, ajo molido, ají amarillo, cebolla, aceite, comino, pimienta, sal, pan duro, leche evaporada, huevo | Huevo, lácteos | S/8.90 |
| Empanada Cabanozzi | Cabanozzi, queso dambo, jamón | Lácteos; cabanozzi/jamón: confirmar ficha | S/8.90 (como "Jamón, queso y cabanossi") |
| Empanada Hawaiana | Jamón, queso dambo, piña, orégano | Lácteos; jamón: confirmar ficha | S/8.90 |
| Empanada Carnívora | Chorizo, hot dog, tocino, lomito ahumado | Embutidos: confirmar fichas | S/8.90 |
| Empanada 3 Quesos | Queso dambo, queso mozzarella, queso fresco, orégano | Lácteos | S/8.90 |
| Empanada de Lomo | Wachalomo, aceite, ajo molido, sal, pimienta, comino, cebolla, sillao | Sillao: confirmar ficha | S/8.90 (como "Lomo saltado") |
| Empanada de Pollo con Champiñón | Filete de pollo, champiñón, sal, pimienta, comino, aceite, leche evaporada, harina de trigo, ajo molido, ajonjolí | Gluten, lácteos, ajonjolí | S/8.90 |

**Nota de ambigüedad a confirmar con el cliente:** la Guía de Producto nombra estas 10 empanadas con un nombre, y la Carta Interna las lista bajo "Empanadas BigBro" con nombres ligeramente distintos (ej. "Lomo saltado" vs. "Empanada de Lomo"). Asumí que son el mismo producto 1 a 1 en el orden en que aparecen — pero no está confirmado explícitamente en ningún documento. Además, los combos "Pack 6/12 empanadas" y "Pack Petitbro" (mini empanadas) parecen referirse a esta misma familia de sabores en presentación grande/mini, pero tampoco está dicho explícitamente. Verificar antes de dar por cerrado el catálogo.

---

## 6. Salados — Sándwiches (Carta Interna)

| Producto | Precio |
|---|---|
| Triple de pollo, jamón y queso | S/11.90 |
| Triple de palta, tomate y huevo | S/12.90 |
| Croissant con pollo | S/13.90 |
| Croissant mixto | S/12.90 |
| Ciabatta con pollo | S/9.90 |
| Mixto de jamón y queso | S/9.90 |

*(Sin ficha de ingredientes/alérgenos en la Guía de Producto — solo aparecen en Carta Interna con precio. Pendiente si se necesita detalle para RAG.)*

---

## 7. Cajitas dulces (Carta Interna)

| Alfajor (caja) | 10 unidades | 18 unidades |
|---|---|---|
| Con manjar | S/6.90 | S/11.90 |
| Con pistacho | S/12.90 | S/22.90 |
| Con lúcuma | S/11.90 | S/19.90 |
| Con Nutella | S/12.90 | S/22.90 |
| Mix | S/12.90 | S/22.90 |

| Otras cajitas | Contenido | Precio |
|---|---|---|
| Chocoalfajor | 8 unidades | S/9.90 |
| Trufas | 4 unidades | S/7.90 |
| Brownies | 16 unidades | S/11.90 |
| Piononos | 16 unidades | S/11.90 |
| Mix lite | 9 unidades | S/7.90 |

*(Nota: "Cuchareables" es producto estrella mencionado en la ficha — S/15.90 en Carta Interna, sabores: chocolate con manjar blanco, chocolate con manjar de lúcuma, chocolate con Nutella y chocolate Princesa, alfajor. No tiene ficha de producto propia en la Guía de Conocimiento — solo aparece en Carta Interna, sección Postres.)*

---

## 8. Postres en porción, bebidas, jugos, helados (Carta Interna)

**Postres en porción individual:**
| Producto | Precio |
|---|---|
| Cheesecake de Oreo | S/10.90 |
| Cheesecake de fresa | S/9.90 |
| Cheesecake de maracuyá | S/9.90 |
| Torta de chocolate | S/8.90 |
| Torta carrot cake | S/9.90 |
| Torta red velvet | S/9.90 |
| Pie de manzana | S/6.90 |
| Pie de limón | S/8.90 |
| Torta tres leches | S/8.90 |
| Torta tres leches chocolate | S/8.90 |
| Crema volteada | S/9.90 |
| Tartaleta de frutas (fresas / fresas con arándanos, sujeto a stock) | S/7.90 |
| Cupcakes artesanal | S/8.90 |
| Mil hojas 200g | S/10.90 |
| Mil hojas 500g | S/22.90 |
| Cuchareable | S/15.90 |

**Bebidas y helados:**
| Producto | Precio |
|---|---|
| Agua mineral | S/4.00 |
| Inka Kola normal o zero | S/5.00 |
| Coca-Cola normal o zero | S/5.00 |
| Café americano | S/6.00 |
| Refreshers (fresa, arándanos, aguaymanto, mango, maracuyá) | S/9.90 |
| Frappé | S/13.90 |
| Frappé de Oreo | S/15.90 |
| Infusiones | S/4.00 |
| Kero 300ml | S/5.00 |
| Jugos (fresa, piña, mango, papaya, lúcuma) | S/9.00 |
| Jugo surtido | S/11.00 |
| Jugo + leche (adicional) | +S/2.00 |
| Helado 1 bola (fresa, chocolate, vainilla) | S/7.00 |
| Helado 2 bolas | S/12.00 |

---

## 9. Combos y Promociones (13 vigentes — 2 canales de venta)

**Regla principal (aplica a todos): "Solo ofrecer promociones vigentes bajo las condiciones indicadas. No modificar productos, precios ni condiciones sin autorización."**

| Combo | Contenido | Normal | Promo | Dto. | Cambios | Condición | Canal |
|---|---|---|---|---|---|---|---|
| Pack Tres Delicias | 1 milhojas manjar 200g + 1 caja alfajores manjar (18u) + 1 caja brownies castañas (16u) | S/34.70 | S/30.90 | 11.0% | No | Sujeto a stock | Presencial/WhatsApp |
| Pie Pack | 1 porción pie de manzana + 1 porción pie de limón | S/15.80 | S/12.90 | 18.4% | No | Sujeto a stock | Presencial/WhatsApp |
| Pack Petitbro | 12 mini empanadas variadas | S/24.00 | S/19.90 | 17.1% | No | Sabores sujetos a stock | Presencial/WhatsApp |
| Pack 6 empanadas | 6 empanadas grandes | S/53.40 | S/49.90 | 6.6% | No | Sabores sujetos a stock | Presencial/WhatsApp |
| Pack 12 empanadas | 12 empanadas grandes | S/106.80 | S/79.90 | 25.2% | No | Sabores sujetos a stock | Presencial/WhatsApp |
| Pack Postres de Locura | 1 crema volteada + 1 pie de manzana + 1 pie de limón + 1 torta de chocolate (porciones) | S/33.60 | S/28.90 | 14.0% | No | Sujeto a stock | Presencial/WhatsApp |
| Combo Ideal | 1 porción torta de chocolate + 1 café americano | S/14.90 | S/13.90 | 6.7% | Sí | Torta: elegir entre carrot cake, chocolate, red velvet | Presencial |
| Combo Perfecto | 1 frappé de Oreo + 1 empanada grande | S/24.80 | S/21.80 | 12.1% | No | Empanada: sabor sujeto a stock | Presencial |
| Combo para ti | 1 tartaleta de frutas + 1 refresher | S/17.80 | S/15.90 | 10.7% | No | Refresher: sabor sujeto a stock | Presencial |
| Combo Horneamos con amor | 15 mini empanadas variadas + 1 caja alfajores manjar (18u) + 1 caja brownies (16u) + 1 caja piononos (16u) + 1 milhojas 500g | S/85.80 | S/69.90 | 18.5% | Sí — milhojas 500g reemplazable por 11 mini empanadas más | Mini empanadas: sabor sujeto a stock | Presencial/WhatsApp |
| Tortipack | 1 porción torta chocolate + 1 porción carrot cake | S/18.80 | S/16.00 | 14.9% | Sí — puede llevar ambos del mismo sabor (chocolate o carrot) | Sujeto a stock | Presencial/WhatsApp |
| Pack Trio Cheesebake | 1 porción cheesecake fresa + 1 maracuyá + 1 Oreo | S/30.70 | S/25.90 | 15.6% | Sí — puede llevar 2 del mismo sabor, excepto repetir Oreo | Sujeto a stock | Presencial/WhatsApp |
| Pack Trio Imperdible | 1 caja alfajores manjar (18u) + 1 caja brownies (16u) + 1 caja piononos (16u) | S/35.70 | S/32.90 | 7.8% | Sí — máximo 2 del mismo sabor | Sujeto a stock | Presencial/WhatsApp |

*Nota: el % de descuento se recalcula si cambia el precio normal o promo — no hardcodear el porcentaje, derivarlo de los dos precios.*

---

## 10. Reglas de Catering (semáforo)

**Sistema: 🟢 VERDE (agendar) — cumple estándar, cotiza/cobra/registra. 🟡 AMARILLO (consultar) — no prometer, consultar a Ventas Digital. 🔴 ROJO (no confirmar) — fuera de estándar, no rechazar, escalar excepción.**

**Reglas no negociables (aplican a todas las categorías):**
- Domingo = **consultar siempre**, sin importar categoría, aunque cumpla mínimo y anticipación.
- Pedido AGENDADO = adelanto mínimo 50% o pago total verificado (nota: distinto del "pago total" que exige la ficha para pedidos de TIENDA — esto es específico de catering).
- Cliente quiere pagar al recoger → consultar antes de aceptar.
- Máximo estándar: 500 bocaditos en una misma franja de 1 hora — si se supera, consultar capacidad.
- Producto con AUTO OBLIGATORIO: nunca ofrecer moto, aunque el trayecto sea corto.
- Pedido fuera de plazo: no decir "no se puede" de inmediato, consultar antes de perder la venta.

**Salados:**
| Producto | Mínimo | Hoy | Mañana/anticipación | Movilidad |
|---|---|---|---|---|
| Enrollados (hot dog / jamón y queso) | 25 und | No confirmar (no sale mismo día) | Hasta 12pm → mañana temprano; hasta 8:30pm → desde ~12pm | Moto |
| Pizzitas | 25 und | No confirmar | Misma regla que enrollados | Moto |
| Tequeños (mixtos/queso) | 25 und | No confirmar | Misma regla que enrollados | Moto |
| Hojarasca con ají de gallina | 25 und | No confirmar | Misma regla que enrollados | **Auto** (frágil) |
| Causa rellena | 50 und | No confirmar (consultar si piden excepción) | 24h obligatorias | **Auto** (frágil) |
| Brochetas | 50 und | No confirmar (consultar si piden excepción) | 24h obligatorias | Moto |
| Piernitas de pollo | 50 und | No confirmar (consultar si piden excepción) | 24h obligatorias | Moto |

**Dulces, Mini Empanadas y Sanguchitos:**
| Producto | Mínimo | Hoy | Mañana/anticipación | Movilidad |
|---|---|---|---|---|
| Dulces de stock (alfajorcitos y variantes, piononos, trufitas, mini milhojas, brownies) | 20 und | Consultar (validar stock; desde 100u consultar antes de prometer) | Se puede agendar día siguiente y posteriores | Moto |
| Dulces frágiles (mini tartaletas, mini pies, mini cheesecakes) | 25 und | No confirmar (excepción → consultar) | Hasta 12pm → mañana; hasta 8:30pm → desde ~12pm | **Auto** (frágil) |
| Mini empanadas (todos los sabores) | 12 und | Consultar según cantidad/sabores; desde 100u confirmar stock con Tienda | Puede agendarse con anticipación | Moto |
| Petit panes (todos los sabores) | 12 und | Consultar disponibilidad pan+relleno | Se puede agendar día siguiente | Moto |
| Mini croissant pollo/mixto | 50 und | Consultar (solo con disponibilidad confirmada) | Hasta 12pm → temprano; después → ~11am-12pm | Moto |
| Butifarras | 50 und | No confirmar (excepción → consultar) | 24h obligatorias | Moto |
| Triples (todas variedades) | 25 und por variedad | Consultar disponibilidad | Puede confirmarse hasta 8:30pm para el día siguiente | Moto |

**Movilidad — tarifas:**
- Moto Chorrillos: Zona 1 S/5 · Zona 2 S/6 · Zona 3 S/7 · Zona 4 S/7 · Zona 5 S/8 (mapa de zonas propio, no incluido aquí — pendiente si se necesita el detalle geográfico).
- Moto fuera de Chorrillos (Surco y otros): cotizar InDriver + S/2.
- Auto (cualquier distrito): cotizar InDriver + S/5.
- Auto obligatorio: nunca moto, aunque sea corto trayecto. Alternativas: auto, recojo en tienda, o movilidad propia del cliente.

**Horario de despacho:** Lun/Mié/Vie/Sáb desde 7am · Mar/Jue desde 7:30-8am según disponibilidad · Domingo desde 11am (y aun así, consultar siempre).

**Flujo operativo interno (para contexto del bot, no para automatizar):** Validar → Cotizar (producto+movilidad) → Comprobante (boleta/factura) → Cobrar (50% mínimo o total) → Registrar en Drive → Ticket si aplica (piononos, tartaletas, mini pies, trufitas, mini cheesecakes sí necesitan ticket; alfajorcitos, mini milhojas, brownies no; todos los salados sí, mini empanadas no; todos los sanguchitos sí). El ticket se imprime 30 min antes de la salida.

---

## Notas finales para quien construya la migración 0006

1. Todo lo marcado como "pendiente"/"confirmar" arriba (Torta Selva Negra, Torta de Alfajor, Torta Tres Leches Chocolate sin ficha propia, mapeo BigBro↔Guía de Producto, sándwiches sin alérgenos, zonas geográficas de moto en Chorrillos) debería quedar así en la base — no rellenar con datos inventados.
2. Los precios de "porción individual" (sección 8) y los de "Familiar/Mini" (secciones 1 y 2) son presentaciones distintas del mismo producto base — modelarlos como tamaños adicionales (`product_sizes`), no como productos separados.
3. Las categorías de catering (secciones 10) son ítems de venta por catering, mayormente distintos en nombre a los de tienda (ej. "Dulces de stock" no es un producto de tienda) — probablemente necesiten su propia tabla de productos de catering o un flag `disponible_catering` en el producto de tienda equivalente cuando aplique. Usar criterio; si hay duda, preguntar antes de decidir la estructura.
