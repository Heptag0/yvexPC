// YvexIQ POS — Onboarding por pasos (primer arranque).
//
// Flujo: bienvenida → caja → negocio → dueño (PIN) → equipo (opcional) →
// elección de nube (solo local / local + nube). Al terminar llama a
// `configurar_pos` y entra al POS.
//
// Usa el diseño por pasos: cabecera con marca y progreso, cuerpo centrado,
// navegación atrás/siguiente. Las clases viven en styles.css (.onb-escena,
// .onb-paso, .onb-progreso, etc.).

import { invoke } from "@tauri-apps/api/core";
import { montarVinculacion, detenerPolling } from "../util/vinculacion_ui.js";
import { TEMAS, TEMAS_INFO, ACENTOS, aplicarApariencia, hexAcento } from "../util/apariencia.js";
import { GIROS, obtenerGiro, sugerenciasDepartamentos, crearDepartamentosElegidos } from "../util/giro.js";
import { icono } from "../util/iconos.js";

const ROLES = [
  { valor: "cajero", etiqueta: "Cajero" },
  { valor: "gerente", etiqueta: "Gerente" },
];

// Estado del onboarding (se va llenando paso a paso).
const datos = {
  caja: "Caja 1",
  negocio: "",
  rfc: "",
  cp: "",
  giro: null,
  duenoNombre: "",
  duenoPin: "",
  equipo: [], // {nombre, pin, rol}
  tema: "nocturno",
  acento: "violeta",
};

// Los pasos que cuentan para la barra de progreso (la bienvenida no cuenta).
const PASOS = ["caja", "negocio", "giro", "departamentos", "dueno", "equipo", "apariencia", "cierre", "nube"];

export function montarOnboarding(contenedor, alTerminar) {
  contenedor.innerHTML = "";
  // El diseño nuevo controla su propio layout; quitamos overrides del #app.
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";
  contenedor.style.padding = "0";

  const wrap = document.createElement("div");
  wrap.className = "onb";
  contenedor.appendChild(wrap);

  let indicePaso = -1; // -1 = bienvenida; 0..N = pasos

  function render() {
    const contenidoPaso = indicePaso === -1 ? vistaBienvenida() : vistaPaso(PASOS[indicePaso]);
    wrap.innerHTML = `
      <div class="onb-escena">
        <div class="onb-cabecera">
          <div class="onb-marca">YvexIQ <b>POS</b></div>
          <div class="onb-progreso">${puntosProgreso()}</div>
        </div>
        <div class="onb-cuerpo">${contenidoPaso}</div>
      </div>`;
    conectarPaso();
  }

  function puntosProgreso() {
    return PASOS.map((_, i) => {
      let clase = "onb-paso-punto";
      if (indicePaso > i) clase += " onb-paso-punto--hecho";
      else if (indicePaso === i) clase += " onb-paso-punto--activo";
      return `<span class="${clase}"></span>`;
    }).join("");
  }

  // --- Navegación ---
  function avanzar() {
    if (indicePaso < PASOS.length - 1) {
      indicePaso++;
      render();
    }
  }
  function retroceder() {
    if (indicePaso > -1) {
      indicePaso--;
      detenerPolling();
      render();
    }
  }

  // --- Conectar eventos según el paso actual ---
  function conectarPaso() {
    const $ = (s) => wrap.querySelector(s);

    if (indicePaso === -1) {
      $("#onb-empezar").addEventListener("click", avanzar);
      return;
    }

    const paso = PASOS[indicePaso];

    // Botones de navegación comunes (si existen en el paso).
    const btnAtras = $("#onb-atras");
    if (btnAtras) btnAtras.addEventListener("click", retroceder);

    if (paso === "caja") {
      const input = $("#onb-caja");
      input.value = datos.caja;
      const cont = $("#onb-siguiente");
      cont.addEventListener("click", () => {
        const v = input.value.trim();
        if (!v) return marcar($("#onb-err"), "Escribe un nombre para la caja.");
        datos.caja = v;
        avanzar();
      });
    }

    if (paso === "negocio") {
      $("#onb-negocio").value = datos.negocio;
      $("#onb-rfc").value = datos.rfc;
      $("#onb-cp").value = datos.cp;
      $("#onb-siguiente").addEventListener("click", () => {
        const v = $("#onb-negocio").value.trim();
        if (!v) return marcar($("#onb-err"), "Escribe el nombre del negocio.");
        datos.negocio = v;
        datos.rfc = $("#onb-rfc").value.trim();
        datos.cp = $("#onb-cp").value.trim();
        avanzar();
      });
    }

    if (paso === "giro") {
      wrap.querySelectorAll("[data-giro]").forEach((b) =>
        b.addEventListener("click", () => {
          datos.giro = b.dataset.giro;
          // Nueva sugerencia fresca cada vez que cambia el giro — si el
          // dueño ya había editado la lista de un giro anterior, se
          // reemplaza por la del nuevo (evita mezclar departamentos de
          // giros distintos sin que el dueño se dé cuenta).
          datos.departamentos = sugerenciasDepartamentos(datos.giro);
          render(); // re-pinta para marcar la tarjeta elegida
        })
      );
      const cont = $("#onb-siguiente");
      if (cont) cont.addEventListener("click", () => {
        if (!datos.giro) return marcar($("#onb-err"), "Elige lo que más se parece a tu negocio.");
        avanzar();
      });
    }

    if (paso === "departamentos") {
      wrap.querySelectorAll("[data-depto-check]").forEach((chk) =>
        chk.addEventListener("change", () => {
          const i = Number(chk.dataset.deptoCheck);
          datos.departamentos[i].incluido = chk.checked;
          wrap.querySelector(`[data-depto-fila="${i}"]`)?.classList.toggle("onb-depto--fuera", !chk.checked);
        })
      );
      wrap.querySelectorAll("[data-depto-nombre]").forEach((inp) =>
        inp.addEventListener("input", () => {
          const i = Number(inp.dataset.deptoNombre);
          datos.departamentos[i].nombre = inp.value;
        })
      );
      const cont = $("#onb-siguiente");
      if (cont) cont.addEventListener("click", avanzar);
    }

    if (paso === "cierre") {
      const cont = $("#onb-siguiente");
      if (cont) cont.addEventListener("click", avanzar);
    }

    if (paso === "dueno") {
      const nombre = $("#onb-dueno");
      const pin = $("#onb-pin");
      const hint = $("#onb-pin-hint");
      nombre.value = datos.duenoNombre;
      pin.value = datos.duenoPin;
      pin.addEventListener("input", () => {
        pin.value = pin.value.replace(/\D/g, "").slice(0, 6);
        const v = validarPin(pin.value);
        hint.textContent = v.ok ? "PIN válido" : v.msg;
        hint.className = "onb-hint " + (v.ok ? "onb-hint--ok" : "onb-hint--warn");
      });
      $("#onb-siguiente").addEventListener("click", () => {
        const n = nombre.value.trim();
        if (!n) return marcar($("#onb-err"), "Escribe el nombre del dueño.");
        const v = validarPin(pin.value);
        if (!v.ok) return marcar($("#onb-err"), "PIN del dueño: " + v.msg);
        datos.duenoNombre = n;
        datos.duenoPin = pin.value;
        avanzar();
      });
    }

    if (paso === "equipo") {
      renderEquipo();
      $("#onb-add").addEventListener("click", () => {
        const nombre = $("#onb-nuevo-nombre").value.trim();
        const pinv = $("#onb-nuevo-pin").value;
        const rol = $("#onb-nuevo-rol").value;
        const vp = validarPin(pinv);
        if (!nombre) return marcar($("#onb-add-error"), "Escribe un nombre.");
        if (!vp.ok) return marcar($("#onb-add-error"), vp.msg);
        datos.equipo.push({ nombre, pin: pinv, rol });
        $("#onb-nuevo-nombre").value = "";
        $("#onb-nuevo-pin").value = "";
        $("#onb-add-error").textContent = "";
        renderEquipo();
      });
      $("#onb-siguiente").addEventListener("click", avanzar); // equipo es opcional
    }

    if (paso === "apariencia") {
      conectarApariencia();
    }

    if (paso === "nube") {
      conectarNube();
    }

    function conectarApariencia() {
      // Selección de tema.
      wrap.querySelectorAll("[data-tema]").forEach((b) =>
        b.addEventListener("click", () => {
          datos.tema = b.dataset.tema;
          aplicarApariencia({ apariencia_tema: datos.tema, apariencia_acento: datos.acento });
          render(); // re-pinta para reflejar selección y actualizar swatches
        }));
      // Selección de acento.
      wrap.querySelectorAll("[data-acento]").forEach((b) =>
        b.addEventListener("click", () => {
          datos.acento = b.dataset.acento;
          aplicarApariencia({ apariencia_tema: datos.tema, apariencia_acento: datos.acento });
          render();
        }));
      const cont = wrap.querySelector("#onb-siguiente");
      if (cont) cont.addEventListener("click", avanzar);
    }

    function renderEquipo() {
      const lista = $("#onb-equipo");
      if (!lista) return;
      if (datos.equipo.length === 0) {
        lista.innerHTML = '<li class="onb-equipo-vacio">Sin cajeros ni gerentes todavía (opcional).</li>';
        return;
      }
      lista.innerHTML = datos.equipo.map((u, i) => `
        <li class="onb-equipo-fila">
          <div class="onb-equipo-avatar">${escapar(u.nombre.charAt(0).toUpperCase())}</div>
          <div class="onb-equipo-info"><b>${escapar(u.nombre)}</b><small>${u.rol}</small></div>
          <button data-i="${i}" class="onb-equipo-quitar" title="Quitar">×</button>
        </li>`).join("");
      lista.querySelectorAll(".onb-equipo-quitar").forEach((b) =>
        b.addEventListener("click", () => {
          datos.equipo.splice(Number(b.dataset.i), 1);
          renderEquipo();
        })
      );
    }

    // --- Paso de nube: elección solo local / local + nube ---
    function conectarNube() {
      const local = $("#onb-elige-local");
      const nube = $("#onb-elige-nube");
      if (local) local.addEventListener("click", () => finalizar(alTerminar));
      if (nube) nube.addEventListener("click", mostrarVinculacionNube);
    }

    function mostrarVinculacionNube() {
      // Primero guardamos la config local (crea la caja), luego vinculamos.
      finalizar(() => {
        wrap.querySelector(".onb-cuerpo").innerHTML = `
          <div class="onb-paso">
            <h2 class="onb-h2">Conecta con la nube</h2>
            <p class="onb-desc">Vincula esta caja para vigilar tu negocio desde el celular.</p>
            <div id="onb-vinc-contenedor"></div>
            <div class="onb-nav">
              <button id="onb-nube-saltar" type="button" class="btn-sec">Ahora no, entrar al POS</button>
            </div>
          </div>`;
        const cont = wrap.querySelector("#onb-vinc-contenedor");
        montarVinculacion(cont, {
          compacto: true,
          alVincular: () => { detenerPolling(); alTerminar(); },
        });
        wrap.querySelector("#onb-nube-saltar").addEventListener("click", () => {
          detenerPolling();
          alTerminar();
        });
      }, /*noSalir=*/ true);
    }
  }

  // --- Guardar config local y (opcionalmente) continuar ---
  async function finalizar(despues, noSalir = false) {
    const payload = {
      nombre_dispositivo: datos.caja,
      negocio: {
        nombre: datos.negocio,
        rfc: datos.rfc || null,
        regimen_fiscal: null,
        codigo_postal: datos.cp || null,
      },
      dueno: { nombre: datos.duenoNombre, pin: datos.duenoPin, rol: "dueno" },
      otros_usuarios: datos.equipo,
    };
    try {
      // Evitar configurar dos veces si ya se hizo (al volver de la nube).
      if (!datos._configurado) {
        await invoke("configurar_pos", { payload });
        // Guardar la apariencia elegida (tema + acento) y el giro en config.
        try {
          await invoke("config_guardar_claves", {
            claves: {
              apariencia_tema: datos.tema,
              apariencia_acento: datos.acento,
              zona_horaria: detectarZona(),
              giro: datos.giro || "otro",
            },
            rol: "dueno",
          });
        } catch (_) { /* apariencia y giro son cosméticos: si falla, no bloquea */ }
        // Departamentos: SOLO los que el dueño dejó marcados en el paso de
        // revisión (nunca se crean a ciegas, ya los vio y pudo editarlos).
        try {
          await crearDepartamentosElegidos(invoke, datos.departamentos);
        } catch (e) {
          console.warn("No se pudieron crear los departamentos:", e);
        }
        datos._configurado = true;
      }
      despues();
    } catch (e) {
      const err = wrap.querySelector("#onb-err") || wrap.querySelector(".onb-cuerpo");
      if (err) marcar(err, String(e));
    }
  }

  render();
}

// ===========================================================================
// Vistas de cada paso
// ===========================================================================
function vistaBienvenida() {
  return `
    <div class="onb-bienvenida onb-paso">
      <div class="onb-simbolo-grande">
        <svg viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle class="onb-nucleo" cx="32" cy="40" r="20" fill="url(#g)" opacity="0.9"/>
          <defs><linearGradient id="g" x1="12" y1="20" x2="52" y2="60">
            <stop stop-color="#8b5cf6"/><stop offset="1" stop-color="#2dd4bf"/>
          </linearGradient></defs>
        </svg>
      </div>
      <h1 class="onb-h1">Bienvenido a YvexPOS</h1>
      <p class="onb-lead">Vamos a configurar esta caja. Toma menos de un minuto y tu punto de venta quedará listo para vender.</p>
      <div class="onb-nav" style="justify-content:center;margin-top:32px;">
        <button id="onb-empezar" type="button" class="btn-primario onb-siguiente">Empezar</button>
      </div>
    </div>`;
}

function vistaPaso(paso) {
  if (paso === "caja") {
    return envolver(`
      <h2 class="onb-h2">Esta caja</h2>
      <p class="onb-desc">Ponle un nombre a esta caja registradora. Si tienes varias, esto te ayuda a distinguirlas.</p>
      <label class="onb-campo">
        <span>Nombre de la caja</span>
        <input id="onb-caja" placeholder="Caja 1" />
      </label>
      <p id="onb-err" class="onb-hint onb-hint--warn"></p>`,
      { atras: false });
  }
  if (paso === "negocio") {
    return envolver(`
      <h2 class="onb-h2">Tu negocio</h2>
      <p class="onb-desc">El nombre aparecerá en los tickets. Los datos fiscales son opcionales (para facturar después).</p>
      <label class="onb-campo">
        <span>Nombre del negocio</span>
        <input id="onb-negocio" placeholder="Tienda de la Esquina" />
      </label>
      <div class="onb-fila-2">
        <label class="onb-campo">
          <span>RFC <small>(opcional)</small></span>
          <input id="onb-rfc" placeholder="Para facturar después" />
        </label>
        <label class="onb-campo">
          <span>Código postal <small>(opcional)</small></span>
          <input id="onb-cp" placeholder="82000" />
        </label>
      </div>
      <p id="onb-err" class="onb-hint onb-hint--warn"></p>`);
  }
  if (paso === "giro") {
    return envolver(`
      <h2 class="onb-h2">¿Qué vende tu negocio?</h2>
      <p class="onb-desc">Con esto te sugerimos departamentos de arranque y te mostramos lo que más te va a servir. Lo puedes cambiar cuando quieras.</p>
      <div class="onb-giros">
        ${GIROS.map((g) => `
          <button type="button" class="onb-giro ${g.id === datos.giro ? "onb-giro--activo" : ""}" data-giro="${g.id}">
            <span class="onb-giro-ico">${iconoGiro(g.icono)}</span>
            <span class="onb-giro-nombre">${g.nombre}</span>
            <span class="onb-giro-frase">${g.frase}</span>
          </button>`).join("")}
      </div>
      <p id="onb-err" class="onb-hint onb-hint--warn"></p>`,
      { siguiente: "Continuar" });
  }
  if (paso === "departamentos") {
    const lista = datos.departamentos || [];
    const cuerpo = lista.length === 0
      ? `<p class="onb-desc">Este giro no trae departamentos sugeridos — no hay problema, los creas cuando quieras desde Inventario.</p>`
      : `
        <p class="onb-desc">Te sugerimos estos según tu giro. Desmarca los que no uses, o cámbiales el nombre — se crean tal como los dejes aquí.</p>
        <div class="onb-deptos">
          ${lista.map((d, i) => `
            <div class="onb-depto ${d.incluido ? "" : "onb-depto--fuera"}" data-depto-fila="${i}">
              <input type="checkbox" data-depto-check="${i}" ${d.incluido ? "checked" : ""} id="onb-depto-chk-${i}" />
              <span class="onb-depto-ico">${iconoGiro(d.icono || "puntos")}</span>
              <input type="text" class="onb-depto-nombre" data-depto-nombre="${i}" value="${escapar(d.nombre)}" />
            </div>`).join("")}
        </div>`;
    return envolver(`
      <h2 class="onb-h2">Revisa tus departamentos</h2>
      ${cuerpo}
      <p id="onb-err" class="onb-hint onb-hint--warn"></p>`,
      { siguiente: lista.length === 0 ? "Continuar" : "Crear y continuar" });
  }
  if (paso === "cierre") {
    const giro = obtenerGiro(datos.giro);
    return `
      <div class="onb-paso onb-cierre">
        <h2 class="onb-h2">Listo, ${escapar(datos.negocio || "tu negocio")}</h2>
        <p class="onb-desc">Esto es lo que más te va a servir en ${escapar(giro.nombre.toLowerCase())}:</p>
        <ul class="onb-sugerencias">
          ${giro.sugerencias.slice(0, 3).map((s) => `<li>${escapar(s)}</li>`).join("")}
        </ul>
        <div class="onb-nav">
          <button id="onb-atras" type="button" class="btn-sec">← Atrás</button>
          <button id="onb-siguiente" type="button" class="btn-primario onb-siguiente">Continuar</button>
        </div>
      </div>`;
  }
  if (paso === "dueno") {
    return envolver(`
      <h2 class="onb-h2">Dueño</h2>
      <p class="onb-desc">El dueño tiene acceso completo: precios, costos, usuarios y reportes. Entra con un PIN.</p>
      <label class="onb-campo">
        <span>Nombre del dueño</span>
        <input id="onb-dueno" placeholder="Tu nombre" />
      </label>
      <label class="onb-campo">
        <span>PIN (4 a 6 dígitos)</span>
        <input id="onb-pin" inputmode="numeric" placeholder="••••" />
      </label>
      <p id="onb-pin-hint" class="onb-hint"></p>
      <p id="onb-err" class="onb-hint onb-hint--warn"></p>`);
  }
  if (paso === "equipo") {
    const opcionesRol = ROLES.map((r) => `<option value="${r.valor}">${r.etiqueta}</option>`).join("");
    return envolver(`
      <h2 class="onb-h2">Cajeros y gerentes <small style="font-weight:500;color:var(--texto-debil);">(opcional)</small></h2>
      <p class="onb-desc">Puedes añadir tu equipo ahora o después. Cada uno entra con su propio PIN.</p>
      <ul id="onb-equipo" class="onb-equipo"></ul>
      <div class="onb-agregar">
        <input id="onb-nuevo-nombre" placeholder="Nombre" />
        <input id="onb-nuevo-pin" inputmode="numeric" placeholder="PIN" maxlength="6" />
        <select id="onb-nuevo-rol">${opcionesRol}</select>
        <button id="onb-add" type="button" class="btn-sec">Añadir</button>
      </div>
      <p id="onb-add-error" class="onb-hint onb-hint--warn"></p>`,
      { siguiente: "Continuar" });
  }
  if (paso === "apariencia") {
    return envolver(`
      <h2 class="onb-h2">Personaliza tu POS</h2>
      <p class="onb-desc">Elige el tema y color con el que te sientas cómodo. Podrás cambiarlo cuando quieras.</p>
      <div class="onb-temas">
        ${TEMAS.map((t) => `
          <button type="button" class="onb-tema ${t === datos.tema ? "onb-tema--activo" : ""}" data-tema="${t}">
            <div class="onb-tema-preview onb-tema-preview--${t}">
              <div class="onb-tema-barra"></div>
              <div class="onb-tema-punto" style="background:${hexAcento(datos.acento, t)}"></div>
            </div>
            <div class="onb-tema-nombre">${TEMAS_INFO[t].nombre}</div>
            <div class="onb-tema-alma">${TEMAS_INFO[t].alma}</div>
          </button>`).join("")}
      </div>
      <div class="onb-acento-zona">
        <span class="onb-acento-lbl">Color de acento</span>
        <div class="onb-acentos">
          ${ACENTOS.map((a) => `
            <button type="button" class="onb-acento ${a.id === datos.acento ? "onb-acento--activo" : ""}"
              data-acento="${a.id}" title="${a.nombre}"
              style="background:${hexAcento(a.id, datos.tema)}"></button>`).join("")}
        </div>
      </div>`,
      { siguiente: "Continuar" });
  }

  if (paso === "nube") {
    return `
      <div class="onb-paso">
        <h2 class="onb-h2">¿Cómo quieres usar YvexPOS?</h2>
        <p class="onb-desc">Tu punto de venta funciona completo sin internet. La cuenta en la nube es un extra opcional.</p>
        <div class="onb-nube-opciones">
          <button type="button" class="onb-nube-card" id="onb-elige-local">
            <div class="onb-nube-icono">${icono("computadora")}</div>
            <h2>Solo local</h2>
            <p class="onb-nube-sub">Todo en esta computadora</p>
            <ul class="onb-nube-lista">
              <li>Vende, cobra e imprime tickets</li>
              <li>Inventario, cortes y reportes</li>
              <li>Funciona sin internet, siempre</li>
              <li>Tus datos solo en esta caja</li>
            </ul>
            <span class="onb-nube-elegir">Empezar así →</span>
          </button>
          <button type="button" class="onb-nube-card onb-nube-card--destacada" id="onb-elige-nube">
            <div class="onb-nube-badge">Recomendado</div>
            <div class="onb-nube-icono">${icono("nube")}</div>
            <h2>Local + nube</h2>
            <p class="onb-nube-sub">Todo lo local, y además…</p>
            <ul class="onb-nube-lista">
              <li><strong>Vigila tu negocio desde el celular</strong></li>
              <li>Mira ventas y cortes en tiempo real</li>
              <li>Respaldo de tus datos en la nube</li>
              <li>Alertas y reportes a distancia</li>
            </ul>
            <span class="onb-nube-elegir onb-nube-elegir--destacada">Crear mi cuenta →</span>
          </button>
        </div>
        <div class="onb-nav">
          <button id="onb-atras" type="button" class="btn-sec">← Atrás</button>
        </div>
        <p class="onb-nube-nota">Puedes activar o quitar la cuenta en la nube cuando quieras, desde <strong>Configuración → Conexión con la nube</strong>.</p>
      </div>`;
  }
  return "";
}

// Envuelve el contenido de un paso con navegación atrás/siguiente estándar.
function envolver(html, opciones = {}) {
  const { atras = true, siguiente = "Siguiente" } = opciones;
  return `
    <div class="onb-paso">
      ${html}
      <div class="onb-nav">
        ${atras ? '<button id="onb-atras" type="button" class="btn-sec">← Atrás</button>' : '<span></span>'}
        <button id="onb-siguiente" type="button" class="btn-primario onb-siguiente">${siguiente}</button>
      </div>
    </div>`;
}

// ===========================================================================
// Helpers
// ===========================================================================
function validarPin(pin) {
  if (pin.length < 4 || pin.length > 6)
    return { ok: false, msg: "El PIN debe tener entre 4 y 6 dígitos." };
  if (!/^\d+$/.test(pin))
    return { ok: false, msg: "El PIN solo puede contener dígitos." };
  return { ok: true, msg: "" };
}
function marcar(box, msg) {
  if (box) box.textContent = msg;
}
function escapar(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// SVG chico para las tarjetas de giro (24×24, currentColor).
function iconoGiro(id) {
  const RUTAS = {
    tienda:   'M4 9l1.5-5h13L20 9M4 9h16M5 9v11h14V9M9 20v-6h6v6',
    ropa:     'M9 4l-6 3 2 4 2-1v10h10V10l2 1 2-4-6-3a3 3 0 0 1-6 0z',
    taza:     'M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
    cubiertos:'M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 14v7M17 3c-2 0-3 2.5-3 5v3h3v10M17 3v8',
    capsula:  'M8 4h8a4 4 0 0 1 0 8h-8a4 4 0 0 1 0-8zM12 4v8M6 16h12v4H6z',
    llave:    'M14.5 6.5a4 4 0 0 0-5.6 5L3 17.5 6.5 21l6-5.9a4 4 0 0 0 5-5.6L14 13l-2.5-.5L11 10l3.5-3.5z',
    chip:     'M6 6h12v12H6zM10 10h4v4h-4zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3',
    brillo:   'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2L16 18l2.2-.8L19 16z',
    pata:     'M12 13c-3 0-6 2.2-6 4.6a2 2 0 0 0 4 .6c.6-.4 1.3-.6 2-.6s1.4.2 2 .6a2 2 0 0 0 4-.6c0-2.4-3-4.6-6-4.6zM7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4.5 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM19.5 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    puntos:   'M5 12h.01M12 12h.01M19 12h.01',
  };
  const d = RUTAS[id] || RUTAS.puntos;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}


// Detecta la zona horaria del sistema operativo (ej. "America/Mazatlan").
// Si el navegador no la da, cae a un valor seguro.
function detectarZona() {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return z || "America/Mexico_City";
  } catch (_) {
    return "America/Mexico_City";
  }
}
