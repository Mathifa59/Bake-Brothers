import {
  LayoutGrid,
  Target,
  ShoppingBag,
  Factory,
  Package,
  Users,
  Headset,
  MessageCircle,
  TrendingUp,
  PieChart,
  ShieldCheck,
  PlayCircle,
  Boxes,
  Megaphone,
  CalendarDays,
  BookOpen,
  LineChart,
  UserCog,
  Workflow,
  FlaskConical,
} from 'lucide-react'

/**
 * Menú de secciones de Bake OS, en dos grupos: las que ya funcionan con datos
 * reales, y las del prototipo del cliente que necesitan información suya
 * antes de poder construirse — esas llevan un lugar en el menú marcado
 * "Pronto" y una pantalla que dice QUÉ falta, sin ningún dato inventado.
 */
export const SECCIONES_ACTIVAS = [
  { ruta: '/resumen', etiqueta: 'Resumen', icono: LayoutGrid },
  { ruta: '/control-tower', etiqueta: 'Control Tower', icono: Target, conAlertas: true },
  { ruta: '/pedidos', etiqueta: 'Pedidos', icono: ShoppingBag },
  { ruta: '/produccion', etiqueta: 'Producción', icono: Factory },
  { ruta: '/stock', etiqueta: 'Stock', icono: Package },
  { ruta: '/clientes', etiqueta: 'Clientes', icono: Users },
  { ruta: '/atencion', etiqueta: 'Atención', icono: Headset },
  { ruta: '/conversaciones', etiqueta: 'Conversaciones', icono: MessageCircle },
  { ruta: '/metricas', etiqueta: 'Métricas', icono: TrendingUp },
  { ruta: '/atribucion', etiqueta: 'Atribución', icono: PieChart },
  // Solo admin: prueba el cerebro real del bot sin WhatsApp (ver pages/Simulador.jsx).
  { ruta: '/simulador', etiqueta: 'Simulador', icono: FlaskConical, soloAdmin: true },
]

export const SECCIONES_PROXIMAMENTE = [
  {
    ruta: '/manifiesto',
    etiqueta: 'Manifiesto',
    icono: ShieldCheck,
    subtitulo: 'Cómo trabajamos',
    descripcion: 'El documento vivo con los valores y las normas de trabajo del equipo.',
    necesita: 'El texto del manifiesto (valores, trato al cliente, rutinas), redactado por Javier.',
  },
  {
    ruta: '/modo-equipo',
    etiqueta: 'Modo Equipo',
    icono: PlayCircle,
    subtitulo: 'Guía paso a paso',
    descripcion: 'Las rutinas del día por rol: apertura, relevo, pre-pico y cierre.',
    necesita: 'Los procesos de cada momento del día en cada sede, con responsables y tiempos.',
  },
  {
    ruta: '/inventario',
    etiqueta: 'Inventario',
    icono: Boxes,
    subtitulo: 'Stock y merma',
    descripcion: 'Valor del stock, merma semanal y reposición.',
    necesita:
      'Los insumos con su costo, conteos periódicos y el registro de merma. Hoy el stock solo marca disponible o agotado por producto y sede (sección Stock).',
  },
  {
    ruta: '/marketing',
    etiqueta: 'Marketing',
    icono: Megaphone,
    subtitulo: 'Campañas y contenido',
    descripcion: 'Campañas activas, su calendario y su resultado.',
    necesita: 'Las campañas planificadas, su presupuesto y los canales donde se invierte.',
  },
  {
    ruta: '/contenido',
    etiqueta: 'Contenido',
    icono: CalendarDays,
    subtitulo: 'Calendario editorial',
    descripcion: 'Cada pieza con objetivo, responsable, fecha y canal.',
    necesita: 'Quién crea y publica cada pieza, en qué canales y con qué frecuencia.',
  },
  {
    ruta: '/academia',
    etiqueta: 'Academia',
    icono: BookOpen,
    subtitulo: 'Aprender haciendo',
    descripcion: 'Microlecciones y checklists para que cada persona ejecute su parte.',
    necesita: 'Las lecciones y checklists, y a quién se asigna cada una.',
  },
  {
    ruta: '/resultados',
    etiqueta: 'Resultados',
    icono: LineChart,
    subtitulo: 'Operación · ventas · caja',
    descripcion: 'Si el negocio funciona mejor y depende menos de una sola persona.',
    necesita: 'Definir con Javier las metas y los indicadores (por ejemplo horas de intervención y cierre de caja).',
  },
  {
    ruta: '/equipo',
    etiqueta: 'Equipo',
    icono: UserCog,
    subtitulo: 'Roles y permisos',
    descripcion: 'Cada persona ve lo que necesita para hacer bien su parte.',
    necesita: 'La lista de personas, los roles nuevos y qué ve cada uno. Hoy solo existen admin y operador por sede.',
  },
  {
    ruta: '/conexiones',
    etiqueta: 'Conexiones',
    icono: Workflow,
    subtitulo: 'Herramientas conectadas',
    descripcion: 'Las herramientas que alimentan Bake OS y su estado.',
    necesita:
      'Las credenciales de cada herramienta. La conexión de WhatsApp (Coexistence) está en desarrollo en una rama aparte y vivirá aquí.',
  },
]
