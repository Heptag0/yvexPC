// Iconos SVG de línea (estilo Lucide/Feather), trazo consistente 1.75px.
// Heredan currentColor, así toman el color del contexto (tenue/acento).
// Reutilizables en el hub, el sidebar y donde haga falta.
// Uso: icono("venta") devuelve el string SVG.

const TRAZO = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

const ICONOS = {
  // Casa / inicio (hub)
  inicio: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9"/><path d="M9.5 21v-6.5h5V21"/>`,
  // Carrito de compra
  venta: `<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.5 3h2l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21.5 7H6"/>`,
  // Paquete / producto
  inventario: `<path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z"/><path d="M3 7l9 5 9-5"/><path d="M12 12v10"/>`,
  // Clipboard / existencias
  existencias: `<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6"/><path d="M9 15h4"/>`,
  // Personas / clientes
  clientes: `<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 6a3 3 0 0 1 0 5.5"/><path d="M18 14.2a5.5 5.5 0 0 1 2.5 4.6"/>`,
  // Recibo / crédito
  credito: `<path d="M6 2h12v20l-3-1.6L12 22l-3-1.6L6 22Z"/><path d="M9.5 8h5"/><path d="M9.5 12h5"/>`,
  // Billetes / corte de caja
  caja: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4"/><path d="M18 10v4"/>`,
  // Gráfica / reportes
  reportes: `<path d="M4 4v16h16"/><path d="M8 15l3-4 3 2 4-6"/>`,
  // Engrane / configuración
  configuracion: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>`,
  // Lupa / buscar
  buscar: `<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`,
  // Más / agregar
  mas: `<path d="M12 5v14M5 12h14"/>`,
  // Salir / cerrar sesión (puerta con flecha)
  salir: `<path d="M14 4h-7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7"/><path d="M10 12h11"/><path d="m17.5 8.5 3.5 3.5-3.5 3.5"/>`,
  // Candado del sidebar (bloqueado/desbloqueado).
  candado: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  candado_abierto: `<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/>`,
  // Asa de arrastre (grip de 6 puntos)
  asa: `<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>`,
  // Tienda en línea (escaparate con toldo)
  tienda: `<path d="M4 10.5V20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9.5"/><path d="M3 6.5 5 3h14l2 3.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M9.5 21v-6h5v6"/>`,
  // Pedidos web (bolsa con lista)
  pedidos: `<path d="M6 7h12l1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L6 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>`,
  // Lealtad (estrella / puntos)
  lealtad: `<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9L12 2.5Z"/>`,
  // Proveedores (camión de reparto)
  proveedor: `<path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 10h3.5l3.5 3v2.5h-7z"/><circle cx="6.5" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>`,
  codigo: `<path d="M3 4v16M7 4v16M10 4v16M13 4v11M16 4v16M19 4v16M21 4v16" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  cotizacion: `<path d="M6 2.5h9l3 3v16h-12z"/><path d="M15 2.5v3h3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 11h7M8.5 14h7M8.5 17h4" stroke="var(--superficie-1, #fff)" stroke-width="1.3"/>`,
  dinero: `<path d="M12 2.5v19M16.5 6.8c-.8-1.1-2.4-1.8-4.5-1.8-2.8 0-4.5 1.2-4.5 3s1.7 2.6 4.5 3.2 4.8 1.4 4.8 3.4-2 3.4-4.8 3.4c-2.3 0-4-.8-4.8-2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>`,
  etiqueta_nom: `<polygon points="12,2.5 17,2.5 21.5,7 21.5,17 17,21.5 12,21.5 7.5,17 7.5,7" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M14.5 9.5v5M14.5 16.5h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>`,

  // --- Añadidos para el hub de Configuración (antes eran emojis) ---
  impuestos: `<circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/><path d="M19 5 5 19"/>`,
  fiscal: `<path d="M7 2h8l4 4v16H7z"/><path d="M15 2v4h4"/><path d="M9.5 12h6M9.5 15.5h6M9.5 9h3"/>`,
  moneda: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.4c.4-1 1.4-1.5 2.5-1.5 1.7 0 2.8.9 2.8 2.1s-1.1 1.7-2.8 2.1-2.8 1-2.8 2.2 1.1 2 2.8 2c1.1 0 2.1-.5 2.5-1.4"/><path d="M12 6.3v11.4"/>`,
  impresora: `<path d="M6.5 9V3.5h11V9"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M6.5 14h11v6.5h-11z"/><circle cx="17" cy="12" r=".9" fill="currentColor" stroke="none"/>`,
  lector: `<path d="M3 4v16M7 4v16M10 4v16M13 4v11M16 4v16M19 4v16M21 4v16"/>`,
  cajon: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4"/><path d="M18 10v4"/>`,
  bascula: `<path d="M12 3v3"/><path d="M5 8h14"/><path d="M7 8 4 15a3 3 0 0 0 6 0z"/><path d="M17 8l-3 7a3 3 0 0 0 6 0z"/><path d="M9 21h6"/>`,
  tema: `<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.8 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7-9-7Z"/><circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1" fill="currentColor" stroke="none"/>`,
  zona: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
  formas_pago: `<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>`,
  nube: `<path d="M7 18a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.3 8.1 4 4 0 0 1 17 16H7Z"/>`,
  importar: `<path d="M12 3v11"/><path d="m7.5 10 4.5 4.5L16.5 10"/><path d="M4 17.5h16v3H4z"/>`,
  exportar: `<path d="M12 15V4"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M4 17.5h16v3H4z"/>`,
  respaldo: `<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/>`,

  // --- Añadidos para Existencias (hub) y Onboarding (antes emojis) ---
  // Mismo cajón que "inventario" (la silueta de paquete ya probada) con un
  // "+" adentro: entra mercancía, a diferencia de "importar" (flecha hacia
  // una bandeja) que ya se usa en el mismo hub para "traer de otro POS".
  entrada: `<path d="M21 8l-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 12.5v5M9.5 15h5"/>`,
  computadora: `<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>`,

  // --- Añadidos para Recetas / Despensa (costeo de productos fabricados) ---
  // Tazón con dos utensilios asomando — mismo trazo simple que el resto.
  receta: `<path d="M3 10h18"/><path d="M4 10a8 6 0 0 0 16 0"/><path d="M9 10 7 3"/><path d="M16 10l2-7"/>`,
  // Frasco de despensa: tapa, cuerpo cónico, línea de contenido.
  despensa: `<path d="M8 2h8"/><path d="M9 2v3l-2 2v13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7l-2-2V2"/><path d="M7 12h10"/>`,

  // --- Añadido para la pestaña de Actualizaciones ---
  // Flechas circulares (refrescar/actualizar): dos arcos de 180° con puntas
  // de flecha, el símbolo universal de "buscar lo más reciente".
  actualizar: `<path d="M4 12a8 8 0 0 1 14.5-4.5M20 12a8 8 0 0 1-14.5 4.5"/><path d="M18.5 3v4.5H14"/><path d="M5.5 21v-4.5H10"/>`,

  // --- Añadido para Registro de movimientos (bitácora) ---
  // Reloj con flecha de retroceso: "línea de tiempo hacia atrás".
  historial: `<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>`,
};

export function icono(nombre) {
  const cuerpo = ICONOS[nombre] || "";
  return `<svg viewBox="0 0 24 24" ${TRAZO} width="24" height="24" aria-hidden="true">${cuerpo}</svg>`;
}
