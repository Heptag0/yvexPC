// YvexPOS — Etiquetado frontal NOM-051 (México).
//
// Para negocios que FABRICAN su propio producto (postres caseros, panadería,
// conservas, salsas) y necesitan saber, antes de venderlo, qué sellos le
// tocan y cómo debe verse su etiqueta.
//
// ═══════════════════════════════════════════════════════════════════════════
// FUENTE — VERIFICADO CONTRA EL TEXTO OFICIAL COMPLETO
// ═══════════════════════════════════════════════════════════════════════════
// Última verificación: 31 de julio de 2026, leyendo los documentos ORIGINALES
// (no artículos que los citan — un artículo reciente puede repetir datos
// viejos, y así fue como esta calculadora tuvo errores antes de corregirse):
//
//   1. MODIFICACIÓN a la NOM-051-SCFI/SSA1-2010
//      DOF 27/03/2020 (Edición Vespertina) — texto íntegro, incluido el
//      Apéndice A (Normativo) con las especificaciones gráficas del sello.
//   2. ACUERDO que amplía las fases
//      DOF 31/07/2025 — el que recorrió la Fase 3 a 2028.
//
// FASES (las fechas se han recorrido DOS veces):
//   · Fase 1: 1/oct/2020 – 30/sep/2023
//   · Fase 2: 1/oct/2023 – 31/dic/2027  ← VIGENTE HOY
//   · Fase 3: a partir del 1/ene/2028
// El texto original de 2020 decía "Fase 3 desde el 1 de octubre de 2025";
// el Acuerdo de 2025 lo recorrió. Si lees esto después de 2027, verifica en
// el DOF si arrancó o se volvió a recorrer.
//
// DIFERENCIA ENTRE FASE 2 Y FASE 3 — los umbrales de la Tabla 6 son los
// MISMOS; lo que cambia es QUÉ SE EVALÚA. Texto literal del transitorio
// SEGUNDO para la Fase 2:
//   "a) Si se agregan azúcares añadidos, se deberán evaluar azúcares y
//    calorías; b) Si se agregan grasas, se deberán evaluar grasas saturadas,
//    grasas trans y calorías; c) Si se agrega sodio, sólo se deberá evaluar
//    sodio."
//   Y: "Durante la SEGUNDA FASE no estarán vigentes las especificaciones y
//    criterios a que se refiere el numeral 4.5.3."
//   Fase 3 → se aplica 4.5.3 íntegro: los cinco sellos se evalúan si el
//   producto tiene CUALQUIER nutrimento crítico añadido.
// ═══════════════════════════════════════════════════════════════════════════

export const FECHA_VERIFICACION = "31 de julio de 2026";
export const FUENTE_OFICIAL =
  "NOM-051-SCFI/SSA1-2010 (DOF 27/03/2020, texto íntegro con Apéndice A) · Acuerdo DOF 31/07/2025";

/** Fase vigente en una fecha dada. Se calcula, no se escribe a mano. */
export function faseVigente(fecha = new Date()) {
  return fecha >= new Date("2028-01-01") ? 3 : 2;
}

// ───────────────────────────────────────────────────────────────────────────
// Productos EXENTOS del etiquetado frontal (numeral 4.5.3.3)
// ───────────────────────────────────────────────────────────────────────────
// Estos no llevan sellos nunca, sin importar sus valores. Es lo primero que
// hay que revisar: alguien que vende miel o harina no necesita nada de esto.

export const EXENCIONES = [
  { id: "ninguna", n: "Ninguna — mi producto sí está sujeto a la norma", exento: false },
  { id: "un_ingrediente", n: "Producto de un solo ingrediente (sin aditivos)", exento: true,
    ref: "4.5.2.3 i" },
  { id: "especias", n: "Hierbas, especias o mezcla de ellas", exento: true, ref: "4.5.2.3 ii" },
  { id: "cafe", n: "Café en grano o molido, sin ingredientes añadidos", exento: true,
    ref: "4.5.2.3 iii" },
  { id: "te", n: "Té o infusiones de hierbas, sin ingredientes añadidos", exento: true,
    ref: "4.5.2.3 iv" },
  { id: "vinagre", n: "Vinagres fermentados y sucedáneos", exento: true, ref: "4.5.2.3 v" },
  { id: "agua", n: "Agua para consumo humano o agua mineral natural", exento: true,
    ref: "4.5.2.3 vi" },
  { id: "basicos", n: "Aceites, grasas, azúcar, miel, sal yodada o harinas de cereal", exento: true,
    ref: "4.5.3.3 d" },
  { id: "lactantes", n: "Fórmulas o alimentos para lactantes y niños de corta edad", exento: true,
    ref: "4.5.3.3 b y c" },
];

export function esExento(idExencion) {
  const e = EXENCIONES.find((x) => x.id === idExencion);
  return !!(e && e.exento);
}

/**
 * @typedef {Object} DatosNutrimentales
 * @property {"solido"|"liquido"} tipo
 * @property {number} caloriasKcal      por 100g/100ml
 * @property {number} azucaresG         azúcares LIBRES: los añadidos por el
 *   fabricante más los presentes en miel, jarabes y jugos (definición 3.6)
 * @property {number} grasasSaturadasG  por 100g/100ml
 * @property {number} grasasTransG      por 100g/100ml
 * @property {number} sodioMg           por 100g/100ml
 * @property {boolean} anadeAzucares    ¿se añadió azúcar/miel/jarabe? (4.5.3.1 a)
 * @property {boolean} anadeGrasas      ¿se añadió grasa/aceite? (4.5.3.1 b)
 * @property {boolean} anadeSodio       ¿se añadió sal o algo con sodio? (4.5.3.1 c)
 * @property {boolean} contieneCafeina  cafeína ADICIONADA, en cualquier cantidad (7.1.4)
 * @property {boolean} contieneEdulcorantes  edulcorantes en la lista de ingredientes (7.1.3)
 * @property {string}  exencion         id de EXENCIONES
 * @property {number}  areaCm2          área de la superficie principal de exhibición
 */

// Factores de conversión energética del numeral 5.1.1 (verificados).
const KCAL_POR_G_AZUCAR = 4;
const KCAL_POR_G_GRASA = 9;

/**
 * Calcula sellos y leyendas. `fase` puede forzarse (2 o 3) para comparar el
 * hoy contra el 2028; si se omite, usa la vigente según la fecha real.
 */
export function calcularSellos(d, fase) {
  const f = fase || faseVigente();

  // 1. ¿El producto está exento por su naturaleza? (4.5.3.3)
  if (esExento(d.exencion)) {
    const e = EXENCIONES.find((x) => x.id === d.exencion);
    return {
      sellos: [], leyendas: [], evaluados: [], fase: f,
      motivo: "exento",
      explicacion: `Los productos de este tipo están exceptuados del etiquetado frontal (numeral ${e.ref} de la norma). No llevan sellos ni leyendas, sin importar sus valores.`,
    };
  }

  const liquido = d.tipo === "liquido";
  const cal = Math.max(0, d.caloriasKcal);
  const kcalAzucares = Math.max(0, d.azucaresG) * KCAL_POR_G_AZUCAR;
  const kcalGrasaSat = Math.max(0, d.grasasSaturadasG) * KCAL_POR_G_GRASA;
  const kcalGrasaTrans = Math.max(0, d.grasasTransG) * KCAL_POR_G_GRASA;
  const sodio = Math.max(0, d.sodioMg);

  // 2. Las leyendas precautorias NO dependen de los nutrimentos añadidos:
  //    aplican por la sola presencia de cafeína adicionada (7.1.4) o de
  //    edulcorantes en la lista de ingredientes (7.1.3).
  const leyendas = [];
  if (d.contieneCafeina) {
    leyendas.push({ id: "cafeina", etiqueta: "CONTIENE CAFEÍNA EVITAR EN NIÑOS",
      razon: "La norma la exige por cafeína adicionada en cualquier cantidad (7.1.4)." });
  }
  if (d.contieneEdulcorantes) {
    leyendas.push({ id: "edulcorantes", etiqueta: "CONTIENE EDULCORANTES, NO RECOMENDABLE EN NIÑOS",
      razon: "La norma la exige si la lista de ingredientes incluye edulcorantes (7.1.3)." });
  }

  // 3. Sin nutrimentos críticos añadidos no hay sellos (4.5.3 a). Un producto
  //    naturalmente alto en azúcar, si no se le añadió nada, no lleva sello.
  const anadeAlgo = d.anadeAzucares || d.anadeGrasas || d.anadeSodio;
  if (!anadeAlgo) {
    return {
      sellos: [], leyendas, evaluados: [], fase: f,
      motivo: "sin_anadidos",
      explicacion: "Los sellos solo aplican a productos con nutrimentos críticos AÑADIDOS (numeral 4.5.3). Un producto naturalmente alto en azúcar o sodio, al que no se le agregó nada, no lleva sellos.",
    };
  }

  // 4. ¿Qué se evalúa? Fase 2 → solo lo ligado a lo añadido. Fase 3 → todo.
  const evaluar = f >= 3
    ? { calorias: true, azucares: true, grasasSat: true, grasasTrans: true, sodio: true }
    : {
        calorias: d.anadeAzucares || d.anadeGrasas,
        azucares: d.anadeAzucares,
        grasasSat: d.anadeGrasas,
        grasasTrans: d.anadeGrasas,
        sodio: d.anadeSodio,
      };

  const sellos = [];

  // ── EXCESO CALORÍAS ──
  // Sólidos: ≥275 kcal/100g. Líquidos: ≥70 kcal/100ml O ≥8 kcal de azúcares.
  if (evaluar.calorias) {
    if (!liquido && cal >= 275) {
      sellos.push({ id: "calorias", etiqueta: "EXCESO CALORÍAS",
        razon: `${cal.toFixed(0)} kcal por 100 g (límite: 275)` });
    } else if (liquido && (cal >= 70 || kcalAzucares >= 8)) {
      sellos.push({ id: "calorias", etiqueta: "EXCESO CALORÍAS",
        razon: cal >= 70 ? `${cal.toFixed(0)} kcal por 100 ml (límite: 70)`
                         : `${kcalAzucares.toFixed(1)} kcal de azúcares por 100 ml (límite: 8)` });
    }
  }

  // ── Los tres siguientes van por % de la energía total ──
  // Sin calorías capturadas no se puede sacar el porcentaje; se omiten en vez
  // de calcular con un 0 falso y dar un resultado tranquilizador y erróneo.
  if (cal > 0) {
    if (evaluar.azucares) {
      const pct = (kcalAzucares / cal) * 100;
      if (pct >= 10) sellos.push({ id: "azucares", etiqueta: "EXCESO AZÚCARES",
        razon: `${pct.toFixed(0)}% de la energía viene de azúcares libres (límite: 10%)` });
    }
    if (evaluar.grasasSat) {
      const pct = (kcalGrasaSat / cal) * 100;
      if (pct >= 10) sellos.push({ id: "grasas_sat", etiqueta: "EXCESO GRASAS SATURADAS",
        razon: `${pct.toFixed(0)}% de la energía viene de grasas saturadas (límite: 10%)` });
    }
    if (evaluar.grasasTrans) {
      const pct = (kcalGrasaTrans / cal) * 100;
      if (pct >= 1) sellos.push({ id: "grasas_trans", etiqueta: "EXCESO GRASAS TRANS",
        razon: `${pct.toFixed(1)}% de la energía viene de grasas trans (límite: 1%)` });
    }
  }

  // ── EXCESO SODIO ──
  // Tabla 6, textual:
  //   Sólidos en 100 g: "≥ 1 mg de sodio por kcal o ≥ 300 mg"
  //   Líquidos en 100 mL: "Bebidas sin calorías: ≥ 45 mg de sodio"
  // Los 45 mg son SOLO para bebidas sin calorías — no para todo líquido.
  // Tiene lógica: la regla "1 mg por kcal" no se puede aplicar a algo con 0
  // calorías, así que a esas se les puso un umbral fijo.
  // "Sin calorías": la Tabla 5 de redondeo indica que <5 kcal se declara como
  // 0, así que ese es el corte que se usa aquí.
  if (evaluar.sodio) {
    const bebidaSinCalorias = liquido && cal < 5;
    if (bebidaSinCalorias) {
      if (sodio >= 45) {
        sellos.push({ id: "sodio", etiqueta: "EXCESO SODIO",
          razon: `${sodio.toFixed(0)} mg por 100 ml (límite para bebidas sin calorías: 45)` });
      }
    } else if (sodio >= 300) {
      sellos.push({ id: "sodio", etiqueta: "EXCESO SODIO",
        razon: `${sodio.toFixed(0)} mg por 100 ${liquido ? "ml" : "g"} (límite: 300)` });
    } else if (cal > 0 && sodio / cal >= 1) {
      sellos.push({ id: "sodio", etiqueta: "EXCESO SODIO",
        razon: `${(sodio / cal).toFixed(2)} mg de sodio por kcal (límite: 1 mg/kcal)` });
    }
  }

  // Orden obligatorio de los sellos (numeral 4.5.3.4.6).
  const ORDEN = ["calorias", "azucares", "grasas_sat", "grasas_trans", "sodio"];
  sellos.sort((a, b) => ORDEN.indexOf(a.id) - ORDEN.indexOf(b.id));

  const evaluados = Object.entries(evaluar).filter(([, v]) => v).map(([k]) => k);
  return { sellos, leyendas, evaluados, fase: f, motivo: sellos.length ? "con_sellos" : "sin_exceso" };
}

/** Compara el resultado de hoy (Fase 2) contra el de 2028 (Fase 3). */
export function compararFases(d) {
  const hoy = calcularSellos(d, 2);
  const futuro = calcularSellos(d, 3);
  const idsHoy = new Set(hoy.sellos.map((s) => s.id));
  return { hoy, futuro, nuevos: futuro.sellos.filter((s) => !idsHoy.has(s.id)) };
}

// ───────────────────────────────────────────────────────────────────────────
// Tamaño del sello según el envase — Tabla A1 del Apéndice A (Normativo)
// ───────────────────────────────────────────────────────────────────────────

const TABLA_A1 = [
  { hasta: 5,   ancho: null, alto: null, nota: "Al menos el 15% de la superficie principal de exhibición" },
  { hasta: 30,  ancho: 1.0,  alto: 1.11 },
  { hasta: 40,  ancho: 1.5,  alto: 1.66 },
  { hasta: 60,  ancho: 1.5,  alto: 1.66 },
  { hasta: 100, ancho: 2.0,  alto: 2.22 },
  { hasta: 200, ancho: 2.5,  alto: 2.77 },
  { hasta: 300, ancho: 3.0,  alto: 3.32 },
  { hasta: Infinity, ancho: 3.5, alto: 3.88 },
];

/**
 * Reglas de impresión según el área de la superficie principal de exhibición.
 * Devuelve el tamaño exacto de cada sello y si aplica el sello agrupado con
 * número (numeral 4.5.3.4.2: los envases ≤40 cm² llevan UN solo sello que
 * indica cuántos nutrimentos exceden, no los sellos individuales).
 */
export function reglasImpresion(areaCm2, numSellos) {
  const area = Number(areaCm2) > 0 ? Number(areaCm2) : null;
  if (!area) {
    return { conocida: false, usaNumero: false,
      nota: "Captura el área de la superficie principal de exhibición para saber el tamaño exacto que debe tener cada sello." };
  }
  const fila = TABLA_A1.find((f) => area <= f.hasta);
  const usaNumero = area <= 40 && numSellos > 0;
  return {
    conocida: true,
    area,
    usaNumero,
    ancho: fila.ancho,
    alto: fila.alto,
    nota: fila.nota || null,
    // 4.5.3.4.6: esquina superior derecha, salvo envases muy chicos.
    ubicacion: area < 60
      ? "En cualquier área de la superficie principal de exhibición (por ser menor a 60 cm²)."
      : "En la esquina superior derecha de la superficie principal de exhibición.",
    // A.3.2: en envases ≤20 cm² las leyendas pueden ir sin recuadro.
    leyendaSinRecuadro: area <= 20,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Dibujo del sello — proporciones exactas del Apéndice A, Figura A2
// ───────────────────────────────────────────────────────────────────────────
// La unidad "x" es la proporción base sobre la que se construye el sello.
// Del diagrama oficial: 64x de ancho total × 72x de alto total; el octágono
// mide 56x de ancho y 62x de alto (bandas de 20x + 23x + 19x); debajo va una
// franja de 10x con la firma "SECRETARÍA DE SALUD" ocupando 7x. La tipografía
// del mensaje es 6x con interlineado de 4x, y debe cubrir el área de 23x.
// Tipografía: Arial Bold dentro del octágono, Arial negrillas para la firma.

function escaparXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function envolver(texto, maxPorLinea) {
  const palabras = texto.split(" ");
  const out = [];
  let act = "";
  for (const p of palabras) {
    if ((act + " " + p).trim().length > maxPorLinea && act) { out.push(act.trim()); act = p; }
    else act = (act + " " + p).trim();
  }
  if (act) out.push(act);
  return out;
}

/** SVG de un sello de advertencia, con las proporciones de la Figura A2. */
export function svgSello(texto, tamPx = 110) {
  const lineas = envolver(texto, 13);
  // El mensaje debe cubrir el área de 23x (numeral A.4.2): si son muchas
  // líneas se reduce el cuerpo para que quepan sin salirse de esa banda.
  const fuente = lineas.length >= 4 ? 4.6 : lineas.length === 3 ? 5.6 : 6;
  const interlineado = fuente + (lineas.length >= 4 ? 0.6 : 1.2);
  const centroTexto = 31.5; // centro de la banda de 23x (y de 20 a 43)
  const y0 = centroTexto - ((lineas.length - 1) * interlineado) / 2;
  const alto = Math.round(tamPx * (72 / 64));
  return `<svg viewBox="0 0 64 72" width="${tamPx}" height="${alto}" role="img" aria-label="${escaparXml(texto)}">
    <rect x="0" y="0" width="64" height="72" fill="#fff"/>
    <polygon points="19,0 45,0 60,20 60,43 45,62 19,62 4,43 4,20"
             fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
    <text x="32" y="${y0}" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"
          font-size="${fuente}" fill="#fff">
      ${lineas.map((l, i) => `<tspan x="32" dy="${i === 0 ? 0 : interlineado}">${escaparXml(l)}</tspan>`).join("")}
    </text>
    <rect x="4" y="63" width="56" height="9" fill="#fff"/>
    <text x="32" y="67.8" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, Helvetica, sans-serif" font-weight="700"
          font-size="4" fill="#000" letter-spacing="0.1">SECRETARÍA DE SALUD</text>
  </svg>`;
}

/**
 * SVG del sello agrupado con número, para envases ≤40 cm²
 * (numeral 4.5.3.4.2 y Figura A3).
 */
export function svgSelloNumero(cuantos, tamPx = 110) {
  const alto = Math.round(tamPx * (72 / 65));
  const palabra = cuantos === 1 ? "SELLO" : "SELLOS";
  return `<svg viewBox="0 0 65 72" width="${tamPx}" height="${alto}" role="img" aria-label="${cuantos} ${palabra}">
    <rect x="0" y="0" width="65" height="72" fill="#fff"/>
    <polygon points="19,0 46,0 61,21 61,44 46,65 19,65 4,44 4,21"
             fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
    <text x="32.5" y="27" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"
          font-size="24" fill="#fff">${cuantos}</text>
    <text x="32.5" y="48" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900"
          font-size="9" fill="#fff">${palabra}</text>
    <rect x="4" y="65" width="57" height="7" fill="#fff"/>
    <text x="32.5" y="69" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, Helvetica, sans-serif" font-weight="700"
          font-size="3.4" fill="#000">SECRETARÍA DE SALUD</text>
  </svg>`;
}

/** SVG de una leyenda precautoria (Figuras A4 y A5). */
export function svgLeyenda(texto, anchoPx = 260) {
  const lineas = envolver(texto, 26);
  const altoU = 14 + (lineas.length - 1) * 11;
  const alto = Math.round(anchoPx * (altoU / 180));
  const y0 = altoU / 2 - ((lineas.length - 1) * 11) / 2;
  return `<svg viewBox="0 0 180 ${altoU}" width="${anchoPx}" height="${alto}" role="img" aria-label="${escaparXml(texto)}">
    <rect x="0" y="0" width="180" height="${altoU}" fill="#fff"/>
    <rect x="2" y="1.5" width="176" height="${altoU - 3}" fill="#000"/>
    <text x="90" y="${y0}" text-anchor="middle" dominant-baseline="middle"
          font-family="Arial, Helvetica, sans-serif" font-weight="700"
          font-size="8" fill="#fff">
      ${lineas.map((l, i) => `<tspan x="90" dy="${i === 0 ? 0 : 11}">${escaparXml(l)}</tspan>`).join("")}
    </text>
  </svg>`;
}

// ───────────────────────────────────────────────────────────────────────────
// Checklist de la etiqueta completa
// ───────────────────────────────────────────────────────────────────────────
// El sello es UNA PARTE de la etiqueta. Esto es lo demás que exige la norma.

export const CHECKLIST_ETIQUETA = [
  { id: "denominacion", n: "Denominación del producto", ref: "4.2.1",
    ayuda: "Lo que ES, no la marca. Va en negritas en la cara principal." },
  { id: "ingredientes", n: "Lista de ingredientes", ref: "4.2.2",
    ayuda: "De mayor a menor cantidad. Los azúcares añadidos se agrupan con esa palabra." },
  { id: "alergenos", n: "Declaración de alérgenos", ref: "4.2.2.2.3",
    ayuda: "Al final de la lista, en negritas, con la palabra «Contiene»: gluten, huevo, leche, soya, nuez, cacahuate, pescado, mariscos, sulfitos." },
  { id: "contenido", n: "Contenido neto", ref: "NOM-030",
    ayuda: "En g o ml, conforme al Sistema General de Unidades de Medida." },
  { id: "responsable", n: "Nombre y domicilio fiscal del responsable", ref: "4.2.4.1",
    ayuda: "Calle, número, código postal y entidad federativa." },
  { id: "lote", n: "Identificación del lote", ref: "3.32",
    ayuda: "Puede ir en cualquier parte del envase." },
  { id: "caducidad", n: "Fecha de caducidad o consumo preferente", ref: "3.20, 3.21",
    ayuda: "Puede ir en cualquier parte del envase." },
  { id: "origen", n: "País de origen", ref: "4.2",
    ayuda: "«Hecho en México» o el que corresponda." },
  { id: "nutrimental", n: "Declaración nutrimental", ref: "4.5.2",
    ayuda: "Energía, proteínas, grasas (saturadas y trans), hidratos de carbono (azúcares y añadidos), fibra y sodio. Por 100 g/ml y por envase. Letra de al menos 1.5 mm." },
  { id: "conservacion", n: "Instrucciones de uso o conservación", ref: "4.3",
    ayuda: "Cuando el producto las necesite." },
];

// ───────────────────────────────────────────────────────────────────────────
// Reglas adicionales que conviene conocer
// ───────────────────────────────────────────────────────────────────────────

export const REGLAS_EXTRA = [
  { id: "orden", n: "Orden de los sellos", ref: "4.5.3.4.6",
    d: "Cuando hay más de uno, van de izquierda a derecha en este orden: calorías, azúcares, grasas saturadas, grasas trans, sodio." },
  { id: "ubicacion", n: "Dónde van", ref: "4.5.3.4.6",
    d: "En la esquina superior derecha de la cara principal. Si el envase tiene menos de 60 cm², pueden ir en cualquier parte de esa cara." },
  { id: "leyendas_pos", n: "Dónde van las leyendas", ref: "4.5.3.4.7",
    d: "Arriba a la derecha; si el producto tiene sellos, van debajo de ellos." },
  { id: "publicidad", n: "Prohibición de elementos infantiles", ref: "4.1.5",
    d: "Un producto con sellos o con la leyenda de edulcorantes NO puede llevar personajes infantiles, caricaturas, celebridades, deportistas, mascotas ni juegos o descargas dirigidos a niños." },
  { id: "avales", n: "Sin avales médicos", ref: "4.1.4",
    d: "Los productos que exceden algún nutrimento crítico no pueden ostentar sellos o recomendaciones de asociaciones profesionales." },
  { id: "sin_sellos", n: "Si tu producto no lleva sellos", ref: "4.1.4 Bis",
    d: "Puedes declararlo con la frase «Este producto no contiene sellos ni leyendas», solo por escrito y en la superficie de información — sin gráficos que imiten un sello." },
  { id: "declaraciones", n: "Restricción a las declaraciones de salud", ref: "6.3",
    d: "Con un sello en la etiqueta no se pueden hacer declaraciones saludables, ni declaraciones nutrimentales relacionadas con el nutrimento del sello." },
];

// ───────────────────────────────────────────────────────────────────────────
// Los trámites: qué existe de verdad
// ───────────────────────────────────────────────────────────────────────────
// El numeral 9 de la norma es explícito: la evaluación de la conformidad
// "no es certificable y se puede llevar a cabo a través de un esquema
// VOLUNTARIO". No hay un permiso previo para tu etiqueta: la verificación y
// vigilancia (numeral 8) las hacen PROFECO y COFEPRIS después, en campo.

export const TRAMITES = [
  {
    id: "aviso",
    n: "Aviso de Funcionamiento ante COFEPRIS",
    quien: "Tú, en línea y sin costo",
    cuando: "Antes de empezar a producir para vender",
    detalle: "Es sobre tu establecimiento, no sobre la etiqueta: declara que fabricas alimentos. Los alimentos preenvasados NO requieren registro sanitario individual.",
  },
  {
    id: "constancia",
    n: "Constancia de Conformidad (opcional)",
    quien: "Una Unidad de Verificación acreditada (empresa privada, de paga)",
    cuando: "Si te la piden para vender a cadenas, o al importar/exportar",
    detalle: "La norma dice textualmente que su evaluación «no es certificable» y es un esquema voluntario. La Unidad de Verificación revisa tu etiqueta contra los capítulos 4 a 7 y emite el documento. No es obligatoria para vender por tu cuenta, pero los supermercados y las aduanas sí la exigen.",
  },
  {
    id: "analisis",
    n: "Análisis nutrimental de laboratorio",
    quien: "Un laboratorio de pruebas acreditado",
    cuando: "Para tener números que se sostengan ante una inspección",
    detalle: "La norma pide que los valores de tu etiqueta sean «valores medios ponderados derivados por análisis, bases de datos o tablas reconocidas internacionalmente» (4.5.2.4.15). Esta calculadora trabaja con los números que TÚ capturas: para orientarte basta, para imprimir un empaque en serio deben venir de un laboratorio.",
  },
  {
    id: "vigilancia",
    n: "Quién te puede inspeccionar",
    quien: "PROFECO y COFEPRIS",
    cuando: "En cualquier momento, ya que estés vendiendo",
    detalle: "El numeral 8 de la norma les da esa facultad. No hay aprobación previa de tu sello: tú etiquetas bajo tu responsabilidad y ellos verifican después.",
  },
];
