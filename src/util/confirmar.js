// YvexPOS — confirmación propia compartida.
// El confirm() nativo NO funciona en Tauri (WebView2 lo bloquea), así que
// toda confirmación destructiva del programa pasa por aquí.
//
// Uso:
//   import { confirmar } from "../util/confirmar.js";
//   const ok = await confirmar("¿Eliminar este cliente?", {
//     titulo: "Eliminar cliente", ok: "Eliminar", peligro: true,
//   });
//   if (!ok) return;
//
// Enter = aceptar · Escape / clic afuera = cancelar.
//
// Se apoya en util/modal.js, que maneja la PILA de modales: una confirmación
// puede abrirse encima de otro modal (el cierre de caja lo hace) y ambos
// conviven. Antes cada sitio resolvía esto por su cuenta con z-index a mano.

import { abrirModal, cerrarModal } from "./modal.js";

export function confirmar(mensaje, opciones = {}) {
  const titulo = opciones.titulo || "Confirmar";
  const textoOk = opciones.ok || "Aceptar";
  const textoCancelar = opciones.cancelar || "Cancelar";
  const peligro = opciones.peligro === true;

  return new Promise((resolve) => {
    const caja = abrirModal(
      `
        <h2 class="confirm-titulo">${titulo}</h2>
        <p class="confirm-msg">${mensaje}</p>
        <div class="confirm-acciones">
          <button class="btn-sec" data-conf="0">${textoCancelar}</button>
          <button class="${peligro ? "btn-peligro" : "btn-primario"}" data-conf="1">${textoOk}</button>
        </div>`,
      {
        clase: "modal--confirm",
        // El Escape lo maneja esta función (para poder resolver la promesa con
        // `false`), no el cierre genérico del modal. Si lo dejáramos al modal,
        // quien esperaba la respuesta se quedaría esperando para siempre.
        cerrarConEscape: false,
        cerrarAlTocarFuera: false,
      }
    );

    const cerrar = (valor) => {
      document.removeEventListener("keydown", onTecla, true);
      cerrarModal(caja);
      resolve(valor);
    };

    function onTecla(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cerrar(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        cerrar(true);
      }
    }
    // En fase de CAPTURA: si hay un modal debajo, esta confirmación atiende el
    // Escape primero. Antes, en fase de burbuja, el Escape podía cerrar el
    // modal de abajo y dejar la confirmación huérfana encima.
    document.addEventListener("keydown", onTecla, true);

    // Clic fuera = cancelar (equivalente a Escape). Se maneja aquí en vez de
    // delegarlo al modal, por la misma razón: hay una promesa que resolver.
    caja.parentElement.addEventListener("mousedown", (e) => {
      if (e.target === caja.parentElement) cerrar(false);
    });

    caja.querySelector('[data-conf="0"]').addEventListener("click", () => cerrar(false));
    caja.querySelector('[data-conf="1"]').addEventListener("click", () => cerrar(true));
    setTimeout(() => caja.querySelector('[data-conf="1"]').focus(), 40);
  });
}
