// YvexPOS — apertura de caja.
// Se muestra tras el login si no hay caja abierta. Declara el fondo inicial.
// Invariante del plano: no se puede vender sin una caja_sesion abierta.
//
// Es la primera pantalla del turno: lo primero que ve quien va a estar diez
// horas detrás del mostrador. Por eso se trata como un momento y no como un
// formulario suelto — el monto es el protagonista y se teclea directo, sin
// tener que buscar dónde hacer clic.

import { invoke } from "@tauri-apps/api/core";
import { escapar } from "../util/formato.js";

/** Montos que cubren la mayoría de aperturas reales de una tienda chica.
 *  Un toque y listo: teclear "500.00" doscientas veces al año es fricción
 *  que no aporta nada. */
const SUGERIDOS = [0, 20000, 50000, 100000];

export function montarAbrirCaja(contenedor, sesion, alAbrir) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "center";
  contenedor.style.justifyContent = "center";

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  const wrap = document.createElement("div");
  wrap.className = "caja-abrir";
  wrap.innerHTML = `
    <div class="caja-card con-luz">
      <div class="caja-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <circle cx="12" cy="12" r="2.5"/>
          <path d="M6 12h.01M18 12h.01"/>
        </svg>
      </div>
      <h1>Abrir caja</h1>
      <p class="caja-saludo">${saludo}, ${escapar(sesion.nombre)}. ¿Con cuánto efectivo empiezas?</p>

      <div class="caja-monto caja-monto--hero">
        <span class="caja-signo">$</span>
        <input id="caja-fondo" class="num" inputmode="decimal" placeholder="0.00" autocomplete="off" />
      </div>

      <div class="caja-sugeridos" id="caja-sugeridos">
        ${SUGERIDOS.map(
          (c) =>
            `<button class="caja-sug" data-cent="${c}">${c === 0 ? "Sin fondo" : "$" + (c / 100).toLocaleString("es-MX")}</button>`
        ).join("")}
      </div>

      <p class="m-error" id="caja-error"></p>
      <button class="btn-primario caja-btn" id="caja-confirmar">Abrir caja y empezar</button>
      <p class="caja-nota">El fondo inicial es el dinero con el que empiezas el turno. Sirve para cuadrar el corte al cerrar.</p>
    </div>
  `;
  contenedor.appendChild(wrap);

  const input = wrap.querySelector("#caja-fondo");
  const err = wrap.querySelector("#caja-error");
  const btn = wrap.querySelector("#caja-confirmar");
  setTimeout(() => input.focus(), 60);

  // Los montos sugeridos rellenan el campo; no abren el turno solos. Confirmar
  // sigue siendo un acto deliberado: es dinero real y el corte depende de esto.
  wrap.querySelectorAll(".caja-sug").forEach((b) =>
    b.addEventListener("click", () => {
      const c = Number(b.dataset.cent);
      input.value = c === 0 ? "" : (c / 100).toFixed(2);
      wrap.querySelectorAll(".caja-sug").forEach((x) => x.classList.remove("caja-sug--activo"));
      b.classList.add("caja-sug--activo");
      input.focus();
      err.textContent = "";
    })
  );
  // Teclear a mano descarta la sugerencia marcada.
  input.addEventListener("input", () =>
    wrap.querySelectorAll(".caja-sug").forEach((x) => x.classList.remove("caja-sug--activo"))
  );

  async function confirmar() {
    err.textContent = "";
    // Campo vacío = sin fondo (0). Enter directo abre el turno con $0.
    const texto = (input.value || "").trim().replace(",", ".");
    const v = texto === "" ? 0 : parseFloat(texto);
    if (isNaN(v) || v < 0) {
      err.textContent = "Ingresa un monto válido (puede ser 0).";
      input.focus();
      return;
    }
    const centavos = Math.round(v * 100);
    btn.disabled = true;
    btn.textContent = "Abriendo…";
    try {
      const sesionCaja = await invoke("caja_abrir", {
        usuarioPosId: sesion.id,
        fondoInicialCentavos: centavos,
      });
      alAbrir(sesionCaja);
    } catch (e) {
      err.textContent = String(e);
      btn.disabled = false;
      btn.textContent = "Abrir caja y empezar";
    }
  }

  btn.addEventListener("click", confirmar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmar();
  });
}
