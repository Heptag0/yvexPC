// YvexPOS — Dinero: la agenda financiera del dueño.
//
// DOS LIBROS intercambiables, no uno:
//   Negocio  → la renta del local, la luz del local, los sueldos…
//   Personal → la renta de su casa, la luz de su casa, la despensa…
// La misma categoría vive en los dos y está bien: son el mismo tipo de gasto
// en dos bolsillos distintos. Mezclarlos es lo que hace que un negocio
// familiar nunca sepa si de verdad gana.
//
// EL PUENTE: cuando saca dinero del negocio (categoría "retiro"), eso sale
// del libro del negocio y ENTRA al personal, con una sola captura. Por eso
// el libro personal puede decir algo que ninguna app dice:
//   "el negocio te dio $12,400 este mes y llevas $15,800 gastados".

import { invoke } from "@tauri-apps/api/core";
import { pesos, escapar } from "../util/formato.js";
import { icono } from "../util/iconos.js";
import { confirmar } from "../util/confirmar.js";

const CATS = {
  negocio: [
    { id: "renta", n: "Renta del local" },
    { id: "servicios", n: "Luz, agua, gas" },
    { id: "internet", n: "Internet y teléfono" },
    { id: "sueldos", n: "Sueldos" },
    { id: "insumos", n: "Insumos" },
    { id: "transporte", n: "Transporte" },
    { id: "mantenimiento", n: "Mantenimiento" },
    { id: "impuestos", n: "Impuestos" },
    { id: "retiro", n: "Retiro para mí" },
    { id: "otro", n: "Otro" },
  ],
  personal: [
    { id: "casa", n: "Casa y renta" },
    { id: "servicios", n: "Luz, agua, gas" },
    { id: "internet", n: "Internet y teléfono" },
    { id: "despensa", n: "Despensa" },
    { id: "transporte", n: "Transporte" },
    { id: "salud", n: "Salud" },
    { id: "educacion", n: "Escuela" },
    { id: "entretenimiento", n: "Gustos y salidas" },
    { id: "deudas", n: "Deudas y pagos" },
    { id: "ahorro", n: "Ahorro" },
    { id: "otro", n: "Otro" },
  ],
};

const CATS_INGRESO = {
  negocio: [
    { id: "extra", n: "Ingreso extra" },
    { id: "renta", n: "Renta que cobro" },
    { id: "otro", n: "Otro" },
  ],
  personal: [
    { id: "negocio", n: "Del negocio" },
    { id: "sueldo", n: "Sueldo" },
    { id: "freelance", n: "Trabajo por fuera" },
    { id: "renta", n: "Renta que cobro" },
    { id: "apoyo", n: "Apoyo familiar" },
    { id: "otro", n: "Otro" },
  ],
};

function nombreCat(ambito, id) {
  const enGastos = CATS[ambito].find((c) => c.id === id);
  if (enGastos) return enGastos.n;
  const enIngresos = CATS_INGRESO[ambito].find((c) => c.id === id);
  return enIngresos ? enIngresos.n : id;
}

const DIAS_SEM = ["L", "M", "M", "J", "V", "S", "D"];

export function montarDinero(contenedor, sesion, cajaSesion, alSalir) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";

  const wrap = document.createElement("div");
  wrap.className = "din";
  contenedor.appendChild(wrap);

  let ambito = "negocio";
  let r = null;
  let movimientos = [];
  let diaAbierto = null;

  const hoyYmd = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  pintarEsqueleto();
  cargar();

  function pintarEsqueleto() {
    wrap.innerHTML = `
      <header class="inv-head">
        <div class="inv-head-izq">
          <button class="inv-volver" id="din-volver" aria-label="Volver">←</button>
          <h1>Dinero</h1>
        </div>
        <div class="inv-head-der">
          <button class="btn-sec" id="din-presup">Presupuestos</button>
          <button class="btn-sec" id="din-fijos">Gastos fijos</button>
          <button class="btn-primario" id="din-nuevo">+ Movimiento</button>
        </div>
      </header>
      <div class="din-libros">
        <button class="din-libro din-libro--on" data-amb="negocio">
          <span class="din-libro-n">Mi negocio</span>
          <span class="din-libro-s">Local, mercancía, sueldos</span>
        </button>
        <button class="din-libro" data-amb="personal">
          <span class="din-libro-n">Personal</span>
          <span class="din-libro-s">Casa, despensa, tus gastos</span>
        </button>
      </div>
      <div id="din-cuerpo"><div class="ini-cargando">Calculando…</div></div>
    `;
    wrap.querySelector("#din-volver").addEventListener("click", alSalir);
    wrap.querySelector("#din-nuevo").addEventListener("click", () => abrirForm());
    wrap.querySelector("#din-fijos").addEventListener("click", abrirFijos);
    wrap.querySelector("#din-presup").addEventListener("click", abrirPresupuestos);
    wrap.querySelectorAll("[data-amb]").forEach((b) =>
      b.addEventListener("click", () => {
        if (ambito === b.dataset.amb) return;
        ambito = b.dataset.amb;
        diaAbierto = null;
        wrap.querySelectorAll(".din-libro").forEach((x) => x.classList.remove("din-libro--on"));
        b.classList.add("din-libro--on");
        cargar();
      })
    );
  }

  async function cargar() {
    const hoy = hoyYmd();
    const mesInicio = hoy.slice(0, 7) + "-01";
    const ultimo = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0).getDate();
    const mesFin = hoy.slice(0, 7) + "-" + String(ultimo).padStart(2, "0");
    try {
      [r, movimientos] = await Promise.all([
        invoke("fin_resumen", { ambito, hoy }),
        invoke("fin_movimientos", { ambito, desde: mesInicio, hasta: mesFin }),
      ]);
    } catch (e) {
      wrap.querySelector("#din-cuerpo").innerHTML =
        `<div class="ini-vacio">No se pudo calcular: ${escapar(String(e))}</div>`;
      return;
    }
    pintarCuerpo();
  }

  function pintarCuerpo() {
    const cuerpo = wrap.querySelector("#din-cuerpo");
    if (!r.hay_datos) return pintarArranque(cuerpo);

    const esNegocio = ambito === "negocio";
    cuerpo.innerHTML = `
      ${r.avisos.length > 0 ? `
        <div class="din-avisos">
          ${r.avisos.slice(0, 3).map((a) => `
            <div class="din-aviso din-aviso--${a.tono}">
              <span class="din-aviso-titulo">${escapar(a.titulo)}</span>
              <span class="din-aviso-detalle">${escapar(a.detalle)}</span>
            </div>`).join("")}
        </div>` : ""}

      ${esNegocio ? heroNegocio() : heroPersonal()}

      <div class="din-grid">
        <div>
          ${calendario()}
          ${r.proximos_fijos.length > 0 ? `
            <section class="ini-panel con-filo din-panel">
              <div class="ini-panel-titulo">Por pagar</div>
              ${r.proximos_fijos.map((f) => `
                <button class="din-prox" data-pagar="${f.id}">
                  <span class="din-prox-dia ${f.dias_faltan < 0 ? "din-prox-dia--vencido" : ""}">
                    ${f.dias_faltan < 0 ? "Venció" : f.dias_faltan === 0 ? "Hoy" : `En ${f.dias_faltan}d`}
                  </span>
                  <span class="din-prox-concepto">${escapar(f.concepto)}</span>
                  <span class="din-prox-monto num">${pesos(f.monto_centavos)}</span>
                </button>`).join("")}
            </section>` : ""}
        </div>

        <div>
          ${r.presupuestos.length > 0 ? `
            <section class="ini-panel con-filo din-panel">
              <div class="ini-panel-titulo">Tus límites del mes</div>
              ${r.presupuestos.map((p) => `
                <div class="din-presu din-presu--${p.estado}">
                  <div class="din-presu-fila">
                    <span>${escapar(nombreCat(ambito, p.categoria))}</span>
                    <span class="num">${pesos(p.gastado_centavos)} <span class="din-presu-lim">de ${pesos(p.limite_centavos)}</span></span>
                  </div>
                  <div class="din-presu-barra"><div class="din-presu-relleno" style="width:${Math.min(100, p.pct)}%"></div></div>
                </div>`).join("")}
            </section>` : ""}

          ${r.por_categoria.length > 0 ? `
            <section class="ini-panel con-filo din-panel">
              <div class="ini-panel-titulo">En qué se fue</div>
              ${r.por_categoria.map((c) => `
                <div class="din-cat">
                  <div class="din-cat-fila">
                    <span>${escapar(nombreCat(ambito, c.categoria))}</span>
                    <span class="num">${pesos(c.total_centavos)} <span class="din-cat-pct">${c.pct}%</span></span>
                  </div>
                  <div class="din-cat-barra"><div class="din-cat-relleno" style="width:${c.pct}%"></div></div>
                </div>`).join("")}
            </section>` : ""}

          <section class="ini-panel con-filo din-panel">
            <div class="ini-panel-titulo">${diaAbierto ? `Movimientos del ${diaAbierto}` : "Últimos movimientos"}</div>
            ${listaMovimientos()}
          </section>
        </div>
      </div>
    `;
    conectarCuerpo();
  }

  function heroNegocio() {
    const gano = r.ganancia_hoy_centavos >= 0;
    const cubierto = r.falta_hoy_centavos <= 0;
    const objetivo = r.ventas_hoy_centavos + r.falta_hoy_centavos;
    const pct = objetivo > 0 ? Math.min(100, Math.round((r.ventas_hoy_centavos / objetivo) * 100)) : 100;
    return `
      <section class="din-hero ${gano ? "din-hero--bien" : "din-hero--mal"}">
        <span class="din-hero-lbl">Ganancia real de hoy</span>
        <span class="din-hero-num num">${gano ? "" : "−"}${pesos(Math.abs(r.ganancia_hoy_centavos))}</span>
        <div class="din-hero-desglose">
          <span>Vendiste <b class="num">${pesos(r.ventas_hoy_centavos)}</b></span>
          <span>− mercancía <b class="num">${pesos(r.costo_vendido_hoy_centavos)}</b></span>
          <span>− gastos <b class="num">${pesos(r.gastos_hoy_centavos)}</b></span>
        </div>
      </section>
      <section class="din-equilibrio ${cubierto ? "din-equilibrio--ok" : ""}">
        <div class="din-eq-txt">
          ${cubierto
            ? `<span class="din-eq-titulo">Ya cubriste el día ✓</span>
               <span class="din-eq-sub">De aquí en adelante, lo que vendas es ganancia.</span>`
            : `<span class="din-eq-titulo">Te faltan <b class="num">${pesos(r.falta_hoy_centavos)}</b> de venta para cubrir el día</span>
               <span class="din-eq-sub">Tener abierto cuesta ${pesos(r.costo_diario_centavos)} diarios. Con tu margen de ${r.margen_pct.toFixed(0)}%, esa es la venta que lo cubre.</span>`}
        </div>
        <div class="din-eq-barra"><div class="din-eq-relleno" style="width:${pct}%"></div></div>
      </section>
      <div class="din-mini-fila">
        ${mini("Ventas del mes", pesos(r.ventas_mes_centavos))}
        ${mini("Gastos del mes", pesos(r.gastos_mes_centavos))}
        ${mini("Ganancia del mes", (r.ganancia_mes_centavos < 0 ? "−" : "") + pesos(Math.abs(r.ganancia_mes_centavos)), r.ganancia_mes_centavos >= 0 ? "bien" : "mal")}
        ${r.retiros_mes_centavos > 0 ? mini("Sacaste para ti", pesos(r.retiros_mes_centavos)) : ""}
      </div>`;
  }

  function heroPersonal() {
    const bien = r.balance_mes_centavos >= 0;
    return `
      <section class="din-hero ${bien ? "din-hero--bien" : "din-hero--mal"}">
        <span class="din-hero-lbl">${bien ? "Te sobra este mes" : "Te falta este mes"}</span>
        <span class="din-hero-num num">${bien ? "" : "−"}${pesos(Math.abs(r.balance_mes_centavos))}</span>
        <div class="din-hero-desglose">
          <span>Entró <b class="num">${pesos(r.ingresos_mes_centavos)}</b></span>
          <span>Gastaste <b class="num">${pesos(r.gastos_mes_centavos)}</b></span>
          <span>Hoy llevas <b class="num">${pesos(r.gastos_hoy_centavos)}</b></span>
        </div>
      </section>
      ${r.retiros_mes_centavos > 0 ? `
        <section class="din-puente">
          <span class="din-puente-titulo">Tu negocio te dio <b class="num">${pesos(r.retiros_mes_centavos)}</b> este mes</span>
          <span class="din-puente-sub">${
            r.gastos_mes_centavos > r.retiros_mes_centavos
              ? `Llevas ${pesos(r.gastos_mes_centavos)} de gastos personales: ${pesos(r.gastos_mes_centavos - r.retiros_mes_centavos)} más de lo que sacaste.`
              : `Llevas ${pesos(r.gastos_mes_centavos)} de gastos personales. Vas dentro de lo que te dio.`
          }</span>
        </section>` : ""}
      <div class="din-mini-fila">
        ${mini("Ingresos del mes", pesos(r.ingresos_mes_centavos))}
        ${mini("Gastos del mes", pesos(r.gastos_mes_centavos))}
        ${mini("A este ritmo, el mes", pesos(r.proyeccion_mes_centavos))}
      </div>`;
  }

  function mini(lbl, val, tono) {
    return `<div class="din-mini ${tono ? "din-mini--" + tono : ""}">
      <span class="din-mini-lbl">${lbl}</span>
      <span class="din-mini-val num">${val}</span>
    </div>`;
  }

  /// Calendario del mes: cada día con su intensidad de gasto. Tocar un día
  /// filtra la lista de movimientos de abajo.
  function calendario() {
    const cal = r.calendario;
    if (cal.length === 0) return "";
    const maxG = Math.max(1, ...cal.map((d) => d.gastos_centavos));
    // Alinear el día 1 con su día de la semana (lunes = 0).
    const primera = new Date(cal[0].fecha + "T12:00:00");
    const offset = (primera.getDay() + 6) % 7;
    const hoyD = Number(hoyYmd().slice(8, 10));
    return `
      <section class="ini-panel con-filo din-panel">
        <div class="ini-panel-titulo">Tu mes día por día</div>
        <div class="din-cal">
          ${DIAS_SEM.map((d) => `<span class="din-cal-dow">${d}</span>`).join("")}
          ${Array(offset).fill('<span class="din-cal-vacio"></span>').join("")}
          ${cal.map((d) => {
            const int = d.gastos_centavos > 0 ? Math.max(0.14, d.gastos_centavos / maxG) : 0;
            const esHoy = d.dia === hoyD;
            const sel = diaAbierto === d.fecha;
            return `<button class="din-cal-dia ${esHoy ? "din-cal-dia--hoy" : ""} ${sel ? "din-cal-dia--sel" : ""}"
                      data-dia="${d.fecha}" title="${d.fecha}: ${pesos(d.gastos_centavos)} de gasto">
              <span class="din-cal-num">${d.dia}</span>
              ${int > 0 ? `<span class="din-cal-punto" style="opacity:${int}"></span>` : ""}
              ${d.fijos_pendientes > 0 ? '<span class="din-cal-fijo"></span>' : ""}
            </button>`;
          }).join("")}
        </div>
      </section>`;
  }

  function listaMovimientos() {
    const lista = diaAbierto ? movimientos.filter((m) => m.fecha === diaAbierto) : movimientos.slice(0, 14);
    if (lista.length === 0) {
      return `<div class="ini-vacio">${diaAbierto ? "Nada ese día." : "Aún no hay movimientos este mes."}</div>`;
    }
    return `<div class="din-lista">${lista.map((m) => `
      <div class="din-mov">
        <span class="din-mov-signo din-mov-signo--${m.clase}">${m.clase === "ingreso" ? "+" : "−"}</span>
        <div class="din-mov-info">
          <span class="din-mov-concepto">${escapar(m.concepto)}</span>
          <span class="din-mov-meta">${escapar(m.fecha)} · ${escapar(nombreCat(ambito, m.categoria))}</span>
        </div>
        <span class="num din-mov-monto din-mov-monto--${m.clase}">${pesos(m.monto_centavos)}</span>
        <button class="btn-mini" data-borrar="${m.clase}:${m.id}" title="Eliminar">×</button>
      </div>`).join("")}</div>`;
  }

  function conectarCuerpo() {
    const cuerpo = wrap.querySelector("#din-cuerpo");
    cuerpo.querySelectorAll("[data-dia]").forEach((b) =>
      b.addEventListener("click", () => {
        diaAbierto = diaAbierto === b.dataset.dia ? null : b.dataset.dia;
        pintarCuerpo();
      })
    );
    cuerpo.querySelectorAll("[data-pagar]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = r.proximos_fijos.find((x) => x.id === b.dataset.pagar);
        if (f) abrirForm({ clase: "gasto", concepto: f.concepto, categoria: f.categoria, monto: f.monto_centavos, fijoId: f.id });
      })
    );
    cuerpo.querySelectorAll("[data-borrar]").forEach((b) =>
      b.addEventListener("click", async () => {
        const [clase, id] = b.dataset.borrar.split(":");
        const ok = await confirmar("Este movimiento dejará de contar en tus números.", {
          titulo: "Eliminar", ok: "Eliminar", cancelar: "Cancelar",
        });
        if (!ok) return;
        try {
          await invoke(clase === "ingreso" ? "fin_ingreso_eliminar" : "fin_gasto_eliminar", { id });
          cargar();
        } catch (e) { alert(String(e)); }
      })
    );
  }

  function pintarArranque(cuerpo) {
    const esNegocio = ambito === "negocio";
    cuerpo.innerHTML = `
      <div class="din-arranque">
        <div class="din-arranque-ico">${icono("dinero")}</div>
        <h2>${esNegocio ? "¿Tu negocio de verdad gana dinero?" : "¿A dónde se va tu dinero?"}</h2>
        <p>${esNegocio
          ? "El POS ya sabe cuánto vendes y cuánto te cuesta la mercancía. Falta lo demás: la renta, la luz, los sueldos… y lo que sacas para tus cosas."
          : "Aquí llevas tus gastos de casa aparte de los del negocio: la luz de tu casa, la despensa, la escuela. Con lo que sacas del negocio y lo que entra por fuera, sabes si te alcanza."}</p>
        <p>Empieza por tus <b>gastos fijos</b> — los que pagas cada mes sin falta. Con eso solo, esta pantalla ya te dice ${esNegocio ? "cuánto necesitas vender al día para no perder" : "cuánto necesitas al mes para vivir"}.</p>
        <div class="din-arranque-btns">
          <button class="btn-primario" id="din-a-fijos">Poner mis gastos fijos</button>
          <button class="btn-sec" id="din-a-mov">Registrar un movimiento</button>
        </div>
      </div>`;
    cuerpo.querySelector("#din-a-fijos").addEventListener("click", abrirFijos);
    cuerpo.querySelector("#din-a-mov").addEventListener("click", () => abrirForm());
  }

  // --------------------------------------------------------- Modal genérico
  let modalActivo = null;
  function abrirModal(html, opciones) {
    if (modalActivo) cerrarModal();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay" + (opciones && opciones.alto ? " modal-overlay--alto" : "");
    overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    modalActivo = overlay;
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) cerrarModal(); });
    return overlay.querySelector(".modal");
  }
  function cerrarModal() {
    if (modalActivo) { modalActivo.remove(); modalActivo = null; }
  }

  // ------------------------------------------------- Registrar movimiento
  function abrirForm(pre) {
    const hoy = hoyYmd();
    const hayTurno = !!(cajaSesion && cajaSesion.id);
    let clase = pre ? pre.clase : "gasto";
    let categoria = pre ? pre.categoria : "otro";

    const modal = abrirModal(`
      <h2>${pre ? escapar(pre.concepto) : "Nuevo movimiento"}</h2>
      <div class="din-clase-sel" id="f-clase">
        <button type="button" class="din-clase din-clase--on" data-clase="gasto">Gasto</button>
        <button type="button" class="din-clase" data-clase="ingreso">Ingreso</button>
      </div>
      <label>¿Cuánto?
        <input id="f-monto" class="din-monto-input num" inputmode="decimal" placeholder="0.00"
               value="${pre ? (pre.monto / 100).toFixed(2) : ""}" />
      </label>
      <label>¿Qué fue?
        <input id="f-concepto" placeholder="Ej. Recibo de luz, despensa, gasolina"
               value="${pre ? escapar(pre.concepto) : ""}" />
      </label>
      <div class="din-cat-label">Categoría</div>
      <div class="din-cat-chips" id="f-cats"></div>
      <div class="m-grid" style="margin-top:14px">
        <label>Fecha<input id="f-fecha" type="date" value="${hoy}" /></label>
        <label id="f-metodo-lbl">¿Cómo se pagó?
          <select id="f-metodo">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </label>
      </div>
      <p class="m-hint" id="f-hint"></p>
      <p class="m-error" id="f-error"></p>
      <div class="m-acciones"><span></span><div>
        <button class="btn-sec" id="f-cancelar">Cancelar</button>
        <button class="btn-primario" id="f-guardar">Guardar</button>
      </div></div>
    `);
    const $ = (s) => modal.querySelector(s);
    setTimeout(() => $("#f-monto").focus(), 50);

    function pintarCats() {
      const lista = clase === "gasto" ? CATS[ambito] : CATS_INGRESO[ambito];
      if (!lista.some((c) => c.id === categoria)) categoria = lista[lista.length - 1].id;
      $("#f-cats").innerHTML = lista.map((c) =>
        `<button type="button" class="din-cat-chip ${c.id === categoria ? "din-cat-chip--on" : ""}" data-cat="${c.id}">${c.n}</button>`
      ).join("");
      $("#f-cats").querySelectorAll(".din-cat-chip").forEach((b) =>
        b.addEventListener("click", () => {
          categoria = b.dataset.cat;
          $("#f-cats").querySelectorAll(".din-cat-chip").forEach((x) => x.classList.remove("din-cat-chip--on"));
          b.classList.add("din-cat-chip--on");
          const c = $("#f-concepto");
          if (!c.value.trim()) c.value = nombreCat(ambito, categoria);
          actualizarHint();
        })
      );
    }

    function actualizarHint() {
      const hint = $("#f-hint");
      const esEfectivoNegocio = clase === "gasto" && ambito === "negocio" && $("#f-metodo").value === "efectivo";
      $("#f-metodo-lbl").style.display = clase === "gasto" ? "" : "none";
      if (clase === "gasto" && ambito === "negocio" && categoria === "retiro") {
        hint.textContent = "Este dinero sale del negocio y entra a tu libro personal — se registra en los dos con una sola captura.";
        hint.style.display = "";
      } else if (esEfectivoNegocio && hayTurno) {
        hint.textContent = "Al pagarlo en efectivo también se registra la salida del cajón. No lo captures dos veces.";
        hint.style.display = "";
      } else {
        hint.style.display = "none";
      }
    }

    $("#f-clase").querySelectorAll(".din-clase").forEach((b) =>
      b.addEventListener("click", () => {
        clase = b.dataset.clase;
        $("#f-clase").querySelectorAll(".din-clase").forEach((x) => x.classList.remove("din-clase--on"));
        b.classList.add("din-clase--on");
        pintarCats();
        actualizarHint();
      })
    );
    $("#f-metodo").addEventListener("change", actualizarHint);
    pintarCats();
    actualizarHint();

    $("#f-cancelar").addEventListener("click", cerrarModal);
    $("#f-guardar").addEventListener("click", async () => {
      const err = $("#f-error");
      err.textContent = "";
      const v = parseFloat(($("#f-monto").value || "0").replace(",", "."));
      if (isNaN(v) || v <= 0) return (err.textContent = "Escribe cuánto fue.");
      const concepto = $("#f-concepto").value.trim() || nombreCat(ambito, categoria);
      const monto = Math.round(v * 100);
      const fecha = $("#f-fecha").value || hoy;
      try {
        if (clase === "ingreso") {
          await invoke("fin_ingreso_registrar", {
            datos: { ambito, concepto, categoria, monto_centavos: monto, fecha, notas: null },
          });
        } else {
          const metodo = $("#f-metodo").value;
          const usaCaja = metodo === "efectivo" && ambito === "negocio" && hayTurno;
          await invoke("fin_gasto_registrar", {
            datos: {
              ambito, concepto, categoria, monto_centavos: monto, fecha,
              metodo_pago: metodo,
              gasto_fijo_id: pre ? pre.fijoId : null,
              notas: null,
              caja_sesion_id: usaCaja ? cajaSesion.id : null,
              usuario_pos_id: usaCaja ? sesion.id : null,
            },
          });
        }
        cerrarModal();
        cargar();
      } catch (e) {
        err.textContent = String(e);
      }
    });
  }

  // -------------------------------------------------------- Gastos fijos
  async function abrirFijos() {
    let fijos = [];
    try {
      fijos = await invoke("fin_fijos_listar", { ambito, hoy: hoyYmd() });
    } catch (e) { return alert(String(e)); }
    const total = fijos.reduce((s, f) => s + f.monto_centavos, 0);
    const lista = CATS[ambito].filter((c) => c.id !== "retiro");
    const modal = abrirModal(`
      <h2>Gastos fijos · ${ambito === "negocio" ? "negocio" : "personal"}</h2>
      <p class="m-sub">Lo que pagas cada mes sin falta. Regístralos una vez y esta pantalla te avisa antes de que venzan.</p>
      ${total > 0 ? `<div class="din-fijos-total">
        ${ambito === "negocio" ? "Tu negocio cuesta" : "Tu vida cuesta"}
        <b class="num">${pesos(total)}</b> al mes · <b class="num">${pesos(Math.round(total / 30))}</b> al día
      </div>` : ""}
      <div class="din-fijos-lista">
        ${fijos.length === 0
          ? '<div class="ini-vacio">Aún no tienes gastos fijos aquí.</div>'
          : fijos.map((f) => `
            <div class="din-fijo ${f.pagado_este_mes ? "din-fijo--pagado" : ""}">
              <span class="din-fijo-dia">${f.dia_mes}</span>
              <div class="din-fijo-info">
                <span class="din-fijo-concepto">${escapar(f.concepto)}</span>
                <span class="din-fijo-meta">${escapar(nombreCat(ambito, f.categoria))}${f.pagado_este_mes ? " · pagado ✓" : ""}</span>
              </div>
              <span class="num din-fijo-monto">${pesos(f.monto_centavos)}</span>
              <button class="btn-mini" data-borrar-fijo="${f.id}">×</button>
            </div>`).join("")}
      </div>
      <div class="din-fijo-alta">
        <input id="gf-concepto" placeholder="Ej. ${ambito === "negocio" ? "Renta del local" : "Renta de la casa"}" />
        <input id="gf-monto" class="num" inputmode="decimal" placeholder="0.00" />
        <input id="gf-dia" class="num" inputmode="numeric" placeholder="Día" />
        <button class="btn-sec" id="gf-add">Agregar</button>
      </div>
      <div class="din-cat-chips" id="gf-cats">
        ${lista.map((c, i) => `<button type="button" class="din-cat-chip ${i === 0 ? "din-cat-chip--on" : ""}" data-cat="${c.id}">${c.n}</button>`).join("")}
      </div>
      <p class="m-error" id="gf-error"></p>
      <div class="m-acciones"><span></span><button class="btn-primario" id="gf-listo">Listo</button></div>
    `, { alto: true });
    const $ = (s) => modal.querySelector(s);
    let cat = lista[0].id;
    modal.querySelectorAll("#gf-cats .din-cat-chip").forEach((b) =>
      b.addEventListener("click", () => {
        cat = b.dataset.cat;
        modal.querySelectorAll("#gf-cats .din-cat-chip").forEach((x) => x.classList.remove("din-cat-chip--on"));
        b.classList.add("din-cat-chip--on");
      })
    );
    $("#gf-listo").addEventListener("click", () => { cerrarModal(); cargar(); });
    $("#gf-add").addEventListener("click", async () => {
      const err = $("#gf-error");
      err.textContent = "";
      const concepto = $("#gf-concepto").value.trim();
      const v = parseFloat(($("#gf-monto").value || "0").replace(",", "."));
      const dia = parseInt($("#gf-dia").value || "0", 10);
      if (!concepto) return (err.textContent = "Ponle nombre.");
      if (isNaN(v) || v <= 0) return (err.textContent = "Escribe cuánto es.");
      if (isNaN(dia) || dia < 1 || dia > 31) return (err.textContent = "El día debe ser entre 1 y 31.");
      try {
        await invoke("fin_fijo_crear", {
          datos: { ambito, concepto, categoria: cat, monto_centavos: Math.round(v * 100), dia_mes: dia, notas: null },
        });
        cerrarModal();
        abrirFijos();
      } catch (e) { err.textContent = String(e); }
    });
    modal.querySelectorAll("[data-borrar-fijo]").forEach((b) =>
      b.addEventListener("click", async () => {
        const ok = await confirmar("Dejará de avisarte y de contar en tus cálculos.", {
          titulo: "Quitar gasto fijo", ok: "Quitar", cancelar: "Cancelar",
        });
        if (!ok) return;
        await invoke("fin_fijo_eliminar", { id: b.dataset.borrarFijo });
        cerrarModal();
        abrirFijos();
      })
    );
  }

  // -------------------------------------------------------- Presupuestos
  function abrirPresupuestos() {
    const actuales = Object.fromEntries((r?.presupuestos || []).map((p) => [p.categoria, p.limite_centavos]));
    const lista = CATS[ambito].filter((c) => c.id !== "retiro");
    const modal = abrirModal(`
      <h2>Límites del mes · ${ambito === "negocio" ? "negocio" : "personal"}</h2>
      <p class="m-sub">Ponle un tope a lo que quieres gastar por categoría. Cuando te acerques, te aviso — sin límite tuyo, cualquier aviso sería una opinión mía, no un dato.</p>
      <div class="din-presu-edit">
        ${lista.map((c) => `
          <label class="din-presu-campo">
            <span>${c.n}</span>
            <input data-presu="${c.id}" class="num" inputmode="decimal" placeholder="Sin límite"
                   value="${actuales[c.id] ? (actuales[c.id] / 100).toFixed(2) : ""}" />
          </label>`).join("")}
      </div>
      <p class="m-error" id="pr-error"></p>
      <div class="m-acciones"><span></span><div>
        <button class="btn-sec" id="pr-cancelar">Cancelar</button>
        <button class="btn-primario" id="pr-guardar">Guardar</button>
      </div></div>
    `, { alto: true });
    const $ = (s) => modal.querySelector(s);
    $("#pr-cancelar").addEventListener("click", cerrarModal);
    $("#pr-guardar").addEventListener("click", async () => {
      try {
        for (const inp of modal.querySelectorAll("[data-presu]")) {
          const v = parseFloat((inp.value || "0").replace(",", "."));
          await invoke("fin_presupuesto_guardar", {
            datos: { ambito, categoria: inp.dataset.presu, monto_centavos: isNaN(v) ? 0 : Math.round(v * 100) },
          });
        }
        cerrarModal();
        cargar();
      } catch (e) {
        $("#pr-error").textContent = String(e);
      }
    });
  }
}
