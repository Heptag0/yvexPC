// YvexPOS — Modal compartido.
// -----------------------------------------------------------------------------
// Antes cada vista traía su propia copia de abrirModal/cerrarModal (clientes.js,
// caja.js, venta.js, inventario.js…). Eran el mismo código repetido, con la
// consecuencia de que cualquier mejora al modal (foco, teclado, animación,
// accesibilidad) había que hacerla en cada archivo — y en la práctica se hacía
// en uno solo y los demás quedaban atrás.
//
// Este módulo centraliza ese comportamiento y agrega lo que ninguna copia tenía:
//   · Cierre con Escape.
//   · APILAMIENTO: varios modales abiertos a la vez conviven (el cierre de caja
//     abre una confirmación encima). Antes caja.js necesitaba reimplementar todo
//     solo por esto.
//   · Foco devuelto al elemento que lo abrió al cerrar.
//   · Bloqueo del scroll de fondo mientras hay un modal abierto.
//
// Uso:
//   import { abrirModal, cerrarModal } from "../util/modal.js";
//   const m = abrirModal(`<h2>Título</h2>…`);
//   m.querySelector("#guardar").addEventListener("click", …);
//   cerrarModal();                 // cierra el de más arriba
//   cerrarModal(m);                // cierra uno concreto

/** Pila de modales abiertos, del más viejo al más reciente. */
const pila = [];

/**
 * Abre un modal y devuelve su elemento `.modal` (donde vive el contenido).
 * @param {string} html Contenido interno del modal.
 * @param {object} [op]
 * @param {boolean} [op.cerrarAlTocarFuera=true]
 * @param {boolean} [op.cerrarConEscape=true]
 * @param {string}  [op.clase] Clase extra para el `.modal` (p. ej. "modal--ancho").
 * @returns {HTMLElement}
 */
export function abrirModal(html, op = {}) {
  const cerrarFuera = op.cerrarAlTocarFuera !== false;
  const conEscape = op.cerrarConEscape !== false;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  // Cada modal apilado sube una capa, para que el de encima tape al de abajo.
  overlay.style.zIndex = String(100 + pila.length * 2);
  overlay.innerHTML = `<div class="modal ${op.clase || ""}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(overlay);

  const ficha = {
    overlay,
    caja: overlay.querySelector(".modal"),
    // Para devolver el foco a donde estaba al cerrar (accesibilidad y también
    // comodidad real: se sigue tecleando donde uno iba).
    focoPrevio: document.activeElement,
    conEscape,
  };
  pila.push(ficha);
  document.body.classList.add("con-modal");

  if (cerrarFuera) {
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) cerrarModal(ficha.caja);
    });
  }
  // La animación de entrada arranca en el siguiente cuadro.
  requestAnimationFrame(() => overlay.classList.add("modal-overlay--abierto"));
  return ficha.caja;
}

/**
 * Cierra el modal indicado, o el de más arriba si no se pasa ninguno.
 * @param {HTMLElement} [caja] El elemento `.modal` devuelto por abrirModal.
 */
export function cerrarModal(caja) {
  if (!pila.length) return;
  let i = pila.length - 1;
  // Se usa mucho como manejador directo: addEventListener("click", cerrarModal).
  // En ese caso llega un Event, no un elemento. Antes eso no cerraba nada y los
  // botones de Cancelar quedaban muertos; ahora se interpreta como "cierra el
  // de arriba", que es lo que quien lo escribió esperaba.
  if (caja && caja instanceof Element) {
    i = pila.findIndex((f) => f.caja === caja);
    if (i === -1) return;
  }
  const [ficha] = pila.splice(i, 1);
  ficha.overlay.classList.remove("modal-overlay--abierto");
  // Se espera a que termine la salida para quitarlo del DOM.
  setTimeout(() => ficha.overlay.remove(), 140);
  if (!pila.length) document.body.classList.remove("con-modal");
  // Devolver el foco a donde estaba, si sigue existiendo.
  if (ficha.focoPrevio && document.contains(ficha.focoPrevio)) {
    try { ficha.focoPrevio.focus(); } catch (e) {}
  }
}

/** Cierra todos los modales abiertos (útil al cambiar de vista). */
export function cerrarTodosLosModales() {
  while (pila.length) cerrarModal();
}

/** ¿Hay al menos un modal abierto ahora mismo? Para atajos de teclado
 *  globales que no deben interferir mientras un modal tiene el foco (p. ej.
 *  F12 = cobrar en Venta, pero no si ya hay un modal de cobro abierto). */
export function hayModalAbierto() {
  return pila.length > 0;
}

// Escape cierra el de más arriba. Un solo listener global en vez de uno por
// modal: no se acumulan al abrir y cerrar muchas veces.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !pila.length) return;
  const arriba = pila[pila.length - 1];
  if (arriba.conEscape) {
    e.preventDefault();
    cerrarModal(arriba.caja);
  }
});
