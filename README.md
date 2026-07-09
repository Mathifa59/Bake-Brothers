# 🧁 Bake Brothers — Pastelería Artesanal

Tienda virtual completa (solo frontend) para la pastelería artesanal **Bake Brothers**.
SPA construida con **React + Vite + Tailwind CSS v4**, con datos simulados — sin backend,
sin pagos reales.

## Cómo ejecutar

```bash
npm install
npm run dev
```

Abre http://localhost:5173

## Qué incluye

- **Inicio**: hero, ofertas de la semana, categorías, 8 destacados, cómo comprar, catering, testimonios.
- **Catálogo**: buscador, filtros (categoría, precio, disponibilidad, más vendidos, ofertas) y ordenamiento.
- **Detalle de producto**: galería, tamaños (Personal/Mediano/Grande), extras (dedicatoria, vela, decoración), info de preparación/conservación/porciones, relacionados y botón de WhatsApp.
- **Carrito**: página completa + panel lateral (drawer), cantidades, cupón `BAKE10` (10% dcto.), delivery gratis desde S/ 150.
- **Checkout en 5 pasos**: datos → entrega (recojo/delivery) → fecha y hora → pago (Yape, Plin, transferencia, tarjeta, contra entrega) → confirmación + pantalla de éxito.
- **Ofertas**, **Catering** (paquetes + formulario de cotización), **Sobre nosotros**, **Contacto** (con mapa simulado y botón flotante de WhatsApp).
- **Cuenta**: login, registro, recuperar contraseña, mi cuenta, mis pedidos (con estados) y detalle de pedido con línea de tiempo.

## Estructura

```
src/
├── components/    # Header, Footer, ProductCard, OfferCard, CategoryCard,
│                  # CartItem, CartDrawer, CheckoutSteps, Button, Input,
│                  # Badge, ProductGrid, SectionTitle, ProductImage, Logo…
├── context/       # CartContext (estado global del carrito)
├── data/          # mock.js — productos, categorías, ofertas, testimonios, pedidos
└── pages/         # Home, Catalogo, ProductoDetalle, Carrito, Checkout,
                   # Ofertas, Catering, Nosotros, Contacto, Auth, Cuenta
```

## Identidad visual

| Elemento | Valor |
|---|---|
| Fondo principal | `#F4F1F1` (blanco hueso) |
| Texto | `#16110D` (negro cálido) |
| Acento | `#F28C18` (naranja pastelero) |
| Tipografía display | Fraunces |
| Tipografía cuerpo | Albert Sans |

> Las imágenes principales (hero, categorías, catering y productos destacados) son
> fotografías referenciales de Pexels, optimizadas en `public/img/`. Los productos
> sin foto usan una composición de gradiente + emoji como placeholder: basta con
> agregarles un campo `foto` en `src/data/mock.js` para reemplazarla.
