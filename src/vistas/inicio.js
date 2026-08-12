// YvexPOS — vista Inicio: el pulso del negocio en 5 segundos.
// Reemplaza al menú-grid: la navegación vive en la sidebar; esta pantalla
// responde "¿cómo va el día?" y "¿qué necesita mi atención?".
//
// Comandos: caja_corte, ventas_del_dia, ticket_espera_listar,
//   prod_contar_negativos, cliente_listar, y el nuevo `inicio_resumen`
//   (comparativas a la misma hora + stock por rotación + dinero atorado).
//   Si `inicio_resumen` aún no está registrado en Rust, esos widgets se
//   ocultan con gracia y cae al criterio viejo de stock bajo.
// Cada widget carga por separado (Promise por sección): si una consulta
// falla, las demás siguen vivas.

import { invoke } from "@tauri-apps/api/core";
import { pesos, escapar } from "../util/formato.js";
import { icono } from "../util/iconos.js";
import { calcularMisiones, misionesCompletas, CLAVE_FESTEJO } from "../util/misiones.js";

/// `navegar(mod)` viene de main.js: abre otro módulo desde un widget.
export function montarInicio(contenedor, sesion, cajaSesion, navegar) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";

  const esAdmin = sesion.rol === "dueno" || sesion.rol === "gerente";
  const wrap = document.createElement("div");
  wrap.className = "ini";
  contenedor.appendChild(wrap);

  const ahora = new Date();
  const fechaLarga = ahora.toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long",
  });

  wrap.innerHTML = `
    <header class="ini-head">
      <div>
        <h1 class="ini-saludo">Hola, ${escapar(sesion.nombre)}</h1>
        <p class="ini-fecha">${fechaLarga[0].toUpperCase() + fechaLarga.slice(1)}<span id="ini-caja-desde"></span></p>
      </div>
    </header>

    <div class="ini-metricas" id="ini-metricas">
      ${tarjeta("Venta del día · tu caja", "…", "ini-card--principal", "ini-m-venta")}
      ${tarjeta("Ventas · tu caja", "…", "", "ini-m-num")}
      ${tarjeta("Efectivo en cajón", "…", "", "ini-m-efectivo")}
      ${esAdmin ? tarjeta("Por cobrar", "…", "", "ini-m-cobrar") : ""}
    </div>

    <div class="ini-otras" id="ini-otras" hidden></div>

    <div class="ini-tendencias" id="ini-tendencias" hidden></div>

    <section class="ini-arranque-panel con-filo" id="ini-arranque" hidden>
      <div class="ini-panel-titulo-fila">
        <div class="ini-panel-titulo">Tu arranque</div>
        <span class="ini-arranque-conteo" id="ini-arranque-conteo"></span>
      </div>
      <div class="ini-arranque-lista" id="ini-arranque-lista"></div>
    </section>

    <div class="ini-grid">
      <section class="ini-panel con-filo">
        <div class="ini-panel-titulo">Actividad reciente</div>
        <div id="ini-actividad" class="ini-panel-cuerpo"><div class="ini-cargando">Cargando…</div></div>
      </section>
      <section class="ini-panel con-filo">
        <div class="ini-panel-titulo">Atención</div>
        <div id="ini-atencion" class="ini-panel-cuerpo"><div class="ini-cargando">Revisando…</div></div>
        <div class="ini-panel-titulo ini-panel-titulo--sep">Tickets en espera</div>
        <div id="ini-tickets" class="ini-panel-cuerpo"><div class="ini-cargando">Cargando…</div></div>
      </section>
    </div>
  `;

  const $ = (s) => wrap.querySelector(s);

  function tarjeta(label, valor, extra, id) {
    // La tarjeta --principal (Venta del día) es la única cifra "en vivo" de
    // Inicio: recibe con-luz en vez del filo genérico, mismo criterio que
    // el efectivo esperado del Corte y "por cobrar" de Clientes.
    const filo = extra === "ini-card--principal" ? "con-luz" : "con-filo";
    return `<div class="ini-card ${filo} ${extra}">
      <span class="ini-card-label">${label}</span>
      <span class="ini-card-valor num" id="${id}">${valor}</span>
    </div>`;
  }

  function tarjetaMision(m) {
    const pct = Math.min(100, Math.round((m.progreso / m.meta) * 100));
    return `
      <button class="ini-mision ${m.hecho ? "ini-mision--hecha" : ""}" data-ir="${destinoMision(m.id)}" ${m.hecho ? "disabled" : ""}>
        <span class="ini-mision-ico ${m.hecho ? "ini-mision-ico--hecha" : ""}">${m.hecho ? "✓" : icono(m.icono)}</span>
        <span class="ini-mision-cuerpo">
          <span class="ini-mision-titulo-fila">
            <span class="ini-mision-titulo">${escapar(m.titulo)}</span>
            <span class="ini-mision-progreso">${m.hecho ? "Hecho" : `${m.progreso}/${m.meta}`}</span>
          </span>
          ${!m.hecho ? `
            <span class="ini-mision-barra"><span class="ini-mision-barra-relleno" style="width:${pct}%"></span></span>
            <span class="ini-mision-detalle">${escapar(m.detalle)}</span>
          ` : ""}
        </span>
      </button>`;
  }

  // A qué módulo lleva cada misión al tocarla. "negocio" → Configuración
  // (ahí vive el nombre del negocio); todo lo demás pasa por Inventario,
  // incluida "ventas" — abrir un turno y cobrar arranca desde ahí.
  // ⚠️ Verifica que "configuracion" sea el id exacto que usa tu sidebar; si
  // tu módulo se llama distinto, es el único ajuste que necesitarías aquí.
  function destinoMision(id) {
    if (id === "negocio") return "configuracion";
    return "inventario";
  }

  function cajaFestejo() {
    return `
      <div class="ini-festejo">
        <div class="ini-festejo-ico">🎉</div>
        <div class="ini-festejo-titulo">¡Arranque completo!</div>
        <p class="ini-festejo-txt">Ya diste los primeros pasos importantes. Ahora sí, a venderle con todo.</p>
        <button class="btn-primario ini-festejo-cerrar" id="ini-festejo-cerrar">Entendido</button>
      </div>`;
  }

  // ------------------------------------------------ Métricas del turno
  (async () => {
    let c = null;
    try {
      c = await invoke("caja_corte", { cajaSesionId: cajaSesion.id });
      $("#ini-m-venta").textContent = pesos(c.total_vendido_centavos);
      $("#ini-m-num").textContent = String(c.num_ventas);
      $("#ini-m-efectivo").textContent = pesos(c.efectivo_esperado_centavos);
      const desde = new Date(c.abierta_en).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      $("#ini-caja-desde").textContent = ` · caja abierta desde ${desde}`;
    } catch (e) {
      $("#ini-m-venta").textContent = "—";
      $("#ini-m-num").textContent = "—";
      $("#ini-m-efectivo").textContent = "—";
      console.error("Inicio/corte:", e);
    }
    // Las tarjetas de arriba son de ESTA caja (el efectivo es físico). Si hoy
    // hubo ventas en otras cajas (móvil u otra PC) que ya bajaron por sync,
    // se anuncian aparte para que no parezca que faltan en los números.
    try {
      const zona = $("#ini-otras");
      if (zona && c && c.otras_cajas_num > 0) {
        zona.hidden = false;
        zona.textContent =
          `+ ${pesos(c.otras_cajas_total_centavos)} en ${c.otras_cajas_num} ` +
          `venta${c.otras_cajas_num === 1 ? "" : "s"} de otras cajas hoy (no entran al efectivo de este cajón)`;
      }
    } catch (e) { /* informativo: nunca rompe el inicio */ }
  })();

  // Por cobrar (solo admin): suma de saldos de clientes deudores.
  if (esAdmin) {
    (async () => {
      try {
        const clientes = await invoke("cliente_listar", { filtro: null });
        const total = clientes.reduce((s, c) => s + Math.max(0, c.saldo_centavos), 0);
        $("#ini-m-cobrar").textContent = pesos(total);
      } catch (e) {
        $("#ini-m-cobrar").textContent = "—";
      }
    })();
  }

  // ------------------------------------------------ Actividad reciente
  (async () => {
    const cont = $("#ini-actividad");
    let ventas = [];
    try {
      ventas = await invoke("ventas_del_dia", { rol: sesion.rol, cajaSesionId: cajaSesion.id });
    } catch (e) {
      cont.innerHTML = '<div class="ini-vacio">No se pudo cargar la actividad.</div>';
      return;
    }
    if (ventas.length === 0) {
      cont.innerHTML = '<div class="ini-vacio">Aún no hay ventas en este turno. La primera está a un escaneo de distancia.</div>';
      return;
    }
    const ultimas = ventas.slice(0, 6);
    cont.innerHTML = ultimas.map((v) => {
      const hora = new Date(v.creado_en).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
      const anomala = v.estado !== "completada";
      // Quién cobró: nombre del cajero siempre; si bajó de otra caja por
      // sync, se marca para no confundirla con las cobradas aquí.
      const quien = v.origen !== "otra" ? escapar(v.cajero || "")
        : (!v.cajero || v.cajero === "Otra caja") ? "Otra caja"
        : `Otra caja · ${escapar(v.cajero)}`;
      return `
        <div class="ini-venta">
          <span class="ini-venta-folio">#${v.folio}</span>
          <span class="ini-venta-hora">${hora}</span>
          <span class="ini-venta-quien ${v.origen === "otra" ? "ini-venta-quien--otra" : ""}">${quien}</span>
          ${anomala ? `<span class="ini-venta-estado">${escapar(v.estado.replace(/_/g, " "))}</span>` : "<span></span>"}
          <span class="ini-venta-total num">${pesos(v.total_centavos)}</span>
        </div>`;
    }).join("") + (ventas.length > 6
      ? `<button class="ini-mas" data-ir="caja">Ver el día completo en Corte →</button>` : "");
    enlazarNavegacion(cont);
  })();

  // ------------------------------------------------ Tendencias + Atención
  // Un solo comando trae comparativas y alertas inteligentes. Los rangos se
  // calculan aquí en hora local y viajan como ISO (convención de reportes).
  (async () => {
    const cont = $("#ini-atencion");
    const alertas = [];
    let resumen = null;

    // Rangos: comparar SIEMPRE a la misma hora, no contra días completos.
    const ahoraD = new Date();
    const iso = (d) => d.toISOString();
    const menosDias = (d, n) => new Date(d.getTime() - n * 86400000);
    const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (ahoraD.getDay() + 6) % 7; // lunes = 0
    const lunes = inicioDia(menosDias(ahoraD, dow));
    const rangos = {
      hoy_inicio: iso(inicioDia(ahoraD)),
      ahora: iso(ahoraD),
      dia_previo_inicio: iso(inicioDia(menosDias(ahoraD, 7))),
      dia_previo_fin: iso(menosDias(ahoraD, 7)),
      semana_inicio: iso(lunes),
      semana_previa_inicio: iso(menosDias(lunes, 7)),
      semana_previa_fin: iso(menosDias(ahoraD, 7)),
      hace_30_dias: iso(menosDias(ahoraD, 30)),
      hace_60_dias: iso(menosDias(ahoraD, 60)),
    };

    try {
      resumen = await invoke("inicio_resumen", { rol: sesion.rol, rangos });
    } catch (e) {
      console.warn("inicio_resumen no disponible aún:", e);
    }

    // --- Tendencias (solo si hay referencia previa contra qué comparar) ---
    if (resumen) {
      const chips = [];
      const nombreDia = ahoraD.toLocaleDateString("es-MX", { weekday: "long" });
      chips.push(chipTendencia(resumen.hoy, `vs ${nombreDia} pasado a esta hora`));
      chips.push(chipTendencia(resumen.semana, "esta semana vs la anterior"));
      const validos = chips.filter(Boolean);
      if (validos.length > 0) {
        const zona = $("#ini-tendencias");
        zona.hidden = false;
        zona.innerHTML = validos.join("");
      }
    }

    function chipTendencia(comp, etiqueta) {
      if (!comp || comp.anterior_centavos <= 0) return null; // sin referencia: silencio
      const pct = ((comp.actual_centavos - comp.anterior_centavos) / comp.anterior_centavos) * 100;
      if (!isFinite(pct)) return null;
      const arriba = pct >= 0;
      // Las positivas celebran en verde; las negativas informan en neutro, sin regaño.
      const clase = arriba ? "ini-tend--arriba" : "ini-tend--abajo";
      const flecha = arriba ? "↑" : "↓";
      return `<span class="ini-tend ${clase}">${flecha} ${Math.abs(pct).toFixed(0)}% ${escapar(etiqueta)}</span>`;
    }

    // --- Alertas ---
    try {
      const n = await invoke("prod_contar_negativos");
      if (n > 0) alertas.push({
        ir: "inventario", tono: "peligro", ico: "existencias",
        titulo: `${n} producto${n > 1 ? "s" : ""} en negativo`,
        sub: "Toca para revisar y ajustar",
      });
    } catch (e) { console.error(e); }

    if (resumen && resumen.por_agotarse) {
      // Criterio de rotación: solo lo que SE VENDE y se está acabando.
      if (resumen.por_agotarse.length > 0) {
        const p = resumen.por_agotarse;
        alertas.push({
          ir: "existencias", tono: "alerta", ico: "inventario",
          titulo: `${p.length} producto${p.length > 1 ? "s" : ""} por agotarse`,
          sub: p.slice(0, 3).map((x) =>
            `${x.nombre} (~${Math.max(1, Math.round(x.dias_cobertura))} día${Math.round(x.dias_cobertura) === 1 ? "" : "s"})`
          ).join(" · ") + (p.length > 3 ? "…" : ""),
        });
      }
    } else {
      // Fallback al criterio viejo mientras el comando Rust no exista.
      try {
        const bajos = await invoke("prod_listar", { rol: sesion.rol, filtro: null, soloStockBajo: true });
        if (bajos.length > 0) alertas.push({
          ir: "existencias", tono: "alerta", ico: "inventario",
          titulo: `${bajos.length} producto${bajos.length > 1 ? "s" : ""} con stock bajo`,
          sub: bajos.slice(0, 3).map((p) => p.nombre).join(" · ") + (bajos.length > 3 ? "…" : ""),
        });
      } catch (e) { console.error(e); }
    }

    // Dinero atorado (solo dueño/gerente): inventario congelado sin venta en
    // 60 días. SOLO se muestra si el sistema ya tiene historial suficiente —
    // un negocio recién migrado de otro POS no ha registrado ventas aquí, así
    // que "sin venta en 60 días" marcaría medio catálogo sin significar nada.
    if (resumen && resumen.muertos && resumen.muertos.cuantos > 0
        && resumen.muertos.historial_confiable) {
      const mtos = resumen.muertos;
      alertas.push({
        ir: "existencias", tono: "alerta", ico: "caja",
        titulo: `${pesos(mtos.valor_costo_centavos)} atorados en ${mtos.cuantos} producto${mtos.cuantos > 1 ? "s" : ""} sin venta en 60 días`,
        sub: mtos.peores.slice(0, 3).join(" · ") + (mtos.cuantos > 3 ? "…" : ""),
      });
    }

    if (esAdmin) {
      try {
        const clientes = await invoke("cliente_listar", { filtro: null });
        const sobre = clientes.filter((c) =>
          c.limite_credito_centavos > 0 && c.saldo_centavos > c.limite_credito_centavos);
        if (sobre.length > 0) alertas.push({
          ir: "credito", tono: "alerta", ico: "credito",
          titulo: `${sobre.length} cliente${sobre.length > 1 ? "s" : ""} sobre su límite`,
          sub: sobre.slice(0, 3).map((c) => c.nombre).join(" · "),
        });
      } catch (e) { console.error(e); }
    }

    // Avisos de proveedores: "mañana llega Coca-Cola" — informativo, nunca
    // bloquea nada si el comando falla o no hay proveedores con rutina.
    try {
      const hoy = new Date();
      const hoyYmd = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
      const avisos = await invoke("prov_avisos_visita", { hoy: hoyYmd });
      for (const a of avisos.slice(0, 3)) {
        const partes = [
          a.ultimo_ticket_centavos != null ? `último ${pesos(a.ultimo_ticket_centavos)}` : null,
          a.ticket_promedio_centavos != null ? `promedio ${pesos(a.ticket_promedio_centavos)}` : null,
        ].filter(Boolean).join(" · ");
        alertas.push({
          ir: "proveedores", tono: "alerta", ico: "proveedor",
          titulo: `${a.etiqueta} llega ${a.proveedor.nombre}`,
          sub: partes || "Sin compras registradas todavía",
        });
      }
    } catch (e) { console.error(e); }

    if (alertas.length === 0) {
      cont.innerHTML = '<div class="ini-ok">✓ Todo en orden. Nada pide tu atención.</div>';
      return;
    }
    cont.innerHTML = alertas.map((a) => `
      <button class="ini-alerta ini-alerta--${a.tono}" data-ir="${a.ir}">
        <span class="ini-alerta-ico">${icono(a.ico)}</span>
        <span class="ini-alerta-txt">
          <span class="ini-alerta-titulo">${escapar(a.titulo)}</span>
          <span class="ini-alerta-sub">${escapar(a.sub)}</span>
        </span>
      </button>`).join("");
    enlazarNavegacion(cont);
  })();

  // ------------------------------------------------ Tu arranque (misiones)
  // Independiente de todo lo demás: si falla, no afecta ni bloquea el resto
  // de Inicio. Se oculta para siempre en cuanto se ve la celebración final.
  (async () => {
    const zona = $("#ini-arranque");
    const lista = $("#ini-arranque-lista");
    const conteo = $("#ini-arranque-conteo");
    if (!zona) return;
    try {
      const [cfg, prog] = await Promise.all([
        invoke("config_leer_todo"),
        invoke("misiones_progreso"),
      ]);
      if (cfg[CLAVE_FESTEJO] === "1") return; // ya se celebró: no vuelve a aparecer

      const misiones = calcularMisiones(cfg, prog);
      zona.hidden = false;

      if (misionesCompletas(misiones)) {
        conteo.textContent = "";
        lista.innerHTML = cajaFestejo();
        const cerrar = $("#ini-festejo-cerrar");
        if (cerrar) cerrar.addEventListener("click", async () => {
          try {
            await invoke("config_guardar_claves", {
              claves: { [CLAVE_FESTEJO]: "1" }, rol: sesion.rol,
            });
          } catch (e) { console.error(e); }
          zona.hidden = true;
        });
        return;
      }

      conteo.textContent = `${misiones.filter((m) => m.hecho).length} de ${misiones.length}`;
      lista.innerHTML = misiones.map(tarjetaMision).join("");
      enlazarNavegacion(lista);
    } catch (e) {
      console.warn("Tu arranque no disponible:", e);
    }
  })();

  // ------------------------------------------------ Tickets en espera
  (async () => {
    const cont = $("#ini-tickets");
    let tickets = [];
    try {
      tickets = await invoke("ticket_espera_listar", { cajaSesionId: cajaSesion.id });
    } catch (e) {
      cont.innerHTML = "";
      return;
    }
    // Solo interesan los que tienen algo dentro.
    const conItems = tickets.filter((t) => {
      try { return (JSON.parse(t.contenido || "{}").lineas || []).length > 0; }
      catch (e) { return false; }
    });
    if (conItems.length === 0) {
      cont.innerHTML = '<div class="ini-vacio">Sin ventas a medias. Carrito limpio.</div>';
      return;
    }
    cont.innerHTML = conItems.map((t) => {
      let n = 0;
      try { n = (JSON.parse(t.contenido).lineas || []).length; } catch (e) {}
      const etiqueta = t.nombre ? escapar(t.nombre) : `Ticket ${t.numero}`;
      return `<button class="ini-ticket" data-ir="venta">
        <span class="ini-ticket-punto"></span>${etiqueta}
        <span class="ini-ticket-n">${n} art.</span>
      </button>`;
    }).join("");
    enlazarNavegacion(cont);
  })();

  function enlazarNavegacion(raiz) {
    raiz.querySelectorAll("[data-ir]").forEach((b) =>
      b.addEventListener("click", () => navegar(b.dataset.ir))
    );
  }
}