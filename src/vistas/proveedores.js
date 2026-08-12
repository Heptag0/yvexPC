// YvexPOS — sección Proveedores y compras.
// De quién surtes y cada surtido registrado. El dueño puede marcar los días
// que pasa cada proveedor para que Inicio le avise ("mañana llega Coca").
// LOCAL-ONLY: nada de esto sube a la nube todavía (igual que en el móvil).

import { invoke } from "@tauri-apps/api/core";
import { pesos, escapar } from "../util/formato.js";
import { confirmar } from "../util/confirmar.js";
import { abrirModal, cerrarModal } from "../util/modal.js";

const DIAS = [
  { n: 1, corto: "L" }, { n: 2, corto: "M" }, { n: 3, corto: "Mi" },
  { n: 4, corto: "J" }, { n: 5, corto: "V" }, { n: 6, corto: "S" },
  { n: 0, corto: "D" },
];
const DIAS_NOMBRE = {
  0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles",
  4: "Jueves", 5: "Viernes", 6: "Sábado",
};

export function montarProveedores(contenedor, sesion, alSalir) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";

  const wrap = document.createElement("div");
  wrap.className = "prov";
  contenedor.appendChild(wrap);

  let proveedores = [];
  let filtro = "";

  pintarEsqueleto();
  cargar();

  function pintarEsqueleto() {
    wrap.innerHTML = `
      <header class="inv-head">
        <div class="inv-head-izq">
          <button class="inv-volver" id="prov-volver" aria-label="Volver">←</button>
          <h1>Proveedores</h1>
        </div>
        <div class="inv-head-der">
          <button class="btn-sec" id="prov-compra">Registrar compra</button>
          <button class="btn-primario" id="prov-nuevo">+ Proveedor</button>
        </div>
      </header>
      <div class="inv-barra">
        <input id="prov-buscar" class="inv-buscar" placeholder="Buscar proveedor…" autocomplete="off" />
      </div>
      <div class="inv-tabla-wrap">
        <table class="inv-tabla">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Viene</th>
              <th class="num">Compras</th>
              <th class="num">Último ticket</th>
              <th class="num">Promedio</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="prov-tbody"></tbody>
        </table>
        <div id="prov-vacio" class="inv-vacio" hidden></div>
      </div>
    `;
    wrap.querySelector("#prov-volver").addEventListener("click", alSalir);
    wrap.querySelector("#prov-nuevo").addEventListener("click", () => abrirModalProveedor(null));
    wrap.querySelector("#prov-compra").addEventListener("click", () => abrirModalCompra(null));
    const buscar = wrap.querySelector("#prov-buscar");
    let t;
    buscar.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        filtro = buscar.value.trim();
        cargar();
      }, 180);
    });
  }

  async function cargar() {
    const tbody = wrap.querySelector("#prov-tbody");
    const vacio = wrap.querySelector("#prov-vacio");
    try {
      proveedores = await invoke("prov_listar", { filtro: filtro || null });
    } catch (e) {
      tbody.innerHTML = "";
      vacio.hidden = false;
      vacio.textContent = "Error al cargar proveedores: " + e;
      return;
    }
    if (proveedores.length === 0) {
      tbody.innerHTML = "";
      vacio.hidden = false;
      vacio.textContent = filtro
        ? "Sin resultados para “" + filtro + "”."
        : "Aún no tienes proveedores. Crea el primero con “+ Proveedor”, o registra una compra y se da de alta solo.";
      return;
    }
    vacio.hidden = true;
    tbody.innerHTML = proveedores.map(fila).join("");
    tbody.querySelectorAll("[data-historial]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = proveedores.find((x) => x.id === b.dataset.historial);
        abrirHistorial(p);
      })
    );
    tbody.querySelectorAll("[data-editar]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = proveedores.find((x) => x.id === b.dataset.editar);
        abrirModalProveedor(p);
      })
    );
  }

  function etiquetaDias(p) {
    if (!p.dias_visita || p.dias_visita.length === 0) return "—";
    return DIAS.filter((d) => p.dias_visita.includes(d.n)).map((d) => d.corto).join(" ");
  }

  function fila(p) {
    return `
      <tr>
        <td class="inv-nombre">${escapar(p.nombre)}</td>
        <td>${etiquetaDias(p)}</td>
        <td class="num">${p.total_compras}</td>
        <td class="num">${p.ultimo_ticket_centavos != null ? pesos(p.ultimo_ticket_centavos) : "—"}</td>
        <td class="num">${p.ticket_promedio_centavos != null ? pesos(p.ticket_promedio_centavos) : "—"}</td>
        <td class="inv-acciones-col">
          <button class="btn-mini" data-historial="${p.id}">Historial</button>
          <button class="btn-mini" data-editar="${p.id}">Editar</button>
        </td>
      </tr>`;
  }

  // La duodécima copia del mismo modal local del programa. Aquí además hay
  // un caso real de modal-sobre-modal: el Historial puede abrir "+ Compra"
  // encima (más abajo), y con el singleton viejo eso cerraba el historial.

  // ------------------------------------------------- Alta / edición proveedor
  function abrirModalProveedor(prov) {
    const esEdicion = !!prov;
    const diasActuales = (prov && prov.dias_visita) || [];
    const modal = abrirModal(`
      <h2>${esEdicion ? "Editar proveedor" : "Nuevo proveedor"}</h2>
      <div class="m-grid">
        <label class="m-col2">Nombre
          <input id="pm-nombre" value="${prov ? escapar(prov.nombre) : ""}" placeholder="Ej. Coca-Cola, Bimbo, el de la verdura" />
        </label>
        <label>Contacto
          <input id="pm-contacto" value="${prov && prov.contacto ? escapar(prov.contacto) : ""}" placeholder="Opcional" />
        </label>
        <label>Teléfono
          <input id="pm-tel" value="${prov && prov.telefono ? escapar(prov.telefono) : ""}" placeholder="Opcional" />
        </label>
        <label class="m-col2">Notas
          <input id="pm-notas" value="${prov && prov.notas ? escapar(prov.notas) : ""}" placeholder="Ej. paga en efectivo, trae catálogo…" />
        </label>
      </div>
      <p class="m-sub" style="margin-top:14px">¿Qué días viene? Si lo marcas, Inicio te avisa cuando esté por llegar.</p>
      <div class="prov-dias" id="pm-dias">
        ${DIAS.map((d) => `
          <button type="button" class="prov-dia${diasActuales.includes(d.n) ? " prov-dia--on" : ""}" data-dia="${d.n}" title="${DIAS_NOMBRE[d.n]}">${d.corto}</button>
        `).join("")}
      </div>
      <p class="m-error" id="pm-error"></p>
      <div class="m-acciones">
        ${esEdicion ? `<button class="btn-peligro" id="pm-eliminar">Eliminar</button>` : "<span></span>"}
        <div>
          <button class="btn-sec" id="pm-cancelar">Cancelar</button>
          <button class="btn-primario" id="pm-guardar">Guardar</button>
        </div>
      </div>
    `);

    const $ = (s) => modal.querySelector(s);
    let diasSel = new Set(diasActuales);
    $("#pm-dias").querySelectorAll(".prov-dia").forEach((b) =>
      b.addEventListener("click", () => {
        const n = Number(b.dataset.dia);
        if (diasSel.has(n)) { diasSel.delete(n); b.classList.remove("prov-dia--on"); }
        else { diasSel.add(n); b.classList.add("prov-dia--on"); }
      })
    );

    $("#pm-cancelar").addEventListener("click", cerrarModal);
    if (esEdicion) {
      $("#pm-eliminar").addEventListener("click", async () => {
        const ok = await confirmar(
          `${prov.nombre} dejará de aparecer en tu lista, pero su historial de compras se conserva. ¿Continuar?`,
          { titulo: "Quitar proveedor", ok: "Quitar", cancelar: "Cancelar" }
        );
        if (!ok) return;
        try {
          await invoke("prov_eliminar", { id: prov.id });
          cerrarModal();
          cargar();
        } catch (e) {
          $("#pm-error").textContent = String(e);
        }
      });
    }
    $("#pm-guardar").addEventListener("click", async () => {
      const err = $("#pm-error");
      err.textContent = "";
      const nombre = $("#pm-nombre").value.trim();
      if (!nombre) {
        err.textContent = "El nombre no puede estar vacío.";
        return;
      }
      const datos = {
        nombre,
        contacto: $("#pm-contacto").value.trim() || null,
        telefono: $("#pm-tel").value.trim() || null,
        notas: $("#pm-notas").value.trim() || null,
        dias_visita: diasSel.size ? Array.from(diasSel) : null,
      };
      try {
        if (esEdicion) {
          await invoke("prov_editar", { id: prov.id, datos });
        } else {
          await invoke("prov_crear", { datos });
        }
        cerrarModal();
        cargar();
      } catch (e) {
        err.textContent = String(e);
      }
    });
  }

  // ------------------------------------------------------------ Historial
  async function abrirHistorial(prov) {
    let compras = [];
    const modal = abrirModal(`
      <h2>${escapar(prov.nombre)}</h2>
      <p class="m-sub">${prov.total_compras} compra${prov.total_compras === 1 ? "" : "s"} registrada${prov.total_compras === 1 ? "" : "s"}</p>
      <div id="ph-lista" class="prov-hist-lista"><div class="estado">Cargando…</div></div>
      <div class="m-acciones">
        <span></span>
        <div>
          <button class="btn-sec" id="ph-cerrar">Cerrar</button>
          <button class="btn-primario" id="ph-compra">+ Compra</button>
        </div>
      </div>
    `, { clase: "modal--ancho" });
    const $ = (s) => modal.querySelector(s);
    $("#ph-cerrar").addEventListener("click", cerrarModal);
    $("#ph-compra").addEventListener("click", () => {
      cerrarModal();
      abrirModalCompra(prov);
    });

    try {
      compras = await invoke("compra_historial", { proveedorId: prov.id });
    } catch (e) {
      $("#ph-lista").innerHTML = `<div class="estado estado--error">${escapar(String(e))}</div>`;
      return;
    }
    if (compras.length === 0) {
      $("#ph-lista").innerHTML = `<div class="estado">Sin compras registradas todavía.</div>`;
      return;
    }
    $("#ph-lista").innerHTML = compras.map((c) => `
      <div class="prov-hist-fila">
        <div class="prov-hist-info">
          <span class="prov-hist-fecha">${c.fecha ? escapar(c.fecha) : new Date(c.creado_en).toLocaleDateString("es-MX")}</span>
          <span class="prov-hist-meta">${c.tipo === "preventa" ? "Preventa" : "Compra"}${c.folio ? " · folio " + escapar(c.folio) : ""}</span>
          ${c.notas ? `<span class="prov-hist-notas">${escapar(c.notas)}</span>` : ""}
        </div>
        <div class="prov-hist-acc">
          <span class="num prov-hist-total">${pesos(c.total_centavos)}</span>
          <button class="btn-mini" data-borrar-compra="${c.id}" title="Eliminar">×</button>
        </div>
      </div>`).join("");
    $("#ph-lista").querySelectorAll("[data-borrar-compra]").forEach((b) =>
      b.addEventListener("click", async () => {
        const ok = await confirmar("Esta compra se quitará del historial.", {
          titulo: "Eliminar compra", ok: "Eliminar", cancelar: "Cancelar",
        });
        if (!ok) return;
        try {
          await invoke("compra_eliminar", { id: b.dataset.borrarCompra });
          cerrarModal();
          await cargar();
          const actualizado = proveedores.find((x) => x.id === prov.id);
          if (actualizado) abrirHistorial(actualizado);
        } catch (e) {
          await confirmar(String(e), { titulo: "No se pudo eliminar", ok: "Entendido" });
        }
      })
    );
  }

  // --------------------------------------------------------- Registrar compra
  function abrirModalCompra(provPreseleccionado) {
    const hoy = new Date().toISOString().slice(0, 10);
    const modal = abrirModal(`
      <h2>Registrar compra</h2>
      <div class="m-grid">
        <label class="m-col2">Proveedor
          <input id="cm-proveedor" list="cm-proveedores-lista" value="${provPreseleccionado ? escapar(provPreseleccionado.nombre) : ""}" placeholder="Escribe el nombre… si no existe, se crea" autocomplete="off" />
          <datalist id="cm-proveedores-lista">
            ${proveedores.map((p) => `<option value="${escapar(p.nombre)}">`).join("")}
          </datalist>
        </label>
        <label>Fecha
          <input id="cm-fecha" type="date" value="${hoy}" />
        </label>
        <label>Folio
          <input id="cm-folio" placeholder="Opcional" />
        </label>
        <label>Tipo
          <select id="cm-tipo">
            <option value="normal">Compra normal</option>
            <option value="preventa">Preventa</option>
          </select>
        </label>
        <label>Total
          <input id="cm-total" inputmode="decimal" placeholder="0.00" />
        </label>
        <label class="m-col2">Notas
          <input id="cm-notas" placeholder="Opcional" />
        </label>
      </div>
      <p class="m-error" id="cm-error"></p>
      <div class="m-acciones">
        <span></span>
        <div>
          <button class="btn-sec" id="cm-cancelar">Cancelar</button>
          <button class="btn-primario" id="cm-guardar">Registrar</button>
        </div>
      </div>
    `);
    const $ = (s) => modal.querySelector(s);
    $("#cm-cancelar").addEventListener("click", cerrarModal);
    setTimeout(() => $("#cm-total").focus(), 50);

    $("#cm-guardar").addEventListener("click", async () => {
      const err = $("#cm-error");
      err.textContent = "";
      const totalTexto = ($("#cm-total").value || "").trim().replace(",", ".");
      const totalNum = parseFloat(totalTexto);
      if (isNaN(totalNum) || totalNum <= 0) {
        err.textContent = "Indica el total de la compra.";
        return;
      }
      const nombreProveedor = $("#cm-proveedor").value.trim();
      const datos = {
        proveedor_id: null,
        proveedor_nombre: nombreProveedor || null,
        folio: $("#cm-folio").value.trim() || null,
        fecha: $("#cm-fecha").value || null,
        tipo: $("#cm-tipo").value,
        total_centavos: Math.round(totalNum * 100),
        num_lineas: 0,
        notas: $("#cm-notas").value.trim() || null,
      };
      try {
        await invoke("compra_registrar", { datos });
        cerrarModal();
        await cargar();
      } catch (e) {
        err.textContent = String(e);
      }
    });
  }
}
