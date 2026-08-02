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
};

export function icono(nombre) {
  const cuerpo = ICONOS[nombre] || "";
  return `<svg viewBox="0 0 24 24" ${TRAZO} width="24" height="24" aria-hidden="true">${cuerpo}</svg>`;
}
