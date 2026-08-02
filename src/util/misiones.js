// YvexPOS — Misiones de arranque ("Tu arranque" en Inicio).
//
// Puerto de src/base/misiones.ts del móvil. Checklist con espíritu de
// "misiones" que empuja a dejar el POS listo:
//   1. Registra tu negocio        (siempre completa: el PC exige el nombre
//                                   desde el onboarding, a diferencia del
//                                   móvil donde puede quedar en blanco)
//   2. Tus primeros 10 productos
//   3. Tus primeras 3 ventas
//   4. Misión POR GIRO (ver giro.js)
//
// El conteo real lo trae el backend (comando `misiones_progreso`, un solo
// viaje); aquí solo se arman los textos y se decide qué mostrar.

import { obtenerGiro } from "./giro.js";

const META_PRODUCTOS = 10;
const META_VENTAS = 3;
const META_CODIGOS = 5;
const META_FOTOS = 5;

export const CLAVE_FESTEJO = "misiones_festejo_visto";

/** Textos e icono de la misión 4 según el tipo que le toca al giro. */
function fichaMision4(tipo) {
  if (tipo === "fotos") {
    return {
      titulo: `Ponle foto a ${META_FOTOS} productos`,
      detalle: "En tu giro se vende con los ojos: una foto bonita hace que cada producto se antoje desde la pantalla de cobro.",
      icono: "camara",
      meta: META_FOTOS,
    };
  }
  if (tipo === "kit") {
    return {
      titulo: "Crea tu primer kit o paquete",
      detalle: "Arma un combo de los que se te ocurren todos los días — café con pan, desayuno completo — y véndelo con un solo toque.",
      icono: "inventario",
      meta: 1,
    };
  }
  return {
    titulo: `Registra ${META_CODIGOS} códigos de barras`,
    detalle: "Con el código de tus productos ya cargado, cobrarás rapidísimo y sin equivocarte al teclear.",
    icono: "codigo",
    meta: META_CODIGOS,
  };
}

/**
 * Arma las 4 misiones con su progreso real.
 * `cfg` = lo que devuelve config_leer_todo() (necesita negocio_nombre y giro).
 * `p`   = lo que devuelve invoke("misiones_progreso").
 */
export function calcularMisiones(cfg, p) {
  const giro = obtenerGiro(cfg.giro);
  const nombreNegocio = (cfg.negocio_nombre || "").trim();
  const negocioListo = nombreNegocio !== "";

  const ficha = fichaMision4(giro.mision4);
  const n4 = giro.mision4 === "fotos" ? p.con_foto : giro.mision4 === "kit" ? p.kits : p.con_codigo;

  return [
    {
      id: "negocio",
      titulo: "Registra tu negocio",
      detalle: "Ponle nombre con cariño: así saldrá en cada ticket que imprimas.",
      icono: "tienda",
      hecho: negocioListo,
      progreso: negocioListo ? 1 : 0,
      meta: 1,
    },
    {
      id: "productos",
      titulo: `Agrega tus primeros ${META_PRODUCTOS} productos`,
      detalle: "Con nombre, precio y su departamento, tu catálogo empieza a cobrar vida y cobrar se vuelve un gustito.",
      icono: "inventario",
      hecho: p.productos >= META_PRODUCTOS,
      progreso: Math.min(p.productos, META_PRODUCTOS),
      meta: META_PRODUCTOS,
    },
    {
      id: "ventas",
      titulo: `Haz tus primeras ${META_VENTAS} ventas`,
      detalle: "Abre un turno y cobra: la caja ya está lista y cada venta te va contando cómo va tu día.",
      icono: "caja",
      hecho: p.ventas >= META_VENTAS,
      progreso: Math.min(p.ventas, META_VENTAS),
      meta: META_VENTAS,
    },
    {
      id: "giro",
      titulo: ficha.titulo,
      detalle: ficha.detalle,
      icono: ficha.icono,
      hecho: n4 >= ficha.meta,
      progreso: Math.min(n4, ficha.meta),
      meta: ficha.meta,
    },
  ];
}

export function misionesCompletas(misiones) {
  return misiones.every((m) => m.hecho);
}
