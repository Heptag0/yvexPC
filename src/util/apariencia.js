// YvexPOS — apariencia: aplica la personalización del dueño al programa.
// -----------------------------------------------------------------------------
// El tema/acento/densidad/forma viven en la config de SQLite con las claves:
//   apariencia_tema      → "nocturno" | "grafito" | "aurora" | "alba" | "duna" | "contraste"
//   apariencia_acento    → id de ACENTOS ("violeta", "turquesa", …)
//   apariencia_densidad  → "comoda" | "compacta"
//   apariencia_forma     → "suave" | "recta"
//
// main.js llama aplicarApariencia(cfg) al arrancar (la apariencia aplica
// desde el login); Configuración la llama en vivo al cambiar cada perilla.
//
// REGLA QUE LA PERSONALIZACIÓN NO PUEDE ROMPER: cada acento trae dos
// versiones curadas (tema oscuro / temas claros) y el texto sobre el acento
// se elige por contraste WCAG calculado. YvexPOS no se puede desconfigurar.
//
// PARIDAD CON EL MÓVIL: los ids y nombres de acento son los MISMOS en ambas
// plataformas (Amatista, Laguna, Miel…), para que un dueño con las dos
// versiones vea un solo catálogo. El PC conserva su ventaja propia: dos
// versiones por acento (oscuro/claro) en vez de una sola.

export const TEMAS = ["nocturno", "grafito", "aurora", "alba", "duna", "contraste"];

/// Metadatos de cada tema para los selectores (onboarding y Configuración).
/// `esClaro` decide qué versión del acento se usa.
export const TEMAS_INFO = {
  nocturno:  { nombre: "Nocturno",  alma: "Violeta profundo · el clásico",   esClaro: false },
  grafito:   { nombre: "Grafito",   alma: "Negro puro · máximo enfoque",     esClaro: false },
  aurora:    { nombre: "Aurora",    alma: "Índigo profundo · el más premium", esClaro: false },
  alba:      { nombre: "Alba",      alma: "Claro y limpio",                  esClaro: true  },
  duna:      { nombre: "Duna",      alma: "Crema cálido · suave a la vista", esClaro: true  },
  contraste: { nombre: "Mediodía",  alma: "Alto contraste · a plena luz",    esClaro: true  },
};

/// Temas que existían antes de la unificación con el móvil. Se traducen al
/// vuelo para que a nadie se le resetee lo que ya había elegido.
const TEMAS_HEREDADOS = {
  amanecer: "duna",  // era "claro y cálido"  → el cálido ahora es Duna
  brisa: "alba",     // era "claro y suave"   → el limpio ahora es Alba
};

/// Acentos curados. `oscuro` para temas oscuros; `claro` (más profundo) para
/// los claros. Ambas versiones garantizan contraste sobre sus fondos.
/// Los ids y nombres coinciden con los del móvil (src/base/apariencia.ts).
export const ACENTOS = [
  { id: "violeta",   nombre: "Amatista",   oscuro: "#8b5cf6", claro: "#7c3aed" },
  { id: "turquesa",  nombre: "Laguna",     oscuro: "#2dd4bf", claro: "#0f766e" },
  { id: "ambar",     nombre: "Miel",       oscuro: "#f59e0b", claro: "#b45309" },
  { id: "esmeralda", nombre: "Jade",       oscuro: "#34d399", claro: "#0d9d6f" },
  { id: "indigo",    nombre: "Zafiro",     oscuro: "#6366f1", claro: "#4338ca" },
  { id: "rosa",      nombre: "Bugambilia", oscuro: "#ec4899", claro: "#be185d" },
  { id: "perla",     nombre: "Perla",      oscuro: "#dcdde3", claro: "#6b7280" },
  { id: "carbon",    nombre: "Carbón",     oscuro: "#a7a9c4", claro: "#4b4d63" },
  // Exclusivo del PC por ahora (el móvil no lo tiene todavía). Se conserva
  // porque hay usuarios que ya lo eligieron; no se pierde nada.
  { id: "coral",     nombre: "Coral",      oscuro: "#fb7185", claro: "#be123c" },
];

/// Acentos que existían antes de unificar los ids con el móvil.
const ACENTOS_HEREDADOS = {
  morado: "violeta",
  azul: "indigo",
  verde: "esmeralda",
  grafito: "carbon",
};

const PREDETERMINADA = {
  apariencia_tema: "nocturno",
  apariencia_acento: "violeta",
  apariencia_densidad: "comoda",
  apariencia_forma: "suave",
};

/// Lee una clave de apariencia de la config con su predeterminado.
export function valorApariencia(cfg, clave) {
  const v = cfg && cfg[clave];
  return v !== undefined && v !== "" ? v : PREDETERMINADA[clave];
}

/// Traduce un tema guardado (posiblemente con nombre viejo) al vigente.
export function normalizarTema(id) {
  const t = TEMAS_HEREDADOS[id] || id;
  return TEMAS.includes(t) ? t : "nocturno";
}

/// Traduce un acento guardado (posiblemente con id viejo) al vigente.
export function normalizarAcento(id) {
  const a = ACENTOS_HEREDADOS[id] || id;
  return ACENTOS.some((x) => x.id === a) ? a : "violeta";
}

/// ¿El tema es de fondo claro? (decide qué versión del acento usar)
export function temaEsClaro(tema) {
  const info = TEMAS_INFO[normalizarTema(tema)];
  return info ? info.esClaro : false;
}

/// Hex del acento para el tema dado (los swatches del selector la usan).
export function hexAcento(acentoId, tema) {
  const id = normalizarAcento(acentoId);
  const a = ACENTOS.find((x) => x.id === id) || ACENTOS[0];
  return temaEsClaro(tema) ? a.claro : a.oscuro;
}

/// Aplica la apariencia completa al documento. Tolera cfg vacío/nulo.
export function aplicarApariencia(cfg) {
  const tema = normalizarTema(valorApariencia(cfg, "apariencia_tema"));
  const acento = normalizarAcento(valorApariencia(cfg, "apariencia_acento"));
  const densidad = validar(valorApariencia(cfg, "apariencia_densidad"), ["comoda", "compacta"], "comoda");
  const forma = validar(valorApariencia(cfg, "apariencia_forma"), ["suave", "recta"], "suave");

  const html = document.documentElement;
  html.dataset.tema = tema;
  html.dataset.densidad = densidad;
  html.dataset.forma = forma;
  aplicarAcento(acento, tema);
}

/// Inyecta el acento (y sus derivados) encima del tema activo.
export function aplicarAcento(acentoId, tema) {
  const id = normalizarAcento(acentoId);
  const temaOk = normalizarTema(tema);
  const hex = hexAcento(id, temaOk);
  const raiz = document.documentElement.style;
  if (id === "violeta") {
    // El predeterminado ya vive en los tokens del tema: limpiar overrides
    // para que gobierne el CSS (incluye matices finos por tema).
    ["--acento", "--acento-suave", "--acento-borde", "--acento-texto"].forEach((t) =>
      raiz.removeProperty(t)
    );
    return;
  }
  raiz.setProperty("--acento", hex);
  raiz.setProperty("--acento-suave", conAlfa(hex, temaEsClaro(temaOk) ? 0.1 : 0.14));
  raiz.setProperty("--acento-borde", conAlfa(hex, 0.4));
  raiz.setProperty("--acento-texto", textoSobre(hex));
}

// --- helpers ---
function validar(v, permitidos, def) {
  return permitidos.includes(v) ? v : def;
}
function conAlfa(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/// Texto sobre el acento por contraste WCAG real: gana el mayor, con
/// preferencia por blanco cuando alcanza umbral (asienta mejor).
function textoSobre(hex) {
  const rBlanco = contraste("#ffffff", hex);
  const rOscuro = contraste("#101018", hex);
  return rBlanco >= 4.2 || rBlanco >= rOscuro ? "#ffffff" : "#101018";
}
function luminancia(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
