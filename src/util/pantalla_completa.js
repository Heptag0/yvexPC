// YvexPOS — Pantalla completa (el POS se adueña de la pantalla).
// -----------------------------------------------------------------------------
// ⚠️ LA LÓGICA REAL VIVE EN RUST (`ventana_modo_completo` en lib.rs).
// Este archivo es solo el puente. No lo "arregles" volviendo a manipular la
// ventana desde JS — ya se intentó cinco veces y no funciona. El resumen:
//
//   · setFullscreen(true) deja una franja negra del alto exacto de la barra
//     de tareas: la ventana crece, pero el lienzo de WebView2 se queda con
//     el tamaño del área de trabajo y nunca se entera.
//   · Intentar despertarlo con setSize() es peor: Windows no deja
//     redimensionar una ventana en fullscreen y la degrada a ventana
//     flotante a media pantalla.
//
// La solución (en Rust) es el ORDEN: primero se dimensiona la ventana
// EXACTAMENTE al monitor (un redimensionado corriente, de los que el webview
// sí atiende) y solo DESPUÉS se pide fullscreen. Como la geometría ya es la
// del monitor, entrar a fullscreen no cambia ni un pixel: no hay
// redimensionado que WebView2 pueda ignorar. Se necesitan los dos pasos:
// dimensionar solo no oculta la barra de tareas (es "siempre encima"), y
// fullscreen solo reproduce el bug.
//
// Ventaja extra: al hacerse en Rust no hacen falta permisos core:window:* en
// capabilities, y se aplica en el arranque antes del primer pixel (por eso
// el login ya sale bien sin que nadie lo pida).

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Cubre el monitor completo. */
export async function activarPantallaCompleta() {
  try {
    await invoke("ventana_modo_completo", { activar: true });
    window.dispatchEvent(new Event("resize"));
    return true;
  } catch (e) {
    console.warn("No se pudo cubrir la pantalla:", e);
    return false;
  }
}

/** Vuelve a ventana maximizada normal (con la barra de tareas visible). */
export async function salirPantallaCompleta() {
  try {
    await invoke("ventana_modo_completo", { activar: false });
    window.dispatchEvent(new Event("resize"));
    return true;
  } catch (e) {
    console.warn("No se pudo salir de pantalla completa:", e);
    return false;
  }
}

/** ¿Está en pantalla completa ahora mismo? */
export async function estaEnPantallaCompleta() {
  try {
    return await getCurrentWindow().isFullscreen();
  } catch (e) {
    return false;
  }
}

/** Alterna. Devuelve true si quedó cubriendo la pantalla. */
export async function alternarPantallaCompleta() {
  const completa = await estaEnPantallaCompleta();
  if (completa) {
    await salirPantallaCompleta();
    return false;
  }
  await activarPantallaCompleta();
  return true;
}
