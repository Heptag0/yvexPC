// YvexPOS — vista Lealtad (programa de puntos).
// Clientes con puntos, QR único por cliente, historial de movimientos y los
// ajustes del programa. LOCAL-ONLY: nada de esto sube a la nube todavía.
//
// El QR codifica "YVEXPOS:{codigo}" (ej. YVEXPOS:YV-8K3Q2Z) con qrcodegen
// (Nayuki, MIT) portado tal cual del móvil. En venta y aquí, el buscador
// acepta el código escaneado (el lector HID escribe como teclado).

import { invoke } from "@tauri-apps/api/core";
import qrcodegen from "../util/qrcodegen.ts";
import { pesos, escapar } from "../util/formato.js";
import { icono } from "../util/iconos.js";
import { confirmar } from "../util/confirmar.js";
import { horaRelativa, urlWhatsApp, abrirUrl } from "../util/tienda.js";
import { lineaVida } from "../util/sidebar.js";

const QUIET = 4;

export function montarLealtad(contenedor, sesion, volver) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";

  const wrap = document.createElement("div");
  wrap.className = "lea";
  contenedor.appendChild(wrap);

  wrap.innerHTML = `
    <header class="lea-head">
      <div>
        <h1 class="lea-titulo">Lealtad</h1>
        <p class="lea-sub">Puntos para tus clientes de siempre. Se acumulan con cada compra y se canjean como descuento.</p>
      </div>
      <div class="lea-head-acciones">
        <button class="btn-sec" id="lea-ajustes">Ajustes del programa</button>
        <button class="btn-primario" id="lea-nuevo">Nuevo cliente</button>
      </div>
    </header>
    <div class="lea-banner" id="lea-banner" hidden></div>
    <input class="lea-buscar inv-buscar" id="lea-buscar" style="width:100%"
           placeholder="Buscar por nombre, teléfono, correo o escanear su código…" autocomplete="off">
    <div class="lea-cuerpo">
      <div class="lea-lista" id="lea-lista"><div class="estado">Cargando clientes…</div></div>
      <div class="lea-detalle" id="lea-detalle"><div class="estado">Elige un cliente para ver sus puntos y su código.</div></div>
    </div>
  `;

  const $ = (s) => wrap.querySelector(s);
  const listaEl = $("#lea-lista");
  const detalleEl = $("#lea-detalle");

  let reglas = null;
  let clienteSel = null;

  iniciar();

  async function iniciar() {
    try {
      reglas = await invoke("lealtad_reglas");
    } catch (e) {
      reglas = null;
    }
    if (reglas && !reglas.activa) {
      const b = $("#lea-banner");
      b.hidden = false;
      b.textContent = "El programa está apagado. Los puntos no se acumulan ni se canjean hasta que lo actives en Ajustes del programa.";
    }
    await buscar("");
  }

  // ------------------------------------------------------------- buscador
  let t;
  $("#lea-buscar").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => buscar(e.target.value.trim()), 180);
  });
  // Enter con un código (escaneado o tecleado) resuelve directo al cliente.
  $("#lea-buscar").addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const texto = e.target.value.trim();
    if (!texto) return;
    try {
      const c = await invoke("lealtad_cliente_por_codigo", { codigo: texto });
      if (c) {
        mostrarDetalle(c);
        return;
      }
    } catch (err) { /* sigue con búsqueda normal */ }
    buscar(texto);
  });

  async function buscar(texto) {
    let lista = [];
    try {
      lista = await invoke("cliente_listar", { filtro: texto || null });
    } catch (e) {
      lista = [];
    }
    if (lista.length === 0) {
      listaEl.innerHTML = '<div class="estado">Sin clientes por aquí. Dale a "Nuevo cliente" para registrar al primero.</div>';
      return;
    }
    listaEl.innerHTML = lista
      .slice(0, 60)
      .map(
        (c) => `
      <button class="lea-item ${clienteSel && clienteSel.id === c.id ? "lea-item--on" : ""}" data-id="${c.id}">
        <span class="lea-item-nombre">${escapar(c.nombre)}</span>
        <span class="lea-item-meta">${c.telefono ? escapar(c.telefono) : ""}</span>
        <span class="lea-item-puntos num">${c.puntos || 0} pts</span>
      </button>`
      )
      .join("");
    listaEl.querySelectorAll(".lea-item").forEach((b) =>
      b.addEventListener("click", async () => {
        const c = lista.find((x) => x.id === b.dataset.id);
        mostrarDetalle(c);
      })
    );
  }

  // ------------------------------------------------------------- detalle
  async function mostrarDetalle(c) {
    clienteSel = c;
    listaEl.querySelectorAll(".lea-item").forEach((x) =>
      x.classList.toggle("lea-item--on", x.dataset.id === c.id)
    );
    detalleEl.innerHTML = '<div class="estado">Cargando su tarjeta…</div>';
    try {
      // Código perezoso: los clientes de antes de la lealtad lo reciben aquí.
      const codigo = await invoke("lealtad_asegurar_codigo", { clienteId: c.id });
      c.codigo = codigo;
      const hist = await invoke("lealtad_historial", { clienteId: c.id }).catch(() => []);
      pintarDetalle(c, hist);
    } catch (e) {
      detalleEl.innerHTML = `<div class="estado estado--error">${escapar(String(e))}</div>`;
    }
  }

  function svgQr(contenido, size) {
    const qr = qrcodegen.QrCode.encodeText(contenido, qrcodegen.QrCode.Ecc.MEDIUM);
    const n = qr.size;
    const total = n + QUIET * 2;
    let rects = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.getModule(x, y)) rects += `<rect x="${x + QUIET}" y="${y + QUIET}" width="1" height="1"/>`;
      }
    }
    return `<svg viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" class="lea-qr" role="img" aria-label="Código QR del cliente"><rect width="${total}" height="${total}" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
  }

  function pintarDetalle(c, hist) {
    const contenidoQr = `YVEXPOS:${c.codigo}`;
    detalleEl.innerHTML = `
      <div class="lea-card con-luz">
        <div class="lea-card-head">
          <div>
            <div class="lea-card-nombre">${escapar(c.nombre)}</div>
            <div class="lea-card-meta">${[c.telefono, c.correo].filter(Boolean).map(escapar).join(" · ") || "Sin contacto"}</div>
          </div>
          <button class="btn-sec btn-mini" id="lea-editar">Editar</button>
        </div>
        <div class="lea-card-puntos">
          <span class="num" id="lea-puntos">${c.puntos || 0}</span>
          <span class="lea-puntos-label">puntos${reglas ? ` · cada punto vale ${pesos(reglas.valor_punto_centavos)} al canjear` : ""}</span>
        </div>
        <div class="lea-card-acciones">
          <button class="btn-sec btn-mini" id="lea-visita">Registrar visita</button>
          ${sesion.rol === "dueno" ? '<button class="btn-sec btn-mini" id="lea-ajuste">Ajustar puntos</button>' : ""}
        </div>
      </div>
      <div class="lea-card con-filo lea-card-qr">
        ${svgQr(contenidoQr, 180)}
        <div class="lea-codigo num">${escapar(c.codigo)}</div>
        <p class="lea-qr-ayuda">Que lo escanee desde su celular… o enséñale este código para que lo guarde. En el mostrador se escanea y sale su nombre.</p>
        <button class="btn-sec" id="lea-compartir">Compartir código</button>
      </div>
      <div class="lea-card con-filo">
        <div class="lea-hist-titulo">Historial de puntos</div>
        <div class="lea-hist">
          ${hist.length === 0 ? '<div class="estado">Aún no tiene movimientos.</div>' : hist.map((m) => `
            <div class="lea-mov">
              <span class="lea-mov-tipo lea-mov-tipo--${escapar(m.tipo)}">${etiquetaTipo(m.tipo)}</span>
              <span class="lea-mov-nota">${escapar(m.nota || "")}</span>
              <span class="lea-mov-fecha">${escapar(horaRelativa(m.creado_en))}</span>
              <span class="lea-mov-puntos num ${m.puntos >= 0 ? "lea-mov--mas" : "lea-mov--menos"}">${m.puntos >= 0 ? "+" : ""}${m.puntos}</span>
            </div>`).join("")}
        </div>
      </div>
    `;

    $("#lea-editar").onclick = () => formCliente(c);
    $("#lea-visita").onclick = async () => {
      try {
        const r = await invoke("lealtad_registrar_visita", { clienteId: c.id });
        if (r.otorgados > 0) {
          lineaVida.exito();
          await aviso(`Listo: +${r.otorgados} puntos por su visita de hoy.`);
        } else {
          await aviso(r.motivo || "No se sumaron puntos esta vez.");
        }
        await refrescarCliente(c.id);
      } catch (e) {
        await aviso(e);
      }
    };
    const btnAjuste = $("#lea-ajuste");
    if (btnAjuste) btnAjuste.onclick = () => formAjuste(c);
    $("#lea-compartir").onclick = async () => {
      const texto = `Hola, este es tu código de cliente en nuestro negocio: ${c.codigo}. Muéstralo al pagar para acumular puntos y ganar descuentos.`;
      let copiado = false;
      try {
        await navigator.clipboard.writeText(texto);
        copiado = true;
      } catch (e) { /* el portapapeles puede fallar; sigue WhatsApp */ }
      if (c.telefono) {
        await abrirUrl(urlWhatsApp(c.telefono, texto)).catch(() => {});
        await aviso("Abrimos WhatsApp con el mensaje listo para enviarle su código.");
      } else {
        await aviso(copiado
          ? "Código copiado. Pégalo donde quieras compartirlo."
          : `Su código es ${c.codigo}. Anótalo para compartirlo (no pudimos copiarlo solos).`);
      }
    };
  }

  function etiquetaTipo(t) {
    return { compra: "Compra", visita: "Visita", canje: "Canje", ajuste: "Ajuste" }[t] || t;
  }

  async function refrescarCliente(id) {
    try {
      const c = await invoke("cliente_obtener", { id });
      if (c) {
        mostrarDetalle(c);
        buscar($("#lea-buscar").value.trim());
      }
    } catch (e) { /* silencio */ }
  }

  // ------------------------------------------------------------- alta/edición
  function formCliente(c) {
    const esNuevo = !c;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay modal-overlay--alto";
    overlay.innerHTML = `
      <div class="modal modal--chico" role="dialog" aria-modal="true">
        <h2>${esNuevo ? "Nuevo cliente" : "Editar cliente"}</h2>
        <label class="f-label">Nombre *</label>
        <input id="fc-nombre" class="inv-buscar" style="width:100%" value="${escapar(c?.nombre || "")}" autocomplete="off">
        <label class="f-label">Teléfono</label>
        <input id="fc-telefono" class="inv-buscar" style="width:100%" value="${escapar(c?.telefono || "")}" autocomplete="off">
        <label class="f-label">Correo</label>
        <input id="fc-correo" class="inv-buscar" style="width:100%" value="${escapar(c?.correo || "")}" autocomplete="off">
        <p class="m-sub">El correo servirá para promociones. Si está incompleto, se guarda sin él (nunca bloquea el alta).</p>
        <p class="m-error" id="fc-error"></p>
        <div class="m-acciones"><span></span>
          <button class="btn-sec" id="fc-cancelar">Cancelar</button>
          <button class="btn-primario" id="fc-ok">${esNuevo ? "Crear" : "Guardar"}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const q = (s) => overlay.querySelector(s);
    const cerrar = () => overlay.remove();
    q("#fc-cancelar").onclick = cerrar;
    q("#fc-ok").onclick = async () => {
      const datos = {
        nombre: q("#fc-nombre").value.trim(),
        telefono: q("#fc-telefono").value.trim() || null,
        correo: q("#fc-correo").value.trim() || null,
        notas: c?.notas || null,
        limite_credito_centavos: c ? c.limite_credito_centavos : 0,
      };
      try {
        if (esNuevo) {
          const nuevo = await invoke("cliente_crear", { datos });
          cerrar();
          lineaVida.exito();
          await buscar("");
          mostrarDetalle(nuevo);
        } else {
          await invoke("cliente_editar", { datos: { ...datos, id: c.id } });
          cerrar();
          lineaVida.exito();
          await refrescarCliente(c.id);
        }
      } catch (e) {
        q("#fc-error").textContent = String(e);
      }
    };
    setTimeout(() => q("#fc-nombre").focus(), 40);
  }

  // ------------------------------------------------------------- ajuste manual
  function formAjuste(c) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay modal-overlay--alto";
    overlay.innerHTML = `
      <div class="modal modal--chico" role="dialog" aria-modal="true">
        <h2>Ajustar puntos de ${escapar(c.nombre)}</h2>
        <p class="m-sub">Saldo actual: <strong>${c.puntos || 0} puntos</strong>. Escribe cuántos sumar (o quitar con signo menos).</p>
        <label class="f-label">Puntos (ej. 10 o -5)</label>
        <input id="fa-puntos" class="inv-buscar" style="width:100%" inputmode="numeric" autocomplete="off">
        <label class="f-label">Motivo</label>
        <input id="fa-nota" class="inv-buscar" style="width:100%" placeholder="Cortesía, corrección…" autocomplete="off">
        <p class="m-error" id="fa-error"></p>
        <div class="m-acciones"><span></span>
          <button class="btn-sec" id="fa-cancelar">Cancelar</button>
          <button class="btn-primario" id="fa-ok">Aplicar ajuste</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const q = (s) => overlay.querySelector(s);
    const cerrar = () => overlay.remove();
    q("#fa-cancelar").onclick = cerrar;
    q("#fa-ok").onclick = async () => {
      const puntos = parseInt(q("#fa-puntos").value, 10);
      if (!Number.isFinite(puntos) || puntos === 0) {
        q("#fa-error").textContent = "Escribe cuántos puntos sumar o quitar (distinto de cero).";
        return;
      }
      try {
        await invoke("lealtad_ajustar_puntos", {
          clienteId: c.id, puntos, nota: q("#fa-nota").value.trim(), rol: sesion.rol,
        });
        cerrar();
        lineaVida.exito();
        await refrescarCliente(c.id);
      } catch (e) {
        q("#fa-error").textContent = String(e);
      }
    };
  }

  // ------------------------------------------------------------- ajustes
  $("#lea-nuevo").onclick = () => formCliente(null);
  $("#lea-ajustes").onclick = async () => {
    try {
      reglas = await invoke("lealtad_reglas");
    } catch (e) {
      await aviso(e);
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay modal-overlay--alto";
    overlay.innerHTML = `
      <div class="modal modal--chico" role="dialog" aria-modal="true">
        <h2>Ajustes del programa</h2>
        <label class="lea-check"><input type="checkbox" id="la-activa" ${reglas.activa ? "checked" : ""}>
          Programa activo</label>
        <label class="f-label">1 punto por cada $… de compra</label>
        <input id="la-pesos" class="inv-buscar" style="width:100%" type="number" min="1" step="1" value="${reglas.pesos_por_punto}">
        <label class="f-label">Puntos por visita (máx. 1 al día; 0 = apagado)</label>
        <input id="la-visita" class="inv-buscar" style="width:100%" type="number" min="0" step="1" value="${reglas.puntos_visita}">
        <label class="f-label">Valor de cada punto al canjear (en pesos)</label>
        <input id="la-valor" class="inv-buscar" style="width:100%" type="number" min="0.01" step="0.01" value="${(reglas.valor_punto_centavos / 100).toFixed(2)}">
        <label class="f-label">Tope del ticket cubrible con puntos (%)</label>
        <input id="la-tope" class="inv-buscar" style="width:100%" type="number" min="1" max="100" step="1" value="${reglas.tope_descuento_pct}">
        <p class="m-sub">Ejemplo: con 1 punto por cada $10 y valor de $1 por punto, una compra de $99 da 9 puntos y 25 puntos tapan $25 del ticket.</p>
        <p class="m-error" id="la-error"></p>
        <div class="m-acciones"><span></span>
          <button class="btn-sec" id="la-cancelar">Cancelar</button>
          <button class="btn-primario" id="la-ok">Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const q = (s) => overlay.querySelector(s);
    const cerrar = () => overlay.remove();
    q("#la-cancelar").onclick = cerrar;
    q("#la-ok").onclick = async () => {
      const pesosPorPunto = parseFloat(q("#la-pesos").value);
      const puntosVisita = parseInt(q("#la-visita").value, 10);
      const valorPesos = parseFloat(q("#la-valor").value);
      const tope = parseInt(q("#la-tope").value, 10);
      if (!Number.isFinite(pesosPorPunto) || pesosPorPunto <= 0) {
        q("#la-error").textContent = "Revisa cuántos pesos valen 1 punto.";
        return;
      }
      if (!Number.isFinite(valorPesos) || valorPesos <= 0) {
        q("#la-error").textContent = "Revisa el valor del punto al canjear.";
        return;
      }
      try {
        await invoke("lealtad_guardar_reglas", {
          reglas: {
            activa: q("#la-activa").checked,
            pesos_por_punto: pesosPorPunto,
            puntos_visita: Number.isFinite(puntosVisita) ? puntosVisita : 0,
            valor_punto_centavos: Math.round(valorPesos * 100),
            tope_descuento_pct: Number.isFinite(tope) ? tope : 50,
          },
          rol: sesion.rol,
        });
        reglas = await invoke("lealtad_reglas");
        $("#lea-banner").hidden = reglas.activa;
        cerrar();
        lineaVida.exito();
      } catch (e) {
        q("#la-error").textContent = String(e);
      }
    };
  };

  async function aviso(texto) {
    await confirmar(String(texto), { titulo: "Lealtad", ok: "Entendido" });
  }
}
