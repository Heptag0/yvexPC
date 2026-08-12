// YvexPOS — Shell de navegación: barra de título + sidebar + cajón + barra de estado.
// -----------------------------------------------------------------------------
// Se monta UNA vez tras login + caja abierta, y vive mientras dura la sesión.
// Las vistas se montan dentro de shell.contenido (que replica el rol del viejo
// #app), así que NO necesitan cambios: reciben un elemento y lo controlan.
//
// Uso desde main.js:
//   const shell = montarShell(app, sesion, {
//     alNavegar: (mod) => abrirModulo(mod),
//     alSalir:   () => irALogin(),
//     cajaSesion,                              // para la barra de estado
//   });
//   shell.contenido            → elemento donde montar cada vista
//   shell.marcarActivo("venta")→ resalta el ítem del módulo activo
//   shell.lineaVida.exito()    → recorrido verde (venta cobrada); vuelve solo
//
// ── QUÉ CAMBIÓ EN ESTA VERSIÓN Y POR QUÉ ────────────────────────────────────
// El sidebar mostraba los 16 módulos con el mismo peso visual: "Venta" (que se
// usa 200 veces al día) se veía igual que "Etiquetado NOM" (una vez al mes).
// Eso es lo que lo hacía ver lleno y desordenado — no había jerarquía que
// guiara el ojo.
//
// Ahora el sidebar muestra SOLO lo que el dueño fija, agrupado y con nombre.
// Todo lo demás vive en un cajón que se abre sobre la pantalla con el fondo
// difuminado. Desde ahí se arrastra al sidebar para fijar (o se usa el botón
// "Fijar", que es más seguro con mouse de tienda).
//
// La elección se guarda en config (`sidebar_fijados`), así que sobrevive al
// reinicio. Si guardar falla (un cajero no tiene permiso de escribir config),
// el cambio se conserva en memoria hasta cerrar sesión — no se rompe nada.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { alternarPantallaCompleta, estaEnPantallaCompleta } from "./pantalla_completa.js";
import { icono } from "./iconos.js";
import { escapar } from "./formato.js";

// ---------------------------------------------------------------------------
// Puentes globales (sin cambios: las vistas los siguen usando igual)
// ---------------------------------------------------------------------------
let lvActual = null;
export const lineaVida = {
  operando() { if (lvActual) lvActual.operando(); },
  exito()    { if (lvActual) lvActual.exito(); },
  atencion(t){ if (lvActual) lvActual.atencion(t); },
};

let badgeActual = null;
export const badgePedidos = {
  actualizar(n) { if (badgeActual) badgeActual(n); },
};

// Estado de sincronización en la barra inferior. Lo puede llamar cualquier
// vista tras sincronizar, igual que lineaVida.
let syncActual = null;
export const estadoSync = {
  /** modo: "ok" | "pendiente" | "sin" ; texto opcional */
  fijar(modo, texto) { if (syncActual) syncActual(modo, texto); },
};

// ---------------------------------------------------------------------------
// Catálogo de módulos, agrupado por lo que la persona viene a hacer.
// El grupo NO es decorativo: es lo que permite encontrar algo sin leer los 16.
// ---------------------------------------------------------------------------
const GRUPOS = [
  {
    id: "caja",
    titulo: "Tu caja",
    items: [
      { mod: "inicio", texto: "Inicio", ico: "inicio" },
      { mod: "venta", texto: "Venta", ico: "venta", tecla: "F2" },
      { mod: "caja", texto: "Corte", ico: "caja" },
    ],
  },
  {
    id: "negocio",
    titulo: "Tu negocio",
    items: [
      { mod: "inventario", texto: "Productos", ico: "inventario" },
      { mod: "existencias", texto: "Inventario", ico: "existencias" },
      { mod: "dinero", texto: "Dinero", ico: "dinero" },
      { mod: "reportes", texto: "Reportes", ico: "reportes", roles: ["dueno", "gerente"] },
    ],
  },
  {
    id: "gente",
    titulo: "Tu gente",
    items: [
      { mod: "clientes", texto: "Clientes", ico: "clientes" },
      { mod: "lealtad", texto: "Lealtad", ico: "lealtad" },
      { mod: "credito", texto: "Crédito", ico: "credito" },
      { mod: "proveedores", texto: "Proveedores", ico: "proveedor" },
    ],
  },
  {
    id: "vender",
    titulo: "Vender más",
    items: [
      { mod: "pedidosweb", texto: "Pedidos web", ico: "pedidos", badge: true },
      { mod: "tienda", texto: "Tienda", ico: "tienda" },
      { mod: "cotizaciones", texto: "Cotizaciones", ico: "cotizacion" },
    ],
  },
  {
    id: "taller",
    titulo: "Herramientas",
    items: [
      { mod: "etiquetas", texto: "Etiquetado NOM", ico: "etiqueta_nom" },
      { mod: "recetas", texto: "Recetas", ico: "receta" },
      { mod: "configuracion", texto: "Configuración", ico: "configuracion", roles: ["dueno", "gerente"] },
    ],
  },
];

const TODOS = GRUPOS.flatMap((g) => g.items.map((i) => ({ ...i, grupo: g.id })));

/** Lo que ve alguien que nunca ha tocado la configuración: lo del día a día.
 *  Inicio y Venta no se pueden quitar (ver FIJOS_SIEMPRE). */
const FIJADOS_DEFECTO = ["inicio", "venta", "caja", "inventario", "dinero", "reportes"];

/** Estos nunca se pueden desfijar: sin ellos el POS no se puede usar. */
const FIJOS_SIEMPRE = ["inicio", "venta"];

const CLAVE_CONFIG = "sidebar_fijados";
const CLAVE_MODO = "sidebar_modo"; // "bloqueado" | "desbloqueado"

function porMod(mod) {
  return TODOS.find((i) => i.mod === mod);
}

// ---------------------------------------------------------------------------
export function montarShell(raiz, sesion, { alNavegar, alSalir, cajaSesion }) {
  raiz.style.cssText = "align-items:stretch;justify-content:flex-start;padding:0;";

  const puede = (it) => !it.roles || it.roles.includes(sesion.rol);
  let fijados = FIJADOS_DEFECTO.slice();
  let modActivo = "inicio";
  // "bloqueado": el sidebar de siempre, fijo y siempre visible.
  // "desbloqueado": se reduce a un tirador de 10px; al pasar el mouse se
  // expande FLOTANDO sobre el contenido (no lo empuja — si empujara Venta
  // 218px cada vez que el mouse pasa cerca del borde, sería insufrible para
  // quien cobra con precisión). Mismo patrón que VS Code.
  let modoSidebar = "bloqueado";

  const win = getCurrentWindow();

  raiz.innerHTML = `
    <div class="shell">
      <header class="tb" data-tauri-drag-region>
        <div class="tb-marca" data-tauri-drag-region>
          <svg viewBox="0 0 64 64" fill="none" width="19" height="19" aria-hidden="true">
            <path d="M14 12 L32 38 L50 12" stroke="url(#tbg)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M32 38 L32 52" stroke="url(#tbg)" stroke-width="8" stroke-linecap="round"/>
            <defs><linearGradient id="tbg" x1="14" y1="12" x2="50" y2="52">
              <stop stop-color="var(--marca-a)"/><stop offset="1" stop-color="var(--marca-b)"/>
            </linearGradient></defs>
          </svg>
          <span class="tb-negocio" id="tb-negocio">YvexPOS</span>
          <span class="tb-sep"></span>
          <small class="tb-prod">YvexPOS</small>
        </div>
        <div class="tb-drag" data-tauri-drag-region></div>
        <div class="tb-ctrl">
          <button class="tb-btn" id="tb-min" title="Minimizar" aria-label="Minimizar">
            <svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 6h8" stroke="currentColor" stroke-width="1.3"/></svg>
          </button>
          <button class="tb-btn" id="tb-max" title="Maximizar" aria-label="Maximizar">
            <svg viewBox="0 0 12 12" width="11" height="11"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
          </button>
          <button class="tb-btn tb-btn--cerrar" id="tb-cerrar" title="Cerrar" aria-label="Cerrar">
            <svg viewBox="0 0 12 12" width="11" height="11"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.3"/></svg>
          </button>
        </div>
      </header>

      <div class="shell-fila">
        <nav class="sb" id="shell-sb" aria-label="Navegación principal">
          <div class="sb-lista" id="sb-lista"></div>
          <div class="sb-fin">
            <button class="sb-cajon-btn" id="sb-abrir-cajon" title="Todos los módulos">
              <span class="sb-ico">${puntitos()}</span>
              <span class="sb-texto">Todo lo demás</span>
            </button>
            <div class="sb-user" title="${escapar(sesion.nombre)} · ${escapar(sesion.rol)}">
              <span class="sb-avatar" style="--rol-color:var(--rol-${escapar(sesion.rol)})">
                ${escapar((sesion.nombre || "?").trim()[0] || "?").toUpperCase()}
              </span>
              <span class="sb-user-txt">
                <b>${escapar(sesion.nombre)}</b>
                <small>${escapar(sesion.rol)} · Caja</small>
              </span>
            </div>
            <button class="sb-item sb-salir" id="shell-salir" title="Cerrar sesión">
              <span class="sb-ico">${icono("salir")}</span>
              <span class="sb-texto">Cerrar sesión</span>
            </button>
            <button class="sb-candado" id="sb-candado" title="Siempre visible" aria-label="Alternar modo del menú">
              ${icono("candado")}
            </button>
          </div>
        </nav>
        <div class="shell-contenido" id="shell-contenido"></div>
      </div>

      <footer class="shell-pie">
        <div class="linea-vida" id="shell-lv"></div>
        <div class="pie-fila">
          <button class="pie-celda" id="shell-estado"><i class="pie-punto"></i><b>Operando</b></button>
          <button class="pie-celda" id="pie-turno"></button>
          <div class="pie-hueco"></div>
          <button class="pie-celda" id="pie-sync"><i class="pie-punto"></i><span>Local</span></button>
          <span class="pie-celda pie-celda--quieta">${escapar(sesion.nombre)} · ${escapar(sesion.rol)}</span>
          <span class="pie-celda pie-celda--quieta num" id="pie-reloj"></span>
        </div>
      </footer>

      <div class="cajon-velo" id="cajon-velo" hidden>
        <div class="cajon" role="dialog" aria-label="Todos los módulos">
          <div class="cajon-top">
            <h3>Todo lo demás</h3>
            <p>Arrastra al menú lo que uses seguido</p>
            <button class="cajon-x" id="cajon-cerrar" aria-label="Cerrar">✕</button>
          </div>
          <div id="cajon-cuerpo"></div>
          <div class="cajon-pista">
            ${flechasMover()}
            Arrastra un módulo al menú de la izquierda para fijarlo, o sácalo de ahí para guardarlo aquí.
          </div>
        </div>
      </div>
    </div>
  `;

  const lv = raiz.querySelector("#shell-lv");
  const estadoTxt = raiz.querySelector("#shell-estado");
  const contenido = raiz.querySelector("#shell-contenido");
  const listaSb = raiz.querySelector("#sb-lista");
  const velo = raiz.querySelector("#cajon-velo");
  const cuerpoCajon = raiz.querySelector("#cajon-cuerpo");
  let volverTimer = null;

  // --- controles de ventana ---
  raiz.querySelector("#tb-min").addEventListener("click", () => win.minimize());
  raiz.querySelector("#tb-cerrar").addEventListener("click", () => win.close());

  // Pantalla completa: la lógica delicada (el "empujón" para el bug de
  // redibujado de WebView2, y el arreglo de físicos-vs-lógicos que causó
  // el "efecto zoom" la vez pasada) vive en util/pantalla_completa.js — la
  // usa también main.js para que el login arranque ya en pantalla completa,
  // sin duplicar el código delicado en dos sitios.
  const btnMax = raiz.querySelector("#tb-max");
  btnMax.addEventListener("click", async () => {
    try {
      const quedoCompleta = await alternarPantallaCompleta();
      btnMax.classList.toggle("tb-btn--activo", quedoCompleta);
      btnMax.title = quedoCompleta ? "Salir de pantalla completa (F11)" : "Pantalla completa (F11)";
    } catch (e) {
      // Sin permiso de fullscreen en capabilities: al menos maximiza.
      win.toggleMaximize().catch(() => {});
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "F11") { e.preventDefault(); btnMax.click(); }
  });
  // El botón refleja el estado real (Rust ya cubrió la pantalla al arrancar,
  // antes de que este shell existiera). Se usa estaEnPantallaCompleta() y no
  // win.isFullscreen(): para el sistema esto NO es fullscreen, es una ventana
  // normal del tamaño del monitor — isFullscreen() siempre diría false.
  estaEnPantallaCompleta().then((completa) => {
    btnMax.classList.toggle("tb-btn--activo", completa);
    btnMax.title = completa ? "Salir de pantalla completa (F11)" : "Pantalla completa (F11)";
  }).catch(() => {});

  // --- nombre del negocio en la barra de título ---
  // Es SU negocio; YvexPOS es la herramienta. Por eso el nombre va grande y
  // la marca queda de segunda.
  invoke("config_leer_todo")
    .then((cfg) => {
      const n = cfg && cfg.negocio_nombre;
      const fijados_guardados = cfg && cfg[CLAVE_CONFIG];
      if (n) raiz.querySelector("#tb-negocio").textContent = n;
      if (fijados_guardados) {
        const lista = fijados_guardados.split(",").map((s) => s.trim()).filter(Boolean);
        const validos = lista.filter((m) => porMod(m) && puede(porMod(m)));
        if (validos.length) {
          fijados = Array.from(new Set(FIJOS_SIEMPRE.concat(validos)));
          pintarSidebar();
        }
      }
      const modoGuardado = cfg && cfg[CLAVE_MODO];
      if (modoGuardado === "desbloqueado" || modoGuardado === "bloqueado") {
        aplicarModoSidebar(modoGuardado);
      }
    })
    .catch(() => {});

  // --- candado: bloqueado (fijo) / desbloqueado (se oculta, flota al hover) ---
  const sbEl = raiz.querySelector("#shell-sb");
  const btnCandado = raiz.querySelector("#sb-candado");

  function aplicarModoSidebar(modo) {
    modoSidebar = modo;
    sbEl.classList.toggle("sb--desbloqueado", modo === "desbloqueado");
    btnCandado.innerHTML = icono(modo === "bloqueado" ? "candado" : "candado_abierto");
    btnCandado.title = modo === "bloqueado" ? "Siempre visible — clic para auto-ocultar" : "Auto-ocultar — clic para fijar";
  }

  btnCandado.addEventListener("click", () => {
    const nuevo = modoSidebar === "bloqueado" ? "desbloqueado" : "bloqueado";
    aplicarModoSidebar(nuevo);
    // Best-effort, mismo patrón que fijar/desfijar módulos: si falla (un
    // cajero sin permiso de escribir config), el modo se queda en memoria
    // el resto de la sesión, no rompe nada.
    invoke("config_guardar_claves", { claves: { [CLAVE_MODO]: nuevo }, rol: sesion.rol }).catch(() => {});
  });

  // --- sidebar ---
  function pintarSidebar() {
    const porGrupo = GRUPOS.map((g) => ({
      titulo: g.titulo,
      items: g.items.filter((i) => puede(i) && fijados.includes(i.mod)),
    })).filter((g) => g.items.length);

    listaSb.innerHTML = porGrupo
      .map(
        (g) => `
        <div class="sb-grupo">
          <div class="sb-grupo-tit">${escapar(g.titulo)}</div>
          ${g.items
            .map(
              (it) => `
            <button class="sb-item" data-mod="${it.mod}" draggable="true" title="${escapar(it.texto)}">
              <span class="sb-ico">${icono(it.ico)}</span>
              <span class="sb-texto">${escapar(it.texto)}</span>
              ${it.tecla ? `<span class="sb-tecla num">${it.tecla}</span>` : ""}
              ${it.badge ? '<span class="sb-badge" id="sb-badge-pedidos" hidden></span>' : ""}
            </button>`
            )
            .join("")}
        </div>`
      )
      .join("");

    listaSb.querySelectorAll(".sb-item[data-mod]").forEach((b) => {
      b.addEventListener("click", () => alNavegar(b.dataset.mod));
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", b.dataset.mod);
        e.dataTransfer.effectAllowed = "move";
        b.classList.add("sb-item--arrastrando");
        iniciarArrastre(b.dataset.mod);
      });
      b.addEventListener("dragend", () => {
        b.classList.remove("sb-item--arrastrando");
        terminarArrastre();
      });
    });

    marcarActivo(modActivo);
    reconectarBadge();
  }

  // ── Arrastrar y soltar ──────────────────────────────────────────────────
  // Soltar en el sidebar = fijar. Soltar en el cajón = desfijar.
  //
  // OJO: mientras dura un arrastre se marca <html class="arrastrando">. El CSS
  // usa esa marca para que el velo del cajón DEJE PASAR el puntero y el
  // sidebar suba por encima; si no, el cajón tapa el sidebar y soltar ahí es
  // literalmente imposible.
  //
  // `modArrastrado` guarda el módulo en curso: en algunos navegadores
  // dataTransfer viene vacío durante dragover, y sin él no se puede decidir
  // si resaltar la zona.
  let modArrastrado = null;
  function iniciarArrastre(mod) {
    modArrastrado = mod;
    document.documentElement.classList.add("arrastrando");
  }
  function terminarArrastre() {
    modArrastrado = null;
    document.documentElement.classList.remove("arrastrando");
    sb.classList.remove("sb--recibiendo");
    velo.classList.remove("cajon--recibiendo");
  }

  const sb = raiz.querySelector("#shell-sb");
  sb.addEventListener("dragover", (e) => {
    if (!modArrastrado) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!fijados.includes(modArrastrado)) sb.classList.add("sb--recibiendo");
  });
  sb.addEventListener("dragleave", (e) => {
    if (!sb.contains(e.relatedTarget)) sb.classList.remove("sb--recibiendo");
  });
  sb.addEventListener("drop", (e) => {
    e.preventDefault();
    sb.classList.remove("sb--recibiendo");
    fijar(e.dataTransfer.getData("text/plain") || modArrastrado);
  });

  // Soltar sobre el cajón devuelve el módulo (lo desfija).
  velo.addEventListener("dragover", (e) => {
    if (!modArrastrado) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (fijados.includes(modArrastrado) && !FIJOS_SIEMPRE.includes(modArrastrado)) {
      velo.classList.add("cajon--recibiendo");
    }
  });
  velo.addEventListener("dragleave", (e) => {
    if (!velo.contains(e.relatedTarget)) velo.classList.remove("cajon--recibiendo");
  });
  velo.addEventListener("drop", (e) => {
    e.preventDefault();
    velo.classList.remove("cajon--recibiendo");
    desfijar(e.dataTransfer.getData("text/plain") || modArrastrado);
  });

  function fijar(mod) {
    if (!mod || !porMod(mod) || fijados.includes(mod)) return;
    fijados.push(mod);
    guardarFijados();
    pintarSidebar();
    pintarCajon();
  }

  function desfijar(mod) {
    if (FIJOS_SIEMPRE.includes(mod)) return;
    fijados = fijados.filter((m) => m !== mod);
    guardarFijados();
    pintarSidebar();
    pintarCajon();
  }

  // Guardar es best-effort: un cajero no tiene permiso de escribir config, y
  // eso NO debe romperle la navegación. Si falla, el cambio vive en memoria
  // hasta cerrar sesión.
  function guardarFijados() {
    invoke("config_guardar_claves", {
      claves: { [CLAVE_CONFIG]: fijados.join(",") },
      rol: sesion.rol,
    }).catch(() => {});
  }

  // --- cajón ---
  function pintarCajon() {
    cuerpoCajon.innerHTML = GRUPOS.map((g) => {
      const items = g.items.filter(puede);
      if (!items.length) return "";
      return `
        <div class="cajon-grupo">${escapar(g.titulo)}</div>
        <div class="cajon-rejilla">
          ${items
            .map((it) => {
              const yaEsta = fijados.includes(it.mod);
              const bloqueado = FIJOS_SIEMPRE.includes(it.mod);
              return `
              <div class="mod ${yaEsta ? "mod--fijado" : ""}" data-mod="${it.mod}" draggable="true">
                <span class="mod-ico">${icono(it.ico)}</span>
                <div class="mod-pie">
                  <span class="mod-n">${escapar(it.texto)}</span>
                  ${
                    bloqueado
                      ? '<span class="mod-tag mod-tag--fijo">Siempre</span>'
                      : yaEsta
                      ? '<button class="mod-tag mod-tag--quitar" data-quitar="' + it.mod + '">Quitar</button>'
                      : '<button class="mod-tag mod-tag--fijar" data-fijar="' + it.mod + '">Fijar</button>'
                  }
                </div>
              </div>`;
            })
            .join("")}
        </div>`;
    }).join("");

    cuerpoCajon.querySelectorAll(".mod").forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target.closest("[data-fijar],[data-quitar]")) return;
        cerrarCajon();
        alNavegar(m.dataset.mod);
      });
      m.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", m.dataset.mod);
        e.dataTransfer.effectAllowed = "move";
        iniciarArrastre(m.dataset.mod);
        // El cajón se quita de en medio: tomas la tarjeta y la pantalla queda
        // limpia con el sidebar iluminado como único destino. Antes se
        // quedaba encima a media opacidad y no se distinguía nada.
        cerrarCajon();
      });
      m.addEventListener("dragend", () => terminarArrastre());
    });
    cuerpoCajon.querySelectorAll("[data-fijar]").forEach((b) =>
      b.addEventListener("click", () => fijar(b.dataset.fijar))
    );
    cuerpoCajon.querySelectorAll("[data-quitar]").forEach((b) =>
      b.addEventListener("click", () => desfijar(b.dataset.quitar))
    );
  }

  function abrirCajon() {
    pintarCajon();
    velo.hidden = false;
    requestAnimationFrame(() => velo.classList.add("cajon-velo--abierto"));
  }
  function cerrarCajon() {
    velo.classList.remove("cajon-velo--abierto");
    setTimeout(() => (velo.hidden = true), 160);
  }
  raiz.querySelector("#sb-abrir-cajon").addEventListener("click", abrirCajon);
  raiz.querySelector("#cajon-cerrar").addEventListener("click", cerrarCajon);
  velo.addEventListener("click", (e) => {
    if (e.target === velo) cerrarCajon();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !velo.hidden) cerrarCajon();
  });

  raiz.querySelector("#shell-salir").addEventListener("click", alSalir);

  function marcarActivo(mod) {
    modActivo = mod;
    raiz
      .querySelectorAll(".sb-item[data-mod]")
      .forEach((b) => b.classList.toggle("sb-item--activo", b.dataset.mod === mod));
  }

  // --- barra de estado ---
  const reloj = raiz.querySelector("#pie-reloj");
  function pintarReloj() {
    const d = new Date();
    reloj.textContent =
      d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }) +
      " · " +
      d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }
  pintarReloj();
  setInterval(pintarReloj, 20000);

  // El turno muestra el tiempo TRANSCURRIDO, no solo la hora de apertura.
  // "Turno 3h 51m" le dice a quien está en la caja algo que puede usar
  // ahora mismo (cuánto lleva, si ya toca corte); "Turno desde 8:31" le
  // pide hacer la resta mental cada vez. Y como avanza solo, la barra se
  // siente viva en vez de un letrero fijo.
  const turnoEl = raiz.querySelector("#pie-turno");
  if (cajaSesion && cajaSesion.abierta_en) {
    const inicio = new Date(cajaSesion.abierta_en);
    const desde = inicio.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
    const pintarTurno = () => {
      const min = Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 60000));
      const h = Math.floor(min / 60);
      const m = min % 60;
      turnoEl.innerHTML = `Turno <b class="num">${h > 0 ? h + "h " : ""}${m}m</b>`;
      turnoEl.title = `Abierto desde las ${desde} · toca para ir al Corte`;
    };
    pintarTurno();
    setInterval(pintarTurno, 30000);
    turnoEl.addEventListener("click", () => alNavegar("caja"));
  } else {
    turnoEl.hidden = true;
  }

  const syncEl = raiz.querySelector("#pie-sync");
  syncActual = (modo, texto) => {
    syncEl.dataset.modo = modo || "ok";
    syncEl.querySelector("span").textContent =
      texto || (modo === "sin" ? "Sin conexión" : modo === "pendiente" ? "Pendiente" : "Sincronizado");
  };
  syncEl.addEventListener("click", () => alNavegar("configuracion"));

  // --- línea de vida ---
  const lineaVidaInst = {
    operando() {
      clearTimeout(volverTimer);
      lv.className = "linea-vida";
      estadoTxt.querySelector("b").textContent = "Operando";
      estadoTxt.dataset.modo = "ok";
    },
    exito() {
      clearTimeout(volverTimer);
      lv.className = "linea-vida";
      void lv.offsetWidth;
      lv.className = "linea-vida lv--exito";
      estadoTxt.querySelector("b").textContent = "Venta cobrada";
      estadoTxt.dataset.modo = "exito";
      volverTimer = setTimeout(() => lineaVidaInst.operando(), 2200);
    },
    atencion(texto) {
      clearTimeout(volverTimer);
      lv.className = "linea-vida lv--atencion";
      estadoTxt.querySelector("b").textContent = texto || "Atención";
      estadoTxt.dataset.modo = "alerta";
    },
  };
  lvActual = lineaVidaInst;
  lineaVidaInst.operando();

  // --- badge de Pedidos web ---
  function reconectarBadge() {
    const el = raiz.querySelector("#sb-badge-pedidos");
    badgeActual = el
      ? (n) => {
          const num = Number(n) || 0;
          el.hidden = num <= 0;
          el.textContent = num > 99 ? "99+" : String(num);
        }
      : null;
  }

  pintarSidebar();

  return { contenido, marcarActivo, lineaVida: lineaVidaInst };
}

/** Cruz de flechas para la pista de arrastre. Dibujado aquí (y no vía
 *  iconos.js) para no depender de un id que quizá no exista en ese módulo. */
function flechasMover() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>`;
}

/** Nueve puntitos para el botón del cajón. Dibujado aquí por la misma razón. */
function puntitos() {
  const c = [5, 12, 19];
  let p = "";
  for (const y of c) for (const x of c) p += `<circle cx="${x}" cy="${y}" r="1.6"/>`;
  return `<svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true">${p}</svg>`;
}
