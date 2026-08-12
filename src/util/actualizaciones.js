// YvexPOS — actualización automática del programa.
//
// Revisa contra tu propio servidor (pos.yvexiq.com/updater/latest.json) si
// hay una versión nueva. Nunca bloquea el arranque ni interrumpe una venta:
// si falla la revisión (sin internet, servidor caído), se ignora en
// silencio — el POS tiene que poder abrir y vender sin depender de esto.
//
// El aviso se muestra UNA vez por sesión (al montar el shell), igual que
// revisarVerificacion — el dueño decide "Actualizar ahora" o "Más tarde"
// sin que se le imponga un reinicio a media jornada.

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { abrirModal, cerrarModal } from "./modal.js";
import { escapar } from "./formato.js";

export async function revisarActualizacion() {
  let update;
  try {
    update = await check();
  } catch (e) {
    console.error("No se pudo revisar actualizaciones:", e);
    return; // sin internet o servidor caído: no molestar
  }
  if (!update) return; // ya está en la última versión

  mostrarModalActualizacion(update);
}

/**
 * Variante para un botón explícito ("Buscar actualizaciones" en
 * Configuración) — a diferencia de revisarActualizacion(), aquí SÍ hace
 * falta informar cuando ya está al día o cuando algo falló, porque el
 * dueño pulsó el botón esperando una respuesta, no un aviso silencioso.
 * @returns {{estado: "disponible"|"al_dia"|"error", version?: string, mensaje?: string}}
 */
export async function revisarActualizacionManual() {
  let update;
  try {
    update = await check();
  } catch (e) {
    return { estado: "error", mensaje: String(e) };
  }
  if (!update) return { estado: "al_dia" };
  mostrarModalActualizacion(update);
  return { estado: "disponible", version: update.version };
}

function mostrarModalActualizacion(update) {
  const html = `
    <h2>Nueva versión disponible</h2>
    <p class="m-sub">YvexPOS ${escapar(update.version)} ya está lista para instalar.</p>
    ${update.body ? `<p class="act-notas">${escapar(update.body)}</p>` : ""}
    <div class="act-progreso" id="act-progreso" hidden>
      <div class="act-progreso-barra"><div class="act-progreso-relleno" id="act-progreso-relleno"></div></div>
      <span class="act-progreso-txt" id="act-progreso-txt">Descargando…</span>
    </div>
    <p class="m-error" id="act-error"></p>
    <div class="m-acciones"><span></span><div>
      <button class="btn-sec" id="act-despues">Más tarde</button>
      <button class="btn-primario" id="act-instalar">Actualizar ahora</button>
    </div></div>
  `;
  // No se cierra solo con Escape ni clic afuera mientras decide — pero
  // "Más tarde" siempre es una salida real, nunca se fuerza la instalación.
  const modal = abrirModal(html, { cerrarAlTocarFuera: false, cerrarConEscape: false });

  modal.querySelector("#act-despues").addEventListener("click", () => cerrarModal(modal));

  modal.querySelector("#act-instalar").addEventListener("click", async () => {
    const btnInstalar = modal.querySelector("#act-instalar");
    const btnDespues = modal.querySelector("#act-despues");
    const progreso = modal.querySelector("#act-progreso");
    const relleno = modal.querySelector("#act-progreso-relleno");
    const txt = modal.querySelector("#act-progreso-txt");
    const err = modal.querySelector("#act-error");

    btnInstalar.disabled = true;
    btnDespues.disabled = true;
    progreso.hidden = false;
    err.textContent = "";

    let total = 0;
    let bajado = 0;
    try {
      await update.downloadAndInstall((evento) => {
        if (evento.event === "Started") {
          total = evento.data.contentLength || 0;
          bajado = 0;
        } else if (evento.event === "Progress") {
          bajado += evento.data.chunkLength || 0;
          if (total > 0) {
            const pct = Math.min(100, Math.round((bajado / total) * 100));
            relleno.style.width = pct + "%";
            txt.textContent = `Descargando… ${pct}%`;
          }
        } else if (evento.event === "Finished") {
          txt.textContent = "Instalando…";
        }
      });
      txt.textContent = "Listo. Reiniciando…";
      relleno.style.width = "100%";
      await relaunch();
    } catch (e) {
      err.textContent = "No se pudo instalar la actualización: " + String(e);
      btnInstalar.disabled = false;
      btnDespues.disabled = false;
    }
  });
}
