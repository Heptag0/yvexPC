// YvexPOS — Cotizaciones: carrito armado sin cobrar, con validez y
// conversión directa a venta. Útil sobre todo en giros donde "cuánto me
// costaría" es el primer paso natural (construcción, materiales, servicios).
//
// Local-only por ahora (mismo punto de partida que tuvieron proveedores y
// lealtad antes de sincronizarse).

import { invoke } from "@tauri-apps/api/core";
import { pesos, escapar } from "../util/formato.js";
import { icono } from "../util/iconos.js";
import { confirmar } from "../util/confirmar.js";
import { dejarCotizacionParaVenta } from "../util/handoff.js";

const ETIQUETA_ESTADO = {
  abierta: "Abierta",
  convertida: "Convertida",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

export function montarCotizaciones(contenedor, sesion, alSalir, navegar) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";

  const wrap = document.createElement("div");
  wrap.className = "cot";
  contenedor.appendChild(wrap);

  let cotizaciones = [];
  let filtro = "";

  pintarEsqueleto();
  cargar();

  function hoyYmd() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function pintarEsqueleto() {
    wrap.innerHTML = `
      <header class="inv-head">
        <div class="inv-head-izq">
          <button class="inv-volver" id="cot-volver" aria-label="Volver">←</button>
          <h1>Cotizaciones</h1>
        </div>
        <div class="inv-head-der">
          <button class="btn-primario" id="cot-nueva">+ Cotización</button>
        </div>
      </header>
      <div class="inv-barra">
        <input id="cot-buscar" class="inv-buscar" placeholder="Buscar por folio o cliente…" autocomplete="off" />
      </div>
      <div class="inv-tabla-wrap">
        <table class="inv-tabla">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th class="num">Total</th>
              <th>Válida hasta</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="cot-tbody"></tbody>
        </table>
        <div id="cot-vacio" class="inv-vacio" hidden></div>
      </div>
    `;
    wrap.querySelector("#cot-volver").addEventListener("click", alSalir);
    wrap.querySelector("#cot-nueva").addEventListener("click", () => abrirConstructor());
    const buscar = wrap.querySelector("#cot-buscar");
    let t;
    buscar.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => { filtro = buscar.value.trim(); cargar(); }, 180);
    });
  }

  async function cargar() {
    const tbody = wrap.querySelector("#cot-tbody");
    const vacio = wrap.querySelector("#cot-vacio");
    try {
      cotizaciones = await invoke("cot_listar", { filtro: filtro || null, hoy: hoyYmd() });
    } catch (e) {
      tbody.innerHTML = "";
      vacio.hidden = false;
      vacio.textContent = "Error al cargar cotizaciones: " + e;
      return;
    }
    if (cotizaciones.length === 0) {
      tbody.innerHTML = "";
      vacio.hidden = false;
      vacio.textContent = filtro
        ? "Sin resultados para “" + filtro + "”."
        : "Aún no tienes cotizaciones. Empieza con “+ Cotización”.";
      return;
    }
    vacio.hidden = true;
    tbody.innerHTML = cotizaciones.map(fila).join("");
    tbody.querySelectorAll("[data-ver]").forEach((b) =>
      b.addEventListener("click", () => abrirVista(b.dataset.ver))
    );
  }

  function fila(c) {
    return `
      <tr>
        <td class="inv-nombre-cel">#${c.folio}</td>
        <td>${c.cliente_nombre ? escapar(c.cliente_nombre) : "—"}</td>
        <td class="num">${pesos(c.total_centavos)}</td>
        <td>${c.valida_hasta ? escapar(c.valida_hasta) : "—"}</td>
        <td><span class="cot-estado cot-estado--${c.estado}">${ETIQUETA_ESTADO[c.estado] || c.estado}</span></td>
        <td class="inv-acciones-col">
          <button class="btn-mini" data-ver="${c.id}">Ver</button>
        </td>
      </tr>`;
  }

  // --------------------------------------------------------- Modal genérico
  let modalActivo = null;
  function abrirModal(html, opciones) {
    if (modalActivo) cerrarModal();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay" + (opciones && opciones.alto ? " modal-overlay--alto" : "");
    overlay.innerHTML = `<div class="modal${opciones && opciones.ancho ? " modal--ancho" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    modalActivo = overlay;
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) cerrarModal(); });
    return overlay.querySelector(".modal");
  }
  function cerrarModal() {
    if (modalActivo) { modalActivo.remove(); modalActivo = null; }
  }

  // ------------------------------------------------------- Ver / imprimir
  async function abrirVista(id) {
    let c;
    try {
      c = await invoke("cot_obtener", { id });
    } catch (e) {
      return alert(String(e));
    }
    if (!c) return;
    const modal = abrirModal(`
      <h2>Cotización #${c.folio}</h2>
      <p class="m-sub">${ETIQUETA_ESTADO[c.estado] || c.estado}${c.valida_hasta ? " · válida hasta " + escapar(c.valida_hasta) : ""}</p>
      <div class="cot-vista-lineas">
        ${c.lineas.map((l) => `
          <div class="cot-vista-linea">
            <span>${l.cantidad % 1 === 0 ? l.cantidad : l.cantidad.toFixed(3)} × ${escapar(l.descripcion)}</span>
            <span class="num">${pesos(l.total_linea_centavos)}</span>
          </div>`).join("")}
      </div>
      <div class="cot-vista-totales">
        <div><span>Subtotal</span><span class="num">${pesos(c.subtotal_centavos)}</span></div>
        ${c.descuento_centavos > 0 ? `<div><span>Descuento</span><span class="num">−${pesos(c.descuento_centavos)}</span></div>` : ""}
        <div class="cot-vista-total"><span>Total</span><span class="num">${pesos(c.total_centavos)}</span></div>
      </div>
      <div class="m-acciones">
        <div>
          ${c.estado === "abierta" ? `<button class="btn-mini btn-mini--peligro" id="cot-v-cancelar">Cancelar</button>` : ""}
          <button class="btn-mini" id="cot-v-eliminar">Eliminar</button>
        </div>
        <div>
          <button class="btn-sec" id="cot-v-imprimir">Imprimir / PDF</button>
          ${c.estado === "abierta" ? `<button class="btn-primario" id="cot-v-convertir">Convertir a venta</button>` : ""}
        </div>
      </div>
    `, { ancho: true });
    const $ = (s) => modal.querySelector(s);

    $("#cot-v-imprimir").addEventListener("click", () => imprimirCotizacion(c));
    $("#cot-v-eliminar").addEventListener("click", async () => {
      const ok = await confirmar("Esta cotización dejará de aparecer en tu lista.", {
        titulo: "Eliminar cotización", ok: "Eliminar", cancelar: "Cancelar",
      });
      if (!ok) return;
      try {
        await invoke("cot_eliminar", { id: c.id });
        cerrarModal();
        cargar();
      } catch (e) { alert(String(e)); }
    });
    const btnCancelar = $("#cot-v-cancelar");
    if (btnCancelar) btnCancelar.addEventListener("click", async () => {
      const ok = await confirmar("El cliente ya no podrá convertir esta cotización en venta.", {
        titulo: "Cancelar cotización", ok: "Cancelar cotización", cancelar: "Volver",
      });
      if (!ok) return;
      try {
        await invoke("cot_cancelar", { id: c.id });
        cerrarModal();
        cargar();
      } catch (e) { alert(String(e)); }
    });
    const btnConvertir = $("#cot-v-convertir");
    if (btnConvertir) btnConvertir.addEventListener("click", async () => {
      try {
        const lista = await invoke("cot_preparar_para_venta", { id: c.id });
        dejarCotizacionParaVenta(lista);
        cerrarModal();
        navegar("venta");
      } catch (e) {
        alert(String(e));
      }
    });
  }

  // ------------------------------------------------------------ Imprimir
  // Mismo mecanismo que el ticket de venta: arma HTML y usa el diálogo de
  // impresión nativo (el usuario elige impresora o "Microsoft Print to PDF").
  // A diferencia del ticket (ancho de recibo térmico), esto es tamaño carta:
  // una cotización se le entrega al cliente, se ve como documento formal.
  async function imprimirCotizacion(c) {
    let negocio = {};
    try { negocio = await invoke("config_leer_todo"); } catch (e) { /* sigue sin datos del negocio */ }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 32px; }
      .enc { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
      .enc h1 { font-size: 20px; margin: 0 0 4px; }
      .enc .neg { font-size: 13px; color: #555; }
      .cot-num { text-align: right; }
      .cot-num .f { font-size: 22px; font-weight: 700; }
      .cot-num .v { font-size: 12px; color: #777; }
      .datos-cliente { margin-bottom: 20px; font-size: 13px; }
      .datos-cliente b { display: block; margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e2e2e2; font-size: 13px; }
      th { color: #777; font-weight: 600; font-size: 11px; text-transform: uppercase; }
      td.num, th.num { text-align: right; }
      .totales { width: 260px; margin-left: auto; font-size: 13px; }
      .totales div { display: flex; justify-content: space-between; padding: 4px 0; }
      .totales .total { font-weight: 700; font-size: 16px; border-top: 2px solid #1a1a1a; margin-top: 6px; padding-top: 8px; }
      .notas { margin-top: 24px; font-size: 12px; color: #555; white-space: pre-wrap; }
      .pie { margin-top: 40px; font-size: 11px; color: #999; text-align: center; }
    </style></head><body>
      <div class="enc">
        <div>
          <h1>${escapar(negocio.negocio_nombre || "")}</h1>
          <div class="neg">${[negocio.negocio_direccion, negocio.negocio_telefono].filter(Boolean).map(escapar).join(" · ")}</div>
        </div>
        <div class="cot-num">
          <div class="f">Cotización #${c.folio}</div>
          <div class="v">${c.valida_hasta ? "Válida hasta " + escapar(c.valida_hasta) : ""}</div>
        </div>
      </div>
      ${c.cliente_nombre ? `<div class="datos-cliente"><b>${escapar(c.cliente_nombre)}</b>${[c.cliente_telefono, c.cliente_correo].filter(Boolean).map(escapar).join(" · ")}</div>` : ""}
      <table>
        <thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
        <tbody>
          ${c.lineas.map((l) => `
            <tr>
              <td>${escapar(l.descripcion)}</td>
              <td class="num">${l.cantidad % 1 === 0 ? l.cantidad : l.cantidad.toFixed(3)}</td>
              <td class="num">${pesos(l.precio_unitario_centavos)}</td>
              <td class="num">${pesos(l.total_linea_centavos)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <div class="totales">
        <div><span>Subtotal</span><span>${pesos(c.subtotal_centavos)}</span></div>
        ${c.descuento_centavos > 0 ? `<div><span>Descuento</span><span>−${pesos(c.descuento_centavos)}</span></div>` : ""}
        <div class="total"><span>Total</span><span>${pesos(c.total_centavos)}</span></div>
      </div>
      ${c.notas ? `<div class="notas">${escapar(c.notas)}</div>` : ""}
      <div class="pie">Hecho con YvexPOS</div>
    </body></html>`;

    const viejo = document.getElementById("cot-print-frame");
    if (viejo) viejo.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "cot-print-frame";
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* no-op */ }
      setTimeout(() => iframe.remove(), 1000);
    }, 300);
  }

  // -------------------------------------------------------- Constructor
  function abrirConstructor() {
    const lineas = []; // {producto_id, descripcion, cantidad, precio_unitario_centavos, descuento_linea_centavos}
    const modal = abrirModal(`
      <h2>Nueva cotización</h2>
      <div class="m-grid">
        <label>Cliente
          <input id="cm-cliente" placeholder="Nombre (opcional)" />
        </label>
        <label>Teléfono
          <input id="cm-tel" placeholder="Opcional" />
        </label>
        <label>Correo
          <input id="cm-correo" placeholder="Opcional" />
        </label>
        <label>Válida hasta
          <input id="cm-valida" type="date" />
        </label>
      </div>

      <div class="cot-lineas-head">
        <span>Conceptos</span>
        <div>
          <button type="button" class="btn-mini" id="cm-agregar-producto">+ Del catálogo</button>
          <button type="button" class="btn-mini" id="cm-agregar-libre">+ Concepto libre</button>
        </div>
      </div>
      <div id="cm-lineas" class="cot-lineas-lista"></div>

      <div class="m-grid" style="margin-top:14px">
        <label>Descuento total
          <input id="cm-descuento" inputmode="decimal" placeholder="0.00" />
        </label>
        <label class="m-col2">Notas
          <input id="cm-notas" placeholder="Opcional — condiciones, tiempos de entrega, etc." />
        </label>
      </div>
      <div class="cot-cm-total">Total: <span id="cm-total-txt" class="num">$0.00</span></div>
      <p class="m-error" id="cm-error"></p>
      <div class="m-acciones">
        <span></span>
        <div>
          <button class="btn-sec" id="cm-cancelar">Cancelar</button>
          <button class="btn-primario" id="cm-guardar">Crear cotización</button>
        </div>
      </div>
    `, { ancho: true });
    const $ = (s) => modal.querySelector(s);

    function recalcularYPintar() {
      const cont = $("#cm-lineas");
      if (lineas.length === 0) {
        cont.innerHTML = '<div class="inv-vacio" style="padding:16px">Agrega al menos un producto o concepto.</div>';
      } else {
        cont.innerHTML = lineas.map((l, i) => `
          <div class="cot-linea-ed" data-i="${i}">
            <input class="cot-le-desc" data-campo="descripcion" value="${escapar(l.descripcion)}" />
            <input class="cot-le-cant num" data-campo="cantidad" inputmode="decimal" value="${l.cantidad}" />
            <input class="cot-le-precio num" data-campo="precio" inputmode="decimal" value="${(l.precio_unitario_centavos / 100).toFixed(2)}" />
            <span class="cot-le-total num">${pesos(Math.max(0, Math.round(l.precio_unitario_centavos * l.cantidad) - l.descuento_linea_centavos))}</span>
            <button type="button" class="cot-le-quitar" data-quitar="${i}">×</button>
          </div>`).join("");
        cont.querySelectorAll("[data-campo]").forEach((inp) => {
          inp.addEventListener("input", () => {
            const i = Number(inp.closest("[data-i]").dataset.i);
            const campo = inp.dataset.campo;
            if (campo === "descripcion") lineas[i].descripcion = inp.value;
            if (campo === "cantidad") lineas[i].cantidad = Math.max(0.001, parseFloat((inp.value || "0").replace(",", ".")) || 0);
            if (campo === "precio") lineas[i].precio_unitario_centavos = Math.max(0, Math.round((parseFloat((inp.value || "0").replace(",", ".")) || 0) * 100));
            actualizarTotalLinea(i);
          });
        });
        cont.querySelectorAll("[data-quitar]").forEach((b) =>
          b.addEventListener("click", () => { lineas.splice(Number(b.dataset.quitar), 1); recalcularYPintar(); })
        );
      }
      actualizarTotalGeneral();
    }

    function actualizarTotalLinea(i) {
      const fila = $(`.cot-linea-ed[data-i="${i}"]`);
      const l = lineas[i];
      const total = Math.max(0, Math.round(l.precio_unitario_centavos * l.cantidad) - l.descuento_linea_centavos);
      if (fila) fila.querySelector(".cot-le-total").textContent = pesos(total);
      actualizarTotalGeneral();
    }

    function actualizarTotalGeneral() {
      const subtotal = lineas.reduce((s, l) => s + Math.max(0, Math.round(l.precio_unitario_centavos * l.cantidad) - l.descuento_linea_centavos), 0);
      const descTxt = ($("#cm-descuento").value || "").trim().replace(",", ".");
      const descGlobal = Math.max(0, Math.round((parseFloat(descTxt) || 0) * 100));
      $("#cm-total-txt").textContent = pesos(Math.max(0, subtotal - descGlobal));
    }
    $("#cm-descuento").addEventListener("input", actualizarTotalGeneral);

    $("#cm-agregar-libre").addEventListener("click", () => {
      lineas.push({ producto_id: null, descripcion: "", cantidad: 1, precio_unitario_centavos: 0, descuento_linea_centavos: 0 });
      recalcularYPintar();
      setTimeout(() => modal.querySelector(".cot-lineas-lista .cot-le-desc:last-of-type")?.focus(), 30);
    });

    $("#cm-agregar-producto").addEventListener("click", () => abrirBuscadorProducto((p) => {
      lineas.push({
        producto_id: p.id, descripcion: p.nombre,
        cantidad: 1, precio_unitario_centavos: p.precio_venta_centavos, descuento_linea_centavos: 0,
      });
      recalcularYPintar();
    }));

    $("#cm-cancelar").addEventListener("click", cerrarModal);
    $("#cm-guardar").addEventListener("click", async () => {
      const err = $("#cm-error");
      err.textContent = "";
      if (lineas.length === 0 || lineas.some((l) => !l.descripcion.trim())) {
        err.textContent = "Cada concepto necesita una descripción.";
        return;
      }
      const descTxt = ($("#cm-descuento").value || "").trim().replace(",", ".");
      const datos = {
        cliente_nombre: $("#cm-cliente").value.trim() || null,
        cliente_telefono: $("#cm-tel").value.trim() || null,
        cliente_correo: $("#cm-correo").value.trim() || null,
        notas: $("#cm-notas").value.trim() || null,
        valida_hasta: $("#cm-valida").value || null,
        descuento_centavos: Math.max(0, Math.round((parseFloat(descTxt) || 0) * 100)),
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          descripcion: l.descripcion.trim(),
          cantidad: l.cantidad,
          precio_unitario_centavos: l.precio_unitario_centavos,
          descuento_linea_centavos: l.descuento_linea_centavos,
        })),
      };
      try {
        await invoke("cot_crear", { datos });
        cerrarModal();
        cargar();
      } catch (e) {
        err.textContent = String(e);
      }
    });

    recalcularYPintar();
  }

  // ------------------------------------------------- Buscador de producto
  function abrirBuscadorProducto(alElegir) {
    const modal = abrirModal(`
      <h2>Agregar del catálogo</h2>
      <input id="bp-buscar" class="inv-buscar" placeholder="Buscar producto por nombre o código…" autocomplete="off" />
      <div id="bp-lista" class="sc-lista"></div>
      <div class="m-acciones"><span></span><button class="btn-sec" id="bp-cerrar">Cerrar</button></div>
    `, { alto: true });
    const $ = (s) => modal.querySelector(s);
    $("#bp-cerrar").addEventListener("click", cerrarModal);
    const input = $("#bp-buscar");
    setTimeout(() => input.focus(), 50);

    async function buscar(texto) {
      const lista = $("#bp-lista");
      let productos = [];
      try {
        productos = await invoke("prod_listar", { rol: sesion.rol, filtro: texto || null, soloStockBajo: false });
      } catch (e) {
        lista.innerHTML = `<div class="estado estado--error">${escapar(String(e))}</div>`;
        return;
      }
      if (productos.length === 0) {
        lista.innerHTML = '<div class="inv-vacio">Sin resultados.</div>';
        return;
      }
      lista.innerHTML = productos.slice(0, 40).map((p) => `
        <button type="button" class="sc-item" data-id="${p.id}">
          <span>${escapar(p.nombre)}</span>
          <span class="num">${pesos(p.precio_venta_centavos)}</span>
        </button>`).join("");
      lista.querySelectorAll("[data-id]").forEach((b) =>
        b.addEventListener("click", () => {
          const p = productos.find((x) => x.id === b.dataset.id);
          if (p) { alElegir(p); cerrarModal(); }
        })
      );
    }
    let t;
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => buscar(input.value.trim()), 180); });
    buscar("");
  }
}
