/**
 * Barra fija abajo con el botón de registrar: en un formulario largo (10 sabores, postres…) el botón siempre está a
 * mano, sin bajar hasta el final. Va pegada al borde inferior de la pantalla (respeta la barra del sistema del
 * celular) y deja ver un resumen de lo que se va a registrar.
 */
export default function BarraRegistrar({ deshabilitado, texto, resumen }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-borde bg-crema/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
      {resumen && (
        <p className="mb-2 text-center text-xs text-gris" aria-live="polite">
          {resumen}
        </p>
      )}
      <button
        type="submit"
        disabled={deshabilitado}
        className="h-12 w-full rounded-xl bg-tinta text-base font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {texto}
      </button>
    </div>
  )
}
