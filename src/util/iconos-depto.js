// YvexPOS — Iconos de departamento (categorías) + pack de estilo.
//
// Puerto de src/componentes/iconos.tsx del móvil: mismos 16 iconos, mismos
// trazos, mismos ids — para que una categoría se vea igual en el teléfono y
// en la caja.
//
// PACK (D2): el dueño elige en Apariencia cómo se ven estos iconos en toda
// la app (rejilla de venta, lista de categorías, tarjetas de producto):
//   - "trazo":   línea, sin relleno (por defecto)
//   - "solido":  con relleno, más presencia, se lee a distancia
//   - "inicial": sin icono — la letra inicial de la categoría (minimalista)
// Se guarda en config con la clave "pack_iconos" (config_guardar_claves).
//
// LOCAL-ONLY por ahora: el icono elegido por categoría no sincroniza al
// servidor todavía (mismo punto de partida que tuvieron proveedores/lealtad
// antes de sincronizarse). El pack de estilo SÍ es 100% local a propósito:
// es una preferencia visual del dispositivo, no del negocio — el móvil y el
// PC pueden mostrar el mismo icono con estilos distintos sin que eso sea un
// problema, sería como sincronizar el tema.

export const PACKS = ["trazo", "solido", "inicial"];

export const PACKS_INFO = {
  trazo:   { nombre: "Trazo",   desc: "Línea fina, elegante y ligera" },
  solido:  { nombre: "Sólido",  desc: "Relleno, con más presencia visual" },
  inicial: { nombre: "Inicial", desc: "Sin icono — solo la primera letra" },
};

export const ICONOS_DEPTO = [
  { id: "botana",     nombre: "Botanas" },
  { id: "refresco",   nombre: "Refrescos" },
  { id: "cerveza",    nombre: "Cerveza" },
  { id: "cigarro",    nombre: "Cigarros" },
  { id: "encendedor", nombre: "Encendedor" },
  { id: "dulce",      nombre: "Dulces" },
  { id: "farmacia",   nombre: "Farmacia" },
  { id: "cafe",       nombre: "Café" },
  { id: "pan",        nombre: "Panadería" },
  { id: "lacteo",     nombre: "Lácteos" },
  { id: "limpieza",   nombre: "Limpieza" },
  { id: "carne",      nombre: "Carnes" },
  { id: "fruta",      nombre: "Frutas" },
  { id: "hielo",      nombre: "Hielo" },
  { id: "papeleria",  nombre: "Papelería" },
  { id: "caja",       nombre: "General" },
];

// Paths SVG en lienzo 24×24 — copiados tal cual del móvil (varios trazos por
// icono, por eso cada entrada es un ARRAY de "d", no un string único).
const PATHS = {
  botana: ["M6 3h12l2 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8l2-5z", "M4 8h16"],
  refresco: ["M10 2h4v3l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3V2z", "M8 12h8"],
  cerveza: ["M6 6h9v14H6z", "M15 9h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2", "M6 6l1-3h7l1 3"],
  cigarro: ["M2 15h16v4H2z", "M18 15h4v4h-4z", "M17 11c1-1 1-2 0-3", "M20 11c1-1 1-2 0-3"],
  encendedor: ["M12 2c0 4-4 5-4 9a4 4 0 0 0 8 0c0-2-1-3-2-4", "M9 22h6"],
  dulce: ["M9 9h6v6H9z", "M9 12L5 9v6l4-3z", "M15 12l4-3v6l-4-3z"],
  farmacia: ["M8 4h8a4 4 0 0 1 0 8h-8a4 4 0 0 1 0-8z", "M12 4v8", "M6 16h12v4H6z"],
  cafe: ["M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z", "M17 10h2a2 2 0 0 1 0 4h-2", "M8 3v2", "M12 3v2"],
  pan: ["M4 12a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6z", "M9 12v6", "M15 12v6"],
  lacteo: ["M8 8h8v12H8z", "M8 8l2-5h4l2 5", "M10 13h4"],
  limpieza: ["M9 9h6v11H9z", "M10 9V6h4v3", "M14 6h3l2-2", "M11 13h2"],
  carne: ["M5 9a6 6 0 0 1 12 0c2 0 2 3 0 3a6 6 0 0 1-12 0", "M9 10a2 2 0 0 0 4 0"],
  fruta: ["M12 7c-4-3-8 0-8 5s4 9 8 6c4 3 8-1 8-6s-4-8-8-5z", "M12 7V4", "M12 4c2 0 3-1 3-2"],
  hielo: ["M5 8l7-4 7 4v8l-7 4-7-4V8z", "M12 4v16", "M5 8l14 8", "M19 8L5 16"],
  papeleria: ["M17 3l4 4L8 20H4v-4L17 3z", "M14 6l4 4"],
  caja: ["M3 8l9-5 9 5v9l-9 5-9-5V8z", "M3 8l9 5 9-5", "M12 13v9"],
};

/**
 * SVG del icono de departamento, ya armado como string listo para insertar
 * (igual que `icono()` de util/iconos.js, pero con soporte de pack).
 *
 * @param {string|null} id      id del icono (ver ICONOS_DEPTO), o null
 * @param {string} nombre       nombre de la categoría (para el pack "inicial")
 * @param {object} opts
 * @param {string} opts.pack    "trazo" | "solido" | "inicial" (default "trazo")
 * @param {string} opts.color   currentColor por defecto; para "inicial" es el color del texto
 * @param {number} opts.size    tamaño en px del SVG (el contenedor decide el resto)
 */
export function svgIconoDepto(id, nombre, opts = {}) {
  const pack = PACKS.includes(opts.pack) ? opts.pack : "trazo";
  const size = opts.size || 22;

  if (pack === "inicial" || !id) {
    const letra = (nombre || "?").trim().charAt(0).toUpperCase() || "?";
    return `<span class="ico-depto-inicial" style="font-size:${Math.round(size * 0.6)}px">${letra}</span>`;
  }

  const paths = PATHS[id] || PATHS.caja;
  const relleno = pack === "solido";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    ${paths.map((d, i) => `<path d="${d}" stroke="currentColor" stroke-width="${relleno ? 1 : 1.7}"
      stroke-linecap="round" stroke-linejoin="round"
      fill="${relleno && i === 0 ? "currentColor" : "none"}"
      fill-opacity="${relleno && i === 0 ? 0.9 : 0}"/>`).join("")}
  </svg>`;
}

/** Lee el pack guardado en config (o "trazo" por defecto). */
export function packDeConfig(cfg) {
  const p = cfg && cfg.pack_iconos;
  return PACKS.includes(p) ? p : "trazo";
}
