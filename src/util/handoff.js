// YvexPOS — traspaso ligero entre pantallas (memoria, no persistente).
// Cuando Cotizaciones dice "convertir a venta", deja aquí la cotización
// completa; Venta la recoge al montar y arma el carrito con ella.
// Se limpia sola al leerse: si el usuario navega a Venta por otro lado
// después, no hay una cotización vieja esperando a colarse por sorpresa.

let cotizacionPendiente = null;

export function dejarCotizacionParaVenta(cot) {
  cotizacionPendiente = cot;
}

export function tomarCotizacionPendiente() {
  const c = cotizacionPendiente;
  cotizacionPendiente = null;
  return c;
}
