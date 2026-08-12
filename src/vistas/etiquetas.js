// YvexPOS — Etiquetado frontal NOM-051 (México).
//
// Para negocios que FABRICAN su propio producto. Cuatro cosas en una:
//   1. Calcula qué sellos de advertencia le tocan a tu receta
//   2. Te dice el TAMAÑO exacto que debe tener cada sello en tu envase
//   3. Genera la hoja de etiqueta lista para llevar a imprenta
//   4. Te aclara qué trámites existen de verdad y cuáles no
//
// Todo el cálculo y el dibujo de los sellos vive en src/util/sellos.js, con
// las proporciones del Apéndice A (Normativo) de la norma.

import { invoke } from "@tauri-apps/api/core";
import { escapar } from "../util/formato.js";
import { confirmar } from "../util/confirmar.js";
import {
  calcularSellos, compararFases, faseVigente, reglasImpresion,
  sugerenciasParaQuitarSellos,
  svgSello, svgSelloNumero, svgLeyenda,
  EXENCIONES, CHECKLIST_ETIQUETA, REGLAS_EXTRA, TRAMITES,
  FECHA_VERIFICACION, FUENTE_OFICIAL,
} from "../util/sellos.js";
import { CATEGORIAS_RECETA, sustitucionesPara } from "../util/sustituciones.js";
import { abrirModal, cerrarModal } from "../util/modal.js";

const VACIO = {
  id: "", producto_id: null, nombre: "", tipo: "solido",
  calorias_kcal: 0, azucares_g: 0, grasas_saturadas_g: 0, grasas_trans_g: 0, sodio_mg: 0,
  proteinas_g: 0, carbohidratos_g: 0, grasas_totales_g: 0, fibra_g: 0,
  anade_azucares: false, anade_grasas: false, anade_sodio: false,
  contiene_cafeina: false, contiene_edulcorantes: false,
  exencion: "ninguna", area_cm2: 0,
  // NO se guarda en la base todavía (necesitaría una columna nueva en el
  // backend): se resetea a "otro" cada vez que se abre el editor. Solo se
  // usa en la sesión, para las sugerencias de sustitución del panel Mejorar.
  categoria_receta: "otro",
  denominacion: null, marca: null, ingredientes: null, alergenos: null,
  contenido_neto: null, porcion: null, porciones_envase: null,
  responsable_nombre: null, responsable_domicilio: null, lote: null,
  caducidad: null, conservacion: null, pais_origen: "Hecho en México", notas: null,
};

export function montarEtiquetas(contenedor, sesion, alSalir) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";

  const wrap = document.createElement("div");
  wrap.className = "etq";
  contenedor.appendChild(wrap);

  let perfiles = [];

  pintarEsqueleto();
  cargar();

  function pintarEsqueleto() {
    wrap.innerHTML = `
      <header class="inv-head">
        <div class="inv-head-izq">
          <button class="inv-volver" id="etq-volver" aria-label="Volver">←</button>
          <h1>Etiquetado NOM-051</h1>
        </div>
        <div class="inv-head-der">
          <button class="btn-sec" id="etq-reglas">Reglas de la norma</button>
          <button class="btn-sec" id="etq-tramites">¿Qué trámites necesito?</button>
          <button class="btn-primario" id="etq-nuevo">+ Nueva etiqueta</button>
        </div>
      </header>
      <div class="etq-vigencia">
        <span class="etq-vig-punto"></span>
        <span>Vigente: <b>Fase ${faseVigente()}</b> · la Fase 3 aplica desde el 1 de enero de 2028</span>
        <span class="etq-vig-sep">·</span>
        <span class="etq-vig-fecha">Verificado contra el texto oficial el ${FECHA_VERIFICACION}</span>
      </div>
      <div id="etq-cuerpo"><div class="ini-cargando">Cargando…</div></div>
    `;
    wrap.querySelector("#etq-volver").addEventListener("click", alSalir);
    wrap.querySelector("#etq-nuevo").addEventListener("click", () => abrirEditor(null));
    wrap.querySelector("#etq-tramites").addEventListener("click", abrirTramites);
    wrap.querySelector("#etq-reglas").addEventListener("click", abrirReglas);
  }

  async function cargar() {
    const cuerpo = wrap.querySelector("#etq-cuerpo");
    try {
      perfiles = await invoke("etq_listar");
    } catch (e) {
      cuerpo.innerHTML = `<div class="ini-vacio">No se pudo cargar: ${escapar(String(e))}</div>`;
      return;
    }
    if (perfiles.length === 0) {
      cuerpo.innerHTML = `
        <div class="etq-arranque">
          <h2>¿Tu producto necesita sellos de advertencia?</h2>
          <p>Si fabricas lo que vendes — postres, panadería, conservas, salsas — captura
             tu información nutrimental y te digo qué sellos te tocan, de qué tamaño deben
             ir en tu envase, y qué más debe llevar tu etiqueta.</p>
          <p class="etq-arranque-nota">Todo el cálculo se hace aquí, en tu computadora.
             Nada se envía a ningún lado.</p>
          <button class="btn-primario" id="etq-a-nuevo">Empezar con mi primer producto</button>
        </div>`;
      cuerpo.querySelector("#etq-a-nuevo").addEventListener("click", () => abrirEditor(null));
      return;
    }
    cuerpo.innerHTML = `<div class="etq-lista">${perfiles.map(fila).join("")}</div>`;
    cuerpo.querySelectorAll("[data-abrir]").forEach((b) =>
      b.addEventListener("click", () => {
        const p = perfiles.find((x) => x.id === b.dataset.abrir);
        if (p) abrirEditor(p);
      })
    );
  }

  function datosDe(p) {
    return {
      tipo: p.tipo,
      caloriasKcal: p.calorias_kcal, azucaresG: p.azucares_g,
      grasasSaturadasG: p.grasas_saturadas_g, grasasTransG: p.grasas_trans_g,
      sodioMg: p.sodio_mg,
      anadeAzucares: p.anade_azucares, anadeGrasas: p.anade_grasas, anadeSodio: p.anade_sodio,
      contieneCafeina: p.contiene_cafeina, contieneEdulcorantes: p.contiene_edulcorantes,
      exencion: p.exencion || "ninguna",
      areaCm2: p.area_cm2 || 0,
    };
  }

  function fila(p) {
    const r = calcularSellos(datosDe(p));
    const n = r.sellos.length;
    const meta = r.motivo === "exento" ? "producto exento"
      : r.motivo === "sin_anadidos" ? "sin nutrimentos añadidos"
      : n === 0 ? "sin sellos" : `${n} sello${n > 1 ? "s" : ""}`;
    return `
      <button class="etq-fila" data-abrir="${p.id}">
        <div class="etq-fila-cont ${n === 0 ? "etq-fila-cont--cero" : ""}">${n}</div>
        <div class="etq-fila-info">
          <span class="etq-fila-nombre">${escapar(p.nombre)}</span>
          <span class="etq-fila-meta">${p.tipo === "liquido" ? "Líquido" : "Sólido"} · ${meta}${
            r.leyendas.length ? ` · ${r.leyendas.length} leyenda${r.leyendas.length > 1 ? "s" : ""}` : ""
          }</span>
        </div>
        ${p.producto_id ? `<span class="etq-fila-tag">Vinculada a producto</span>` : ""}
        <div class="etq-fila-mini">${r.sellos.map(() => '<span class="etq-oct-mini"></span>').join("")}</div>
      </button>`;
  }

  // La undécima copia del mismo modal local del programa. Aquí la opción se
  // llamaba {ancho:true} → clase "modal--ancho"; util/modal.js usa {clase}
  // directo, así que las 3 llamadas de abajo se ajustaron al mismo tiempo.

  // ─────────────────────────────────────────────────────── Editor
  function abrirEditor(perfil) {
    const p = perfil ? { ...VACIO, ...perfil } : { ...VACIO };
    const esEdicion = !!perfil;
    let pestana = "calculo";

    const modal = abrirModal(`
      <div class="etq-ed-head">
        <h2>${esEdicion ? escapar(p.nombre) : "Nueva etiqueta"}</h2>
        <div class="etq-tabs">
          <button class="etq-tab etq-tab--on" data-tab="calculo">Sellos</button>
          <button class="etq-tab" data-tab="etiqueta">Datos de etiqueta</button>
          <button class="etq-tab" data-tab="checklist">Checklist</button>
        </div>
      </div>
      <div id="etq-notas-aviso"></div>
      <div id="etq-panel"></div>
      <p class="m-error" id="etq-error"></p>
      <div class="m-acciones">
        <div>${esEdicion ? '<button class="btn-mini btn-mini--peligro" id="etq-eliminar">Eliminar</button>' : "<span></span>"}</div>
        <div>
          <button class="btn-sec" id="etq-imprimir">Ver hoja para imprenta</button>
          <button class="btn-sec" id="etq-cancelar">Cerrar</button>
          <button class="btn-primario" id="etq-guardar">Guardar</button>
        </div>
      </div>
    `, { clase: "modal--ancho" });
    const $ = (s) => modal.querySelector(s);

    modal.querySelectorAll(".etq-tab").forEach((b) =>
      b.addEventListener("click", () => {
        recoger();
        pestana = b.dataset.tab;
        modal.querySelectorAll(".etq-tab").forEach((x) => x.classList.remove("etq-tab--on"));
        b.classList.add("etq-tab--on");
        pintarPanel();
      })
    );

    const num = (id) => { const e = $(id); return e ? (parseFloat((e.value || "0").replace(",", ".")) || 0) : 0; };
    const txt = (id) => { const e = $(id); return e ? (e.value.trim() || null) : null; };
    const chk = (id) => { const e = $(id); return e ? e.checked : false; };

    function recoger() {
      if (pestana === "calculo") {
        if ($("#e-nombre")) p.nombre = $("#e-nombre").value.trim();
        if ($("#e-tipo")) p.tipo = $("#e-tipo").value;
        if ($("#e-exencion")) p.exencion = $("#e-exencion").value;
        p.area_cm2 = num("#e-area");
        p.calorias_kcal = num("#e-cal");
        p.azucares_g = num("#e-azucar");
        p.grasas_saturadas_g = num("#e-grasasat");
        p.grasas_trans_g = num("#e-grasatrans");
        p.sodio_mg = num("#e-sodio");
        p.anade_azucares = chk("#e-anade-azucar");
        p.anade_grasas = chk("#e-anade-grasa");
        p.anade_sodio = chk("#e-anade-sodio");
        p.contiene_cafeina = chk("#e-cafeina");
        p.contiene_edulcorantes = chk("#e-edulcorantes");
        if ($("#e-categoria")) p.categoria_receta = $("#e-categoria").value;
      } else if (pestana === "etiqueta") {
        p.denominacion = txt("#e-denominacion");
        p.marca = txt("#e-marca");
        p.ingredientes = txt("#e-ingredientes");
        p.alergenos = txt("#e-alergenos");
        p.contenido_neto = txt("#e-contenido");
        p.porcion = txt("#e-porcion");
        p.porciones_envase = txt("#e-porciones");
        p.responsable_nombre = txt("#e-resp-nombre");
        p.responsable_domicilio = txt("#e-resp-dom");
        p.lote = txt("#e-lote");
        p.caducidad = txt("#e-caducidad");
        p.conservacion = txt("#e-conservacion");
        p.pais_origen = txt("#e-origen");
        p.proteinas_g = num("#e-proteinas");
        p.carbohidratos_g = num("#e-carbos");
        p.grasas_totales_g = num("#e-grasastot");
        p.fibra_g = num("#e-fibra");
      }
    }

    function pintarPanel() {
      const avisoNotas = $("#etq-notas-aviso");
      if (avisoNotas) {
        avisoNotas.innerHTML = p.notas ? `<div class="etq-aviso-notas">${escapar(p.notas)}</div>` : "";
      }
      const panel = $("#etq-panel");
      panel.innerHTML = pestana === "calculo" ? panelCalculo()
        : pestana === "etiqueta" ? panelEtiqueta()
        : pestana === "mejorar" ? panelMejorar()
        : panelChecklist();
      if (pestana === "calculo") {
        modal.querySelectorAll("#etq-panel input, #etq-panel select").forEach((el) =>
          el.addEventListener("input", () => { recoger(); pintarResultado(); })
        );
        modal.querySelectorAll("#etq-panel select").forEach((el) =>
          el.addEventListener("change", () => { recoger(); pintarPanel(); })
        );
        const btnElegir = $("#e-elegir-producto");
        if (btnElegir) btnElegir.addEventListener("click", abrirSelectorProducto);
        pintarResultado();
      }
      if (pestana === "mejorar") {
        const volver = $("#etq-mejorar-volver");
        if (volver) volver.addEventListener("click", () => {
          pestana = "calculo";
          modal.querySelectorAll(".etq-tab").forEach((x) => x.classList.toggle("etq-tab--on", x.dataset.tab === "calculo"));
          pintarPanel();
        });
      }
    }

    function panelCalculo() {
      const exento = p.exencion !== "ninguna";
      return `
        <div class="m-grid">
          <label class="m-col2">Nombre de la receta o producto
            <input id="e-nombre" value="${escapar(p.nombre || "")}" placeholder="Ej. Galletas de avena con miel" />
          </label>
          ${!esEdicion && !p.producto_id ? `
          <div class="m-col2 etq-elegir-prod">
            <button type="button" class="btn-mini" id="e-elegir-producto">Elegir producto existente</button>
            <span class="etq-elegir-prod-nota">Si ya tiene una receta en YvexPOS, se rellena la nutrición sola.</span>
          </div>` : ""}
          ${p.producto_id ? `<p class="etq-elegir-prod-nota m-col2">Vinculada al producto del catálogo — el nombre y la nutrición se pueden editar libremente aquí, es solo el punto de partida.</p>` : ""}
          <label>Tipo
            <select id="e-tipo">
              <option value="solido" ${p.tipo !== "liquido" ? "selected" : ""}>Sólido (por 100 g)</option>
              <option value="liquido" ${p.tipo === "liquido" ? "selected" : ""}>Líquido (por 100 ml)</option>
            </select>
          </label>
          <label class="m-col2">¿Tu producto es de alguno de estos tipos?
            <select id="e-exencion">
              ${EXENCIONES.map((x) => `<option value="${x.id}" ${p.exencion === x.id ? "selected" : ""}>${x.n}</option>`).join("")}
            </select>
          </label>
        </div>

        ${exento ? "" : `
          <p class="etq-lbl">¿Qué le agregaste durante la elaboración?</p>
          <p class="m-hint">Esto define qué sellos se evalúan. Un producto sin nada añadido
             —fruta seca sola, por ejemplo— no lleva sellos, aunque sea alto en azúcar natural.</p>
          <div class="etq-checks">
            <label><input type="checkbox" id="e-anade-azucar" ${p.anade_azucares ? "checked" : ""}/> Azúcar, miel o jarabe</label>
            <label><input type="checkbox" id="e-anade-grasa" ${p.anade_grasas ? "checked" : ""}/> Grasa, aceite o manteca</label>
            <label><input type="checkbox" id="e-anade-sodio" ${p.anade_sodio ? "checked" : ""}/> Sal o algo con sodio</label>
          </div>

          <p class="etq-lbl">Nutrimentos — por cada 100 ${p.tipo === "liquido" ? "ml" : "g"}</p>
          <div class="m-grid">
            <label>Calorías (kcal)<input id="e-cal" inputmode="decimal" value="${p.calorias_kcal || ""}" placeholder="0" /></label>
            <label title="Azúcares LIBRES: los añadidos más los de miel, jarabes y jugos">
              Azúcares libres (g)<input id="e-azucar" inputmode="decimal" value="${p.azucares_g || ""}" placeholder="0" /></label>
            <label>Grasas saturadas (g)<input id="e-grasasat" inputmode="decimal" value="${p.grasas_saturadas_g || ""}" placeholder="0" /></label>
            <label>Grasas trans (g)<input id="e-grasatrans" inputmode="decimal" value="${p.grasas_trans_g || ""}" placeholder="0" /></label>
            <label>Sodio (mg)<input id="e-sodio" inputmode="decimal" value="${p.sodio_mg || ""}" placeholder="0" /></label>
            <label title="La cara principal del empaque: la que ve el cliente en el anaquel">
              Área de la cara principal (cm²)<input id="e-area" inputmode="decimal" value="${p.area_cm2 || ""}" placeholder="Ej. 120" /></label>
          </div>
          <div class="etq-checks">
            <label><input type="checkbox" id="e-cafeina" ${p.contiene_cafeina ? "checked" : ""}/> Lleva cafeína añadida</label>
            <label><input type="checkbox" id="e-edulcorantes" ${p.contiene_edulcorantes ? "checked" : ""}/> Lleva edulcorantes</label>
          </div>

          <label class="m-col2">¿Qué tipo de receta es?
            <select id="e-categoria">
              ${CATEGORIAS_RECETA.map((c) => `<option value="${c.id}" ${(p.categoria_receta || "otro") === c.id ? "selected" : ""}>${c.n}</option>`).join("")}
            </select>
            <span class="m-hint">Para que, si algún sello queda, las sugerencias de "¿Cómo le quito un sello?" sepan si el ingrediente que tocarías conserva tu producto o solo le da sabor.</span>
          </label>
        `}

        <div id="etq-resultado" class="etq-resultado"></div>
      `;
    }

    function pintarResultado() {
      const cont = $("#etq-resultado");
      if (!cont) return;
      const d = datosDe(p);
      const r = calcularSellos(d);
      const reglas = reglasImpresion(p.area_cm2, r.sellos.length);

      if (r.motivo === "exento") {
        cont.innerHTML = `<div class="etq-ok">✓ Tu producto está exento
          <span class="etq-ok-nota">${escapar(r.explicacion)}</span></div>`;
        return;
      }

      const total = r.sellos.length + r.leyendas.length;
      if (total === 0) {
        const comp = compararFases(d);
        cont.innerHTML = `<div class="etq-ok">✓ Con estos datos, no lleva sellos ni leyendas
          ${r.explicacion ? `<span class="etq-ok-nota">${escapar(r.explicacion)}</span>` : ""}
          ${comp.nuevos.length > 0 ? `<span class="etq-ok-nota">Ojo: a partir de 2028 tendría ${comp.nuevos.length} sello${comp.nuevos.length > 1 ? "s" : ""}.</span>` : ""}
          <span class="etq-ok-nota">Puedes declararlo con la frase «Este producto no contiene sellos ni leyendas», solo por escrito y sin gráficos que imiten un sello (numeral 4.1.4 Bis).</span>
        </div>`;
        return;
      }

      const comp = compararFases(d);
      // Envases ≤40 cm²: va UN solo sello con el número, no los individuales.
      const usaNumero = reglas.usaNumero && r.sellos.length > 0;

      cont.innerHTML = `
        <div class="etq-res-titulo">
          ${r.sellos.length > 0 ? `Tu producto llevaría ${r.sellos.length} sello${r.sellos.length === 1 ? "" : "s"}` : "Tu producto llevaría estas leyendas"}
        </div>

        ${usaNumero ? `
          <div class="etq-numero-aviso">
            Tu envase mide ${reglas.area} cm². Como es de 40 cm² o menos, la norma pide
            <b>un solo sello con el número</b> en vez de los individuales (numeral 4.5.3.4.2).
          </div>
          <div class="etq-octagonos">
            <div class="etq-oct-caja etq-oct-caja--ancha">
              ${svgSelloNumero(r.sellos.length, 130)}
              <span class="etq-oct-razon">${r.sellos.map((s) => escapar(s.etiqueta.replace("EXCESO ", ""))).join(" · ")}</span>
            </div>
          </div>
          <details class="etq-detalle-sellos">
            <summary>Ver qué nutrimentos excede y por qué</summary>
            ${r.sellos.map((s) => `<div class="etq-razon-fila"><b>${escapar(s.etiqueta)}</b> — ${escapar(s.razon)}</div>`).join("")}
          </details>
        ` : `
          <div class="etq-octagonos">
            ${r.sellos.map((s) => `
              <div class="etq-oct-caja">
                ${svgSello(s.etiqueta)}
                <span class="etq-oct-razon">${escapar(s.razon)}</span>
              </div>`).join("")}
          </div>
        `}

        ${r.leyendas.length > 0 ? `
          <div class="etq-leyendas">
            ${r.leyendas.map((l) => `
              <div class="etq-leyenda-caja">
                ${svgLeyenda(l.etiqueta, 300)}
                <span class="etq-oct-razon">${escapar(l.razon)}</span>
              </div>`).join("")}
          </div>` : ""}

        ${r.sellos.length > 0 ? `
          <div style="margin-top:16px">
            <button class="btn-sec" id="etq-a-mejorar" type="button">¿Cómo le quito un sello?</button>
          </div>` : ""}

        <div class="etq-impresion">
          <div class="etq-imp-titulo">Cómo va en tu envase</div>
          ${reglas.conocida ? `
            <div class="etq-imp-fila"><span>Tamaño de cada sello</span>
              <b>${reglas.ancho ? `${reglas.ancho} × ${reglas.alto} cm` : reglas.nota}</b></div>
            <div class="etq-imp-fila"><span>Dónde va</span><b>${escapar(reglas.ubicacion)}</b></div>
            ${r.sellos.length > 1 && !usaNumero ? `
              <div class="etq-imp-fila"><span>Orden</span><b>De izquierda a derecha, como se ven arriba</b></div>` : ""}
            ${r.leyendas.length > 0 ? `
              <div class="etq-imp-fila"><span>Las leyendas</span>
                <b>${r.sellos.length > 0 ? "Debajo de los sellos" : "Arriba a la derecha"}${reglas.leyendaSinRecuadro ? ", pueden ir sin recuadro" : ""}</b></div>` : ""}
          ` : `<div class="etq-imp-nota">${escapar(reglas.nota)}</div>`}
        </div>

        ${comp.nuevos.length > 0 ? `
          <div class="etq-futuro">
            <b>A partir del 1 de enero de 2028</b> (Fase 3), este mismo producto llevaría
            ${comp.nuevos.length} sello${comp.nuevos.length > 1 ? "s" : ""} más sin cambiarle nada:
            ${comp.nuevos.map((s) => escapar(s.etiqueta)).join(", ")}.
          </div>` : ""}
      `;
      const btnMejorar = cont.querySelector("#etq-a-mejorar");
      if (btnMejorar) {
        btnMejorar.addEventListener("click", () => {
          pestana = "mejorar";
          modal.querySelectorAll(".etq-tab").forEach((x) => x.classList.remove("etq-tab--on"));
          pintarPanel();
        });
      }
    }

    // ------------------------------------- Elegir producto existente
    async function abrirSelectorProducto() {
      let productos;
      try {
        productos = await invoke("prod_listar", { filtro: null, soloStockBajo: false, soloNegativos: false });
      } catch (e) {
        alert("No se pudo cargar el catálogo: " + String(e));
        return;
      }
      const html = `
        <h2>Elegir producto</h2>
        <input type="text" id="sel-prod-buscar" class="campo" placeholder="Buscar producto…" autocomplete="off" />
        <div class="rct-selector-lista" id="sel-prod-lista">
          ${productos.map((pr) => `
            <button type="button" class="rct-selector-item" data-prod="${pr.id}" data-nombre="${escapar(pr.nombre)}">
              <span>${escapar(pr.nombre)}</span>
            </button>`).join("")}
        </div>
        <div class="m-acciones"><span></span><div>
          <button class="btn-sec" id="sel-prod-cerrar">Cerrar</button>
        </div></div>
      `;
      const selModal = abrirModal(html);
      selModal.querySelector("#sel-prod-cerrar").addEventListener("click", () => cerrarModal(selModal));
      const buscar = selModal.querySelector("#sel-prod-buscar");
      buscar.addEventListener("input", () => {
        const q = buscar.value.trim().toLowerCase();
        selModal.querySelectorAll("[data-prod]").forEach((el) => {
          el.style.display = el.dataset.nombre.toLowerCase().includes(q) ? "" : "none";
        });
      });
      setTimeout(() => buscar.focus(), 50);
      selModal.querySelectorAll("[data-prod]").forEach((b) =>
        b.addEventListener("click", async () => {
          const pr = productos.find((x) => x.id === b.dataset.prod);
          cerrarModal(selModal);
          if (pr) await elegirProducto(pr);
        })
      );
    }

    async function elegirProducto(pr) {
      // ¿Ya existe una etiqueta para este producto? No se duplica — se abre
      // la que ya hay, para no terminar con dos perfiles del mismo producto.
      const yaExiste = perfiles.find((x) => x.producto_id === pr.id);
      if (yaExiste) {
        cerrarModal(modal);
        abrirEditor(yaExiste);
        return;
      }

      p.producto_id = pr.id;
      p.nombre = pr.nombre;

      // ¿Tiene una receta vinculada en Recetas? Si sí, cargar su nutrición
      // (ya calculada por 100 g) — si no, se queda como estaba, sin datos.
      let recetas = [];
      try {
        recetas = await invoke("receta_listar");
      } catch (e) {
        recetas = [];
      }
      const resumen = recetas.find((r) => r.producto_id === pr.id);
      if (resumen) {
        let receta = null;
        try {
          receta = await invoke("receta_obtener", { id: resumen.id });
        } catch (e) {
          receta = null;
        }
        if (receta && receta.peso_aprox_g > 0) {
          const factor = 100 / receta.peso_aprox_g;
          const n = receta.nutricion_total;
          p.calorias_kcal = n.calorias_kcal * factor;
          p.azucares_g = n.azucares_g * factor;
          p.grasas_saturadas_g = n.grasas_saturadas_g * factor;
          p.grasas_trans_g = n.grasas_trans_g * factor;
          p.sodio_mg = n.sodio_mg * factor;
          p.proteinas_g = n.proteinas_g * factor;
          p.carbohidratos_g = n.carbohidratos_g * factor;
          p.grasas_totales_g = n.grasas_totales_g * factor;
          p.fibra_g = n.fibra_g * factor;
          p.notas = receta.ingredientes_sin_nutricion && receta.ingredientes_sin_nutricion.length
            ? `Nutrición cargada desde la receta "${receta.nombre}" (por 100 g). Ingredientes sin datos nutricionales: ${receta.ingredientes_sin_nutricion.join(", ")}.`
            : `Nutrición cargada desde la receta "${receta.nombre}" (por 100 g).`;
        }
      }

      pintarPanel();
    }

    function panelEtiqueta() {
      return `
        <p class="m-hint">Con esto se arma la hoja que puedes llevar a imprenta. Todo es
           opcional aquí — llena lo que tengas y complétalo después.</p>
        <div class="m-grid">
          <label>Denominación
            <input id="e-denominacion" value="${escapar(p.denominacion || "")}" placeholder="Lo que ES: «Galletas de avena»" /></label>
          <label>Marca
            <input id="e-marca" value="${escapar(p.marca || "")}" placeholder="Tu marca" /></label>
          <label class="m-col2">Ingredientes
            <input id="e-ingredientes" value="${escapar(p.ingredientes || "")}" placeholder="De mayor a menor cantidad, separados por coma" /></label>
          <label class="m-col2">Alérgenos
            <input id="e-alergenos" value="${escapar(p.alergenos || "")}" placeholder="Contiene: trigo, leche, nuez…" /></label>
          <label>Contenido neto
            <input id="e-contenido" value="${escapar(p.contenido_neto || "")}" placeholder="250 g" /></label>
          <label>Porción
            <input id="e-porcion" value="${escapar(p.porcion || "")}" placeholder="1 pieza (30 g)" /></label>
          <label>Porciones por envase
            <input id="e-porciones" value="${escapar(p.porciones_envase || "")}" placeholder="8" /></label>
          <label>Lote
            <input id="e-lote" value="${escapar(p.lote || "")}" placeholder="L-2026-001" /></label>
          <label>Caducidad
            <input id="e-caducidad" value="${escapar(p.caducidad || "")}" placeholder="Consumir antes de: 12/2026" /></label>
          <label>País de origen
            <input id="e-origen" value="${escapar(p.pais_origen || "Hecho en México")}" /></label>
          <label class="m-col2">Responsable (nombre o razón social)
            <input id="e-resp-nombre" value="${escapar(p.responsable_nombre || "")}" placeholder="Quien fabrica o comercializa" /></label>
          <label class="m-col2">Domicilio fiscal del responsable
            <input id="e-resp-dom" value="${escapar(p.responsable_domicilio || "")}" placeholder="Calle, número, código postal y entidad federativa" /></label>
          <label class="m-col2">Conservación
            <input id="e-conservacion" value="${escapar(p.conservacion || "")}" placeholder="Mantener en lugar fresco y seco" /></label>
        </div>

        <p class="etq-lbl">Resto de la tabla nutrimental — por cada 100 ${p.tipo === "liquido" ? "ml" : "g"}</p>
        <p class="m-hint">Estos no cambian los sellos, pero la tabla de tu etiqueta sí los exige.</p>
        <div class="m-grid">
          <label>Proteínas (g)<input id="e-proteinas" inputmode="decimal" value="${p.proteinas_g || ""}" placeholder="0" /></label>
          <label>Carbohidratos (g)<input id="e-carbos" inputmode="decimal" value="${p.carbohidratos_g || ""}" placeholder="0" /></label>
          <label>Grasas totales (g)<input id="e-grasastot" inputmode="decimal" value="${p.grasas_totales_g || ""}" placeholder="0" /></label>
          <label>Fibra (g)<input id="e-fibra" inputmode="decimal" value="${p.fibra_g || ""}" placeholder="0" /></label>
        </div>
      `;
    }

    function etiquetaNivel(nivel) {
      return nivel === "segura" ? "SEGURA" : nivel === "no_recomendada" ? "NO SE ACONSEJA" : "CON AVISO";
    }

    function panelMejorar() {
      const d = datosDe(p);
      const { sugerencias } = sugerenciasParaQuitarSellos(d);
      const categoria = p.categoria_receta || "otro";
      const fmtN = (n, dec = 1) => (Number(n) || 0).toFixed(dec).replace(/\.0$/, "");
      const NUTRIENTES = ["azucares", "grasas_sat", "grasas_trans", "sodio"];

      return `
        <button class="btn-mini etq-mejorar-volver" id="etq-mejorar-volver" type="button">← Volver a Sellos</button>
        <p class="m-hint">
          Estos son los números exactos para perder cada sello. Al bajar azúcar o grasa también
          bajan las calorías, así que a veces un solo ajuste quita dos sellos — ya está contado.
        </p>
        ${sugerencias.length === 0 ? `<p class="m-hint">No hay sellos que mejorar con estos datos.</p>` : sugerencias.map((s) => {
          const esNutriente = NUTRIENTES.includes(s.selloId);
          const opciones = esNutriente ? sustitucionesPara(s.selloId, categoria) : [];
          const pct = s.viable && s.actual > 0 ? Math.max(4, (s.objetivo / s.actual) * 100) : 0;
          return `
            <div class="etq-sug ${s.viable ? "" : "etq-sug--no-viable"}">
              <div class="etq-sug-sello">${escapar(s.etiqueta)}</div>
              <div class="etq-sug-accion ${s.viable ? "" : "etq-sug-accion--apagada"}">${escapar(s.accion)}</div>
              ${s.viable && s.actual > 0 ? `
                <div class="etq-sug-barra-fondo">
                  <div class="etq-sug-barra-objetivo" style="width:${pct}%"></div>
                </div>
                <div class="etq-sug-nums">
                  <span>Ahora: ${fmtN(s.actual)} ${s.unidad}</span>
                  <span class="etq-sug-meta">Meta: ${fmtN(s.objetivo)} ${s.unidad}</span>
                </div>` : ""}
              ${s.bonus ? `<div class="etq-sug-bonus">↳ ${escapar(s.bonus)}</div>` : ""}
              ${s.nota ? `<div class="etq-sug-nota">${escapar(s.nota)}</div>` : ""}
              ${opciones.map((op) => `
                <div class="etq-sust etq-sust--${op.nivel}">
                  <span class="etq-sust-badge etq-sust-badge--${op.nivel}">${etiquetaNivel(op.nivel)}</span>
                  <div class="etq-sust-titulo">${escapar(op.titulo)}</div>
                  <div class="etq-sust-txt">${escapar(op.explicacion)}</div>
                  ${op.como ? `<div class="etq-sust-como">${escapar(op.como)}</div>` : ""}
                </div>`).join("")}
              ${esNutriente && opciones.length === 0 && categoria === "otro" ? `
                <div class="etq-sust-falta">
                  Dinos qué tipo de receta es (pestaña Sellos, hasta abajo) para sugerencias más precisas.
                </div>` : ""}
            </div>`;
        }).join("")}
      `;
    }

    function panelChecklist() {
      const tiene = {
        denominacion: !!p.denominacion, ingredientes: !!p.ingredientes,
        alergenos: !!p.alergenos, contenido: !!p.contenido_neto,
        responsable: !!(p.responsable_nombre && p.responsable_domicilio),
        lote: !!p.lote, caducidad: !!p.caducidad, origen: !!p.pais_origen,
        nutrimental: p.calorias_kcal > 0, conservacion: !!p.conservacion,
      };
      const listos = Object.values(tiene).filter(Boolean).length;
      return `
        <p class="m-hint">Los sellos son una parte de la etiqueta, no toda. Esto es lo demás
           que exige la norma para un producto preenvasado.</p>
        <div class="etq-check-progreso">${listos} de ${CHECKLIST_ETIQUETA.length} completos</div>
        <div class="etq-check-lista">
          ${CHECKLIST_ETIQUETA.map((c) => `
            <div class="etq-check ${tiene[c.id] ? "etq-check--ok" : ""}">
              <span class="etq-check-marca">${tiene[c.id] ? "✓" : ""}</span>
              <div>
                <span class="etq-check-n">${escapar(c.n)} <span class="etq-check-ref">${escapar(c.ref)}</span></span>
                <span class="etq-check-ayuda">${escapar(c.ayuda)}</span>
              </div>
            </div>`).join("")}
        </div>
      `;
    }

    $("#etq-cancelar").addEventListener("click", cerrarModal);
    $("#etq-imprimir").addEventListener("click", () => { recoger(); imprimirHoja(p); });
    if (esEdicion) {
      $("#etq-eliminar").addEventListener("click", async () => {
        const ok = await confirmar("Esta etiqueta se va a borrar.", { titulo: "Eliminar", ok: "Eliminar", cancelar: "Cancelar" });
        if (!ok) return;
        try {
          await invoke("etq_eliminar", { id: p.id });
          cerrarModal();
          cargar();
        } catch (e) { $("#etq-error").textContent = String(e); }
      });
    }
    $("#etq-guardar").addEventListener("click", async () => {
      recoger();
      const err = $("#etq-error");
      err.textContent = "";
      if (!p.nombre || !p.nombre.trim()) {
        pestana = "calculo";
        modal.querySelectorAll(".etq-tab").forEach((x) => x.classList.toggle("etq-tab--on", x.dataset.tab === "calculo"));
        pintarPanel();
        err.textContent = "Ponle un nombre a esta receta o producto.";
        return;
      }
      try {
        await invoke("etq_guardar", { perfil: p });
        cerrarModal();
        cargar();
      } catch (e) {
        err.textContent = String(e);
      }
    });

    pintarPanel();
    setTimeout(() => { const n = $("#e-nombre"); if (n) n.focus(); }, 50);
  }

  // ─────────────────────────────────────────────── Hoja para imprenta
  function imprimirHoja(p) {
    const d = datosDe(p);
    const r = calcularSellos(d);
    const reglas = reglasImpresion(p.area_cm2, r.sellos.length);
    const usaNumero = reglas.usaNumero && r.sellos.length > 0;
    const nutri = (lbl, val, un) => `<tr><td>${lbl}</td><td class="num">${(val || 0).toFixed(1)} ${un}</td></tr>`;
    const campo = (lbl, valor) =>
      `<div class="campo"><b>${lbl}</b>${valor ? escapar(valor) : '<span class="falta">— falta capturar —</span>'}</div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta — ${escapar(p.nombre)}</title><style>
      @page { margin: 16mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
      h1 { font-size: 19px; margin: 0 0 2px; }
      .sub { font-size: 12px; color: #666; margin-bottom: 16px; }
      .bloque { margin-bottom: 20px; page-break-inside: avoid; }
      .bloque h2 { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.6px;
                   color: #666; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin: 0 0 10px; }
      .sellos { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
      .leyendas { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
      .specs { margin-top: 10px; font-size: 11px; color: #444; line-height: 1.7; }
      .specs b { color: #111; }
      table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
      td { padding: 3.5px 6px; border-bottom: 1px solid #eee; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .campo { font-size: 11.5px; margin-bottom: 7px; line-height: 1.5; }
      .campo b { display: block; font-size: 9.5px; text-transform: uppercase;
                 letter-spacing: 0.4px; color: #888; }
      .falta { color: #b00; font-style: italic; }
      .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .pie { margin-top: 22px; padding-top: 10px; border-top: 1px solid #ddd;
             font-size: 9px; color: #888; line-height: 1.6; }
    </style></head><body>
      <h1>${escapar(p.denominacion || p.nombre)}</h1>
      <div class="sub">${escapar(p.marca || "")}${p.contenido_neto ? " · " + escapar(p.contenido_neto) : ""}</div>

      <div class="bloque">
        <h2>Etiquetado frontal de advertencia</h2>
        ${r.motivo === "exento"
          ? `<p style="font-size:11.5px">${escapar(r.explicacion)}</p>`
          : r.sellos.length === 0 && r.leyendas.length === 0
          ? `<p style="font-size:11.5px">${r.explicacion ? escapar(r.explicacion) : "Con los valores capturados, no requiere sellos."}
             <br><br>Puede declararse por escrito: «Este producto no contiene sellos ni leyendas» (4.1.4 Bis).</p>`
          : `
            <div class="sellos">
              ${usaNumero ? svgSelloNumero(r.sellos.length, 96) : r.sellos.map((s) => svgSello(s.etiqueta, 88)).join("")}
            </div>
            ${r.leyendas.length > 0 ? `<div class="leyendas">${r.leyendas.map((l) => svgLeyenda(l.etiqueta, 300)).join("")}</div>` : ""}
            <div class="specs">
              ${reglas.conocida ? `
                <div><b>Tamaño de cada sello:</b> ${reglas.ancho ? `${reglas.ancho} cm de ancho × ${reglas.alto} cm de alto` : reglas.nota} — para una cara principal de ${reglas.area} cm² (Tabla A1 del Apéndice A).</div>
                <div><b>Ubicación:</b> ${escapar(reglas.ubicacion)}</div>
                ${usaNumero ? `<div><b>Sello agrupado:</b> por ser un envase de 40 cm² o menos, va un solo sello con el número (4.5.3.4.2). Nutrimentos que exceden: ${r.sellos.map((s) => escapar(s.etiqueta.replace("EXCESO ", "").toLowerCase())).join(", ")}.</div>` : ""}
                ${r.sellos.length > 1 && !usaNumero ? `<div><b>Orden:</b> de izquierda a derecha como aparecen aquí (4.5.3.4.6).</div>` : ""}
                ${r.leyendas.length > 0 ? `<div><b>Leyendas:</b> ${r.sellos.length > 0 ? "debajo de los sellos" : "en la parte superior derecha"}${reglas.leyendaSinRecuadro ? ", pueden ir sin recuadro por ser un envase de 20 cm² o menos" : ""} (4.5.3.4.7).</div>` : ""}
              ` : `<div>${escapar(reglas.nota)}</div>`}
              <div><b>Tipografía:</b> Arial Bold dentro del octágono; Arial en negritas para «SECRETARÍA DE SALUD» y las leyendas (Apéndice A, A.2.2).</div>
            </div>`}
      </div>

      <div class="dos">
        <div class="bloque">
          <h2>Declaración nutrimental — por 100 ${p.tipo === "liquido" ? "ml" : "g"}</h2>
          <table>
            <tr><td><b>Contenido energético</b></td><td class="num"><b>${(p.calorias_kcal || 0).toFixed(0)} kcal</b></td></tr>
            ${nutri("Proteínas", p.proteinas_g, "g")}
            ${nutri("Grasas totales", p.grasas_totales_g, "g")}
            ${nutri("&nbsp;&nbsp;Grasas saturadas", p.grasas_saturadas_g, "g")}
            ${nutri("&nbsp;&nbsp;Grasas trans", p.grasas_trans_g, "g")}
            ${nutri("Hidratos de carbono", p.carbohidratos_g, "g")}
            ${nutri("&nbsp;&nbsp;Azúcares", p.azucares_g, "g")}
            ${nutri("Fibra dietética", p.fibra_g, "g")}
            ${nutri("Sodio", p.sodio_mg, "mg")}
          </table>
          ${p.porcion ? `<div class="campo" style="margin-top:8px"><b>Porción</b>${escapar(p.porcion)}${p.porciones_envase ? ` · ${escapar(p.porciones_envase)} porciones por envase` : ""}</div>` : ""}
          <div class="specs">La letra de esta tabla debe medir al menos 1.5 mm de alto, y deben ir
            en negritas el contenido energético, las grasas saturadas, las grasas trans, los azúcares
            añadidos y el sodio (4.5.2.4.7 BIS).</div>
        </div>

        <div class="bloque">
          <h2>Datos de la etiqueta</h2>
          ${campo("Ingredientes", p.ingredientes)}
          ${campo("Alérgenos", p.alergenos)}
          ${campo("Contenido neto", p.contenido_neto)}
          ${campo("Lote", p.lote)}
          ${campo("Caducidad", p.caducidad)}
          ${campo("Conservación", p.conservacion)}
          ${campo("País de origen", p.pais_origen)}
          ${campo("Responsable", p.responsable_nombre)}
          ${campo("Domicilio fiscal", p.responsable_domicilio)}
        </div>
      </div>

      <div class="pie">
        Hoja generada con YvexPOS el ${new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
        · Criterios de la NOM-051-SCFI/SSA1-2010, Fase ${r.fase} (vigente hasta el 31 de diciembre de 2027).
        <br>Fuente: ${escapar(FUENTE_OFICIAL)} · Verificado el ${FECHA_VERIFICACION}.
        <br><b>Este documento es una guía de apoyo, no un certificado oficial.</b> Los valores nutrimentales
        son los que capturó el usuario; la norma pide que provengan de análisis o tablas reconocidas
        (4.5.2.4.15). Los sellos aquí mostrados siguen las proporciones del Apéndice A, pero antes de
        imprimir conviene verificar el arte contra el documento oficial vigente.
      </div>
    </body></html>`;

    const viejo = document.getElementById("etq-print-frame");
    if (viejo) viejo.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "etq-print-frame";
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* no-op */ }
      setTimeout(() => iframe.remove(), 1200);
    }, 350);
  }

  // ─────────────────────────────────────────────────────── Trámites
  function abrirTramites() {
    const modal = abrirModal(`
      <h2>¿Qué trámites necesito de verdad?</h2>
      <div class="etq-aclara">
        <b>No existe un trámite para que te «aprueben» el sello.</b>
        La norma lo dice textualmente: su evaluación de la conformidad
        «no es certificable y se puede llevar a cabo a través de un esquema voluntario»
        (numeral 9). Tú etiquetas bajo tu responsabilidad y la autoridad verifica después.
      </div>
      ${TRAMITES.map((t) => `
        <div class="etq-tramite">
          <div class="etq-tramite-n">${escapar(t.n)}</div>
          <div class="etq-tramite-meta"><b>Con quién:</b> ${escapar(t.quien)} · <b>Cuándo:</b> ${escapar(t.cuando)}</div>
          <div class="etq-tramite-det">${escapar(t.detalle)}</div>
        </div>`).join("")}
      <div class="etq-fuente">
        Verificado el ${FECHA_VERIFICACION} contra el texto íntegro de la norma.<br>
        Fuente: ${escapar(FUENTE_OFICIAL)}.<br>
        Las fechas de las fases se han recorrido dos veces — si lees esto después de 2027,
        confirma en el Diario Oficial de la Federación antes de decidir.
      </div>
      <div class="m-acciones"><span></span><button class="btn-primario" id="tr-cerrar">Entendido</button></div>
    `, { clase: "modal--ancho" });
    modal.querySelector("#tr-cerrar").addEventListener("click", cerrarModal);
  }

  // ─────────────────────────────────────────────────────── Reglas
  function abrirReglas() {
    const modal = abrirModal(`
      <h2>Reglas de la norma que conviene conocer</h2>
      <p class="m-hint">Más allá del cálculo, esto es lo que la NOM-051 exige sobre cómo se ven
         y dónde van los sellos — y qué NO puede llevar tu etiqueta si tienes alguno.</p>
      ${REGLAS_EXTRA.map((x) => `
        <div class="etq-tramite">
          <div class="etq-tramite-n">${escapar(x.n)} <span class="etq-check-ref">${escapar(x.ref)}</span></div>
          <div class="etq-tramite-det">${escapar(x.d)}</div>
        </div>`).join("")}
      <div class="etq-fuente">
        Tomado del texto íntegro de la NOM-051-SCFI/SSA1-2010 (DOF 27/03/2020),
        incluido su Apéndice A (Normativo).
      </div>
      <div class="m-acciones"><span></span><button class="btn-primario" id="rg-cerrar">Entendido</button></div>
    `, { clase: "modal--ancho" });
    modal.querySelector("#rg-cerrar").addEventListener("click", cerrarModal);
  }
}
