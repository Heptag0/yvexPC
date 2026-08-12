// YvexPOS — vista Recetas.
// Costeo de productos fabricados (pasteles, pizzas, hamburguesas...) a partir
// de una despensa de ingredientes reutilizable. Cada línea de receta congela
// su costo al guardar (mismo principio que costo_unitario_centavos en
// ventas) — el usuario puede refrescarlo al precio actual de la despensa o
// escribir uno manual si esta vez lo compró distinto.
//
// La despensa y el catálogo de productos son mundos separados a propósito:
// un ingrediente JAMÁS aparece en Inventario. Solo la receta terminada,
// mediante un botón explícito, puede crear un producto de venta normal.

import { invoke } from "@tauri-apps/api/core";
import { pesos, centavos, escapar } from "../util/formato.js";
import { icono } from "../util/iconos.js";
import { abrirModal, cerrarModal } from "../util/modal.js";
import { confirmar } from "../util/confirmar.js";

const UNIDADES = [
  { id: "g", nombre: "gramos" },
  { id: "ml", nombre: "mililitros" },
  { id: "pieza", nombre: "pieza" },
];

export function montarRecetas(contenedor, sesion, volver) {
  contenedor.innerHTML = "";
  contenedor.style.alignItems = "stretch";
  contenedor.style.justifyContent = "flex-start";

  const wrap = document.createElement("div");
  wrap.className = "rct";
  contenedor.appendChild(wrap);

  let vista = "lista"; // "lista" | "detalle" | "despensa"
  let recetaActualId = null;
  let despensaCache = [];

  // Estado del editor de receta (mientras se arma, antes de guardar).
  let editor = null; // { id, nombre, rendimiento_cantidad, rendimiento_unidad, margen_deseado_pct, notas, lineas: [] }

  cargarDespensa().then(render);

  async function cargarDespensa() {
    try {
      despensaCache = await invoke("desp_listar");
    } catch (e) {
      console.error("No se pudo cargar la despensa:", e);
      despensaCache = [];
    }
  }

  function render() {
    if (vista === "lista") renderLista();
    else if (vista === "detalle") renderDetalle();
    else if (vista === "despensa") renderDespensa();
  }

  // ==========================================================================
  // LISTA de recetas
  // ==========================================================================
  async function renderLista() {
    wrap.innerHTML = `
      <header class="rct-head">
        <button class="inv-volver" id="rct-ir-menu" aria-label="Volver al menú">←</button>
        <div>
          <h1 class="rct-titulo">Recetas</h1>
          <p class="rct-sub">Cuánto te cuesta de verdad cada producto que fabricas.</p>
        </div>
        <div class="rct-head-acciones">
          <button class="btn-sec" id="rct-ir-despensa">
            <span class="rct-btn-ico">${icono("despensa")}</span> Despensa
          </button>
          <button class="btn-primario" id="rct-nueva">+ Nueva receta</button>
        </div>
      </header>
      <div id="rct-lista"><div class="estado">Cargando…</div></div>
    `;
    wrap.querySelector("#rct-ir-menu").addEventListener("click", () => volver && volver());
    wrap.querySelector("#rct-ir-despensa").addEventListener("click", () => {
      vista = "despensa";
      render();
    });
    wrap.querySelector("#rct-nueva").addEventListener("click", () => {
      abrirEditor(null);
    });

    let recetas;
    try {
      recetas = await invoke("receta_listar");
    } catch (e) {
      wrap.querySelector("#rct-lista").innerHTML = `<div class="estado">No se pudo cargar: ${escapar(String(e))}</div>`;
      return;
    }
    const cont = wrap.querySelector("#rct-lista");
    if (!cont) return; // la vista pudo cambiar mientras esperábamos la respuesta
    if (recetas.length === 0) {
      cont.innerHTML = `
        <div class="rct-vacio">
          <p>Aún no tienes recetas.</p>
          <p class="rct-vacio-sub">Crea la primera para saber cuánto te cuesta cada producto y a cuánto conviene venderlo.</p>
        </div>`;
      return;
    }
    cont.innerHTML = `<div class="rct-grid">${recetas.map(tarjetaReceta).join("")}</div>`;
    cont.querySelectorAll("[data-abrir]").forEach((b) =>
      b.addEventListener("click", () => abrirEditor(b.dataset.abrir))
    );
  }

  function tarjetaReceta(r) {
    return `
      <button class="rct-card" data-abrir="${r.id}">
        <div class="rct-card-top">
          <span class="rct-card-nombre">${escapar(r.nombre)}</span>
          ${r.producto_id ? `<span class="rct-card-tag">En catálogo</span>` : ""}
        </div>
        <div class="rct-card-costo num">${pesos(r.costo_por_rendimiento_centavos)}</div>
        <div class="rct-card-sub">
          por ${escapar(fmtNum(r.rendimiento_cantidad))} ${escapar(r.rendimiento_unidad)}
          · ${r.num_ingredientes} ingrediente${r.num_ingredientes === 1 ? "" : "s"}
        </div>
      </button>`;
  }

  // ==========================================================================
  // DETALLE / editor de una receta
  // ==========================================================================
  async function abrirEditor(id) {
    if (id) {
      wrap.innerHTML = `<div class="estado">Cargando receta…</div>`;
      let r;
      try {
        r = await invoke("receta_obtener", { id });
      } catch (e) {
        wrap.innerHTML = `<div class="estado">No se pudo cargar: ${escapar(String(e))}</div>`;
        return;
      }
      if (!r) {
        vista = "lista";
        render();
        return;
      }
      editor = {
        id: r.id,
        nombre: r.nombre,
        rendimiento_cantidad: r.rendimiento_cantidad,
        rendimiento_unidad: r.rendimiento_unidad,
        margen_deseado_pct: r.margen_deseado_pct,
        notas: r.notas || "",
        producto_id: r.producto_id,
        lineas: r.lineas.map((l) => ({
          ingrediente_id: l.ingrediente_id,
          nombre: l.nombre_congelado,
          unidad: l.unidad,
          cantidad_usada: l.cantidad_usada,
          costo_manual_centavos: null, // se resetea; si no toca nada, se recalcula al guardar
          costo_mostrado_centavos: l.costo_congelado_centavos,
        })),
        // Datos ya calculados por el backend, para mostrar sin esperar a guardar de nuevo.
        _calculado: {
          costo_total_centavos: r.costo_total_centavos,
          costo_por_rendimiento_centavos: r.costo_por_rendimiento_centavos,
          precio_sugerido_centavos: r.precio_sugerido_centavos,
          nutricion_total: r.nutricion_total,
          peso_aprox_g: r.peso_aprox_g,
        },
      };
    } else {
      editor = {
        id: null,
        nombre: "",
        rendimiento_cantidad: 1,
        rendimiento_unidad: "porción",
        margen_deseado_pct: 50,
        notas: "",
        producto_id: null,
        lineas: [],
        _calculado: null,
      };
    }
    recetaActualId = id;
    vista = "detalle";
    render();
  }

  function renderDetalle() {
    const calc = calcularEditor();
    const yaGuardada = !!editor.id;

    wrap.innerHTML = `
      <header class="rct-head">
        <button class="inv-volver" id="rct-volver" aria-label="Volver">←</button>
        <div class="rct-head-campo">
          <input type="text" id="rct-nombre" class="rct-input-titulo" placeholder="Nombre de la receta"
                 value="${escapar(editor.nombre)}" />
        </div>
        <div class="rct-head-acciones">
          ${yaGuardada ? `<button class="btn-mini btn-mini--peligro" id="rct-eliminar">Eliminar</button>` : ""}
        </div>
      </header>

      <div class="rct-layout">
        <div class="rct-hero con-luz">
          <span class="rct-hero-lbl">Costo por ${escapar(editor.rendimiento_unidad || "porción")}</span>
          <span class="rct-hero-val num">${pesos(calc.costoPorRendimiento)}</span>
          <span class="rct-hero-pie">costo total de la receta: ${pesos(calc.costoTotal)}</span>
        </div>

        <div class="rct-rendimiento">
          <label>Rinde
            <input type="text" inputmode="decimal" id="rct-rend-cant" value="${fmtNum(editor.rendimiento_cantidad)}" />
          </label>
          <label>Unidad
            <input type="text" id="rct-rend-unidad" value="${escapar(editor.rendimiento_unidad)}" placeholder="porción, rebanada, pieza…" />
          </label>
          <label>Margen deseado
            <div class="rct-margen">
              <input type="range" id="rct-margen" min="0" max="90" step="5" value="${editor.margen_deseado_pct}" />
              <span class="rct-margen-val num" id="rct-margen-val">${editor.margen_deseado_pct}%</span>
            </div>
          </label>
        </div>

        <div class="rct-precio-sugerido">
          <span>Precio de venta sugerido</span>
          <span class="num rct-precio-sugerido-val">${pesos(calc.precioSugerido)}</span>
        </div>

        <section class="rct-ingredientes">
          <div class="rct-ingredientes-head">
            <h2>Ingredientes</h2>
            <button class="btn-sec" id="rct-agregar-ing">+ Agregar ingrediente</button>
          </div>
          <div id="rct-lineas">${editor.lineas.length ? editor.lineas.map(lineaHTML).join("") : `<div class="rct-lineas-vacio">Agrega ingredientes de tu despensa para calcular el costo.</div>`}</div>
        </section>

        ${editor._calculado ? panelNutricionHTML(editor._calculado) : ""}

        <label class="rct-notas-campo">Notas
          <textarea id="rct-notas" rows="2" placeholder="Preparación, variaciones, lo que sea útil recordar…">${escapar(editor.notas)}</textarea>
        </label>

        <div class="rct-acciones-finales">
          <span class="rct-error" id="rct-error"></span>
          <div>
            ${
              yaGuardada && editor.producto_id
                ? `<span class="rct-ya-vinculado">Ya tiene un producto de venta — edítalo desde Inventario.</span>`
                : yaGuardada
                ? `<button class="btn-sec" id="rct-crear-producto">Crear producto de venta</button>`
                : ""
            }
            <button class="btn-primario" id="rct-guardar">Guardar receta</button>
          </div>
        </div>
      </div>
    `;

    wrap.querySelector("#rct-volver").addEventListener("click", () => {
      vista = "lista";
      render();
    });
    wrap.querySelector("#rct-nombre").addEventListener("input", (e) => (editor.nombre = e.target.value));
    wrap.querySelector("#rct-rend-cant").addEventListener("input", (e) => {
      const v = parseFloat((e.target.value || "0").replace(",", "."));
      editor.rendimiento_cantidad = isNaN(v) ? 0 : v;
      actualizarHero();
    });
    wrap.querySelector("#rct-rend-unidad").addEventListener("input", (e) => {
      editor.rendimiento_unidad = e.target.value;
      wrap.querySelector(".rct-hero-lbl").textContent = `Costo por ${e.target.value || "porción"}`;
    });
    const margen = wrap.querySelector("#rct-margen");
    margen.addEventListener("input", () => {
      editor.margen_deseado_pct = Number(margen.value);
      wrap.querySelector("#rct-margen-val").textContent = editor.margen_deseado_pct + "%";
      actualizarHero();
    });
    wrap.querySelector("#rct-notas").addEventListener("input", (e) => (editor.notas = e.target.value));

    wrap.querySelector("#rct-agregar-ing").addEventListener("click", abrirSelectorIngrediente);
    conectarLineas();

    const btnEliminar = wrap.querySelector("#rct-eliminar");
    if (btnEliminar) {
      btnEliminar.addEventListener("click", async () => {
        const ok = await confirmar("Esta receta dejará de aparecer en tu lista.", {
          titulo: "Eliminar receta",
          ok: "Eliminar",
          peligro: true,
        });
        if (!ok) return;
        try {
          await invoke("receta_eliminar", { id: editor.id });
          vista = "lista";
          render();
        } catch (e) {
          wrap.querySelector("#rct-error").textContent = String(e);
        }
      });
    }

    const btnCrearProd = wrap.querySelector("#rct-crear-producto");
    if (btnCrearProd) btnCrearProd.addEventListener("click", abrirModalCrearProducto);

    wrap.querySelector("#rct-guardar").addEventListener("click", guardarReceta);
  }

  function lineaHTML(l, i) {
    return `
      <div class="rct-linea" data-i="${i}">
        <span class="rct-linea-nombre">${escapar(l.nombre)}</span>
        <div class="rct-linea-cant">
          <input type="text" inputmode="decimal" class="num" data-cant="${i}" value="${fmtNum(l.cantidad_usada)}" />
          <span class="rct-linea-unidad">${escapar(l.unidad)}</span>
        </div>
        <span class="rct-linea-costo num" data-costo="${i}">${pesos(l.costo_mostrado_centavos ?? 0)}</span>
        <button class="rct-linea-quitar" data-quitar="${i}" aria-label="Quitar">×</button>
      </div>`;
  }

  function conectarLineas() {
    const cont = wrap.querySelector("#rct-lineas");
    if (!cont) return;
    cont.querySelectorAll("[data-cant]").forEach((inp) =>
      inp.addEventListener("input", () => {
        const i = +inp.dataset.cant;
        const v = parseFloat((inp.value || "0").replace(",", "."));
        editor.lineas[i].cantidad_usada = isNaN(v) ? 0 : v;
        editor.lineas[i].costo_manual_centavos = null; // volver a calcular desde despensa
        recalcularLinea(i);
        actualizarHero();
      })
    );
    cont.querySelectorAll("[data-quitar]").forEach((b) =>
      b.addEventListener("click", () => {
        editor.lineas.splice(+b.dataset.quitar, 1);
        renderDetalle();
      })
    );
    cont.querySelectorAll(".rct-linea-costo").forEach((el, i) => {
      el.title = "Doble clic para escribir un costo manual (lo compraste en otro lado o en otra presentación)";
      el.addEventListener("dblclick", () => abrirCostoManual(i));
    });
  }

  function recalcularLinea(i) {
    const l = editor.lineas[i];
    const ing = despensaCache.find((x) => x.id === l.ingrediente_id);
    if (l.costo_manual_centavos != null) {
      l.costo_mostrado_centavos = l.costo_manual_centavos;
    } else if (ing) {
      l.costo_mostrado_centavos = Math.round(ing.costo_por_unidad_centavos * l.cantidad_usada);
    }
    const el = wrap.querySelector(`[data-costo="${i}"]`);
    if (el) el.textContent = pesos(l.costo_mostrado_centavos ?? 0);
  }

  function actualizarHero() {
    const calc = calcularEditor();
    const val = wrap.querySelector(".rct-hero-val");
    const pie = wrap.querySelector(".rct-hero-pie");
    const sug = wrap.querySelector(".rct-precio-sugerido-val");
    if (val) val.textContent = pesos(calc.costoPorRendimiento);
    if (pie) pie.textContent = `costo total de la receta: ${pesos(calc.costoTotal)}`;
    if (sug) sug.textContent = pesos(calc.precioSugerido);
  }

  // Cálculo LOCAL en vivo mientras se edita — es una vista previa; el número
  // que de verdad queda guardado (congelado) lo calcula Rust al guardar.
  function calcularEditor() {
    const costoTotal = editor.lineas.reduce((s, l) => s + (l.costo_mostrado_centavos || 0), 0);
    const rend = editor.rendimiento_cantidad > 0 ? editor.rendimiento_cantidad : 1;
    const costoPorRendimiento = Math.round(costoTotal / rend);
    const margen = editor.margen_deseado_pct;
    const precioSugerido =
      margen >= 100 || margen < 0 ? costoPorRendimiento : Math.round(costoPorRendimiento / (1 - margen / 100));
    return { costoTotal, costoPorRendimiento, precioSugerido };
  }

  function panelNutricionHTML(calc) {
    const n = calc.nutricion_total;
    const peso = calc.peso_aprox_g;
    return `
      <section class="rct-nutricion">
        <h2>Nutrición de toda la receta</h2>
        <p class="rct-nutricion-nota">
          ${
            peso > 0
              ? `Aproximado por ${Math.round(peso)} g de ingredientes pesables. Los ingredientes por pieza se suman pero no cuentan para este peso.`
              : "Agrega ingredientes con datos nutricionales para ver esto."
          }
        </p>
        <div class="rct-nutricion-grid">
          <div><span>Calorías</span><strong class="num">${redondeo1(n.calorias_kcal)} kcal</strong></div>
          <div><span>Azúcares</span><strong class="num">${redondeo1(n.azucares_g)} g</strong></div>
          <div><span>Grasas sat.</span><strong class="num">${redondeo1(n.grasas_saturadas_g)} g</strong></div>
          <div><span>Grasas trans</span><strong class="num">${redondeo1(n.grasas_trans_g)} g</strong></div>
          <div><span>Sodio</span><strong class="num">${redondeo1(n.sodio_mg)} mg</strong></div>
          <div><span>Proteínas</span><strong class="num">${redondeo1(n.proteinas_g)} g</strong></div>
        </div>
        <p class="rct-nutricion-tip">Usa estos totales como punto de partida en Etiquetado NOM — ahí puedes ajustarlos y calcular los sellos.</p>
      </section>`;
  }

  // -------------------------------------------------------- Selector de ingrediente
  function abrirSelectorIngrediente() {
    const yaUsados = new Set(editor.lineas.map((l) => l.ingrediente_id));
    const disponibles = despensaCache.filter((i) => !yaUsados.has(i.id));
    const html = `
      <h2>Agregar ingrediente</h2>
      ${
        disponibles.length === 0
          ? `<p class="m-sub">${despensaCache.length === 0 ? "Tu despensa está vacía todavía." : "Ya agregaste todos los ingredientes de tu despensa."}</p>
             <button class="btn-primario" id="sel-ir-despensa">Ir a la despensa</button>`
          : `
            <input type="text" id="sel-buscar" class="campo" placeholder="Buscar ingrediente…" autocomplete="off" />
            <div class="rct-selector-lista" id="sel-lista">
              ${disponibles.map((i) => filaSelector(i)).join("")}
            </div>`
      }
      <div class="m-acciones"><span></span><div>
        <button class="btn-sec" id="sel-cerrar">Cerrar</button>
      </div></div>
    `;
    const modal = abrirModal(html);
    const btnIr = modal.querySelector("#sel-ir-despensa");
    if (btnIr) btnIr.addEventListener("click", () => { cerrarModal(modal); vista = "despensa"; render(); });

    modal.querySelector("#sel-cerrar").addEventListener("click", () => cerrarModal(modal));
    const buscar = modal.querySelector("#sel-buscar");
    if (buscar) {
      buscar.addEventListener("input", () => {
        const q = buscar.value.trim().toLowerCase();
        modal.querySelectorAll("[data-elegir]").forEach((el) => {
          const nombre = el.dataset.nombre.toLowerCase();
          el.style.display = nombre.includes(q) ? "" : "none";
        });
      });
      setTimeout(() => buscar.focus(), 50);
    }
    modal.querySelectorAll("[data-elegir]").forEach((b) =>
      b.addEventListener("click", () => {
        const ing = despensaCache.find((i) => i.id === b.dataset.elegir);
        cerrarModal(modal);
        if (ing) abrirCantidadIngrediente(ing);
      })
    );
  }

  function filaSelector(i) {
    return `
      <button class="rct-selector-item" data-elegir="${i.id}" data-nombre="${escapar(i.nombre)}">
        <span>${escapar(i.nombre)}</span>
        <span class="num rct-selector-costo">${pesos(Math.round(i.costo_por_unidad_centavos * (i.unidad === "pieza" ? 1 : 100)))} / ${i.unidad === "pieza" ? "pieza" : i.unidad === "g" ? "100 g" : "100 ml"}</span>
      </button>`;
  }

  function abrirCantidadIngrediente(ing) {
    const html = `
      <h2>${escapar(ing.nombre)}</h2>
      <p class="m-sub">Costo: ${pesos(ing.costo_paquete_centavos)} por ${fmtNum(ing.tamano_paquete)} ${ing.unidad}</p>
      <label>Cantidad que usa esta receta (en ${ing.unidad})
        <input type="text" inputmode="decimal" id="cant-valor" placeholder="0" />
      </label>
      <p class="m-preview" id="cant-preview"></p>
      <p class="m-error" id="cant-error"></p>
      <div class="m-acciones"><span></span><div>
        <button class="btn-sec" id="cant-cancelar">Cancelar</button>
        <button class="btn-primario" id="cant-ok">Agregar</button>
      </div></div>
    `;
    const modal = abrirModal(html);
    const input = modal.querySelector("#cant-valor");
    const preview = modal.querySelector("#cant-preview");
    setTimeout(() => input.focus(), 50);
    input.addEventListener("input", () => {
      const v = parseFloat((input.value || "0").replace(",", "."));
      if (!isNaN(v) && v > 0) {
        preview.textContent = `Costo estimado: ${pesos(Math.round(ing.costo_por_unidad_centavos * v))}`;
      } else {
        preview.textContent = "";
      }
    });
    modal.querySelector("#cant-cancelar").addEventListener("click", () => cerrarModal(modal));
    modal.querySelector("#cant-ok").addEventListener("click", () => {
      const v = parseFloat((input.value || "0").replace(",", "."));
      if (isNaN(v) || v <= 0) {
        modal.querySelector("#cant-error").textContent = "Escribe una cantidad válida.";
        return;
      }
      editor.lineas.push({
        ingrediente_id: ing.id,
        nombre: ing.nombre,
        unidad: ing.unidad,
        cantidad_usada: v,
        costo_manual_centavos: null,
        costo_mostrado_centavos: Math.round(ing.costo_por_unidad_centavos * v),
      });
      cerrarModal(modal);
      renderDetalle();
    });
  }

  function abrirCostoManual(i) {
    const l = editor.lineas[i];
    const html = `
      <h2>Costo manual de ${escapar(l.nombre)}</h2>
      <p class="m-sub">Úsalo si esta vez lo compraste en otro lado o en otra presentación.</p>
      <label>Costo de esta línea
        <input type="text" inputmode="decimal" id="cm-valor" value="${l.costo_manual_centavos != null ? centavos(l.costo_manual_centavos) : ""}" placeholder="0.00" />
      </label>
      <div class="m-acciones">
        <button class="btn-mini" id="cm-quitar">Volver a calcular de la despensa</button>
        <div>
          <button class="btn-sec" id="cm-cancelar">Cancelar</button>
          <button class="btn-primario" id="cm-ok">Guardar</button>
        </div>
      </div>
    `;
    const modal = abrirModal(html, { clase: "modal--chico" });
    modal.querySelector("#cm-cancelar").addEventListener("click", () => cerrarModal(modal));
    modal.querySelector("#cm-quitar").addEventListener("click", () => {
      l.costo_manual_centavos = null;
      cerrarModal(modal);
      recalcularLinea(i);
      actualizarHero();
    });
    modal.querySelector("#cm-ok").addEventListener("click", () => {
      const v = parseFloat((modal.querySelector("#cm-valor").value || "0").replace(",", "."));
      l.costo_manual_centavos = isNaN(v) ? 0 : Math.round(v * 100);
      cerrarModal(modal);
      recalcularLinea(i);
      actualizarHero();
    });
  }

  // ---------------------------------------------------------------- Guardar
  async function guardarReceta() {
    const err = wrap.querySelector("#rct-error");
    err.textContent = "";
    if (!editor.nombre.trim()) {
      err.textContent = "Ponle un nombre a la receta.";
      return;
    }
    if (editor.lineas.length === 0) {
      err.textContent = "Agrega al menos un ingrediente.";
      return;
    }
    const payload = {
      id: editor.id || "",
      nombre: editor.nombre.trim(),
      rendimiento_cantidad: editor.rendimiento_cantidad,
      rendimiento_unidad: (editor.rendimiento_unidad || "porción").trim(),
      margen_deseado_pct: editor.margen_deseado_pct,
      notas: editor.notas.trim() || null,
      lineas: editor.lineas.map((l) => ({
        ingrediente_id: l.ingrediente_id,
        cantidad_usada: l.cantidad_usada,
        costo_manual_centavos: l.costo_manual_centavos,
      })),
    };
    const btn = wrap.querySelector("#rct-guardar");
    btn.disabled = true;
    btn.textContent = "Guardando…";
    try {
      const id = await invoke("receta_guardar", { datos: payload });
      await abrirEditor(id); // recarga con los números ya congelados por Rust
    } catch (e) {
      err.textContent = String(e);
      btn.disabled = false;
      btn.textContent = "Guardar receta";
    }
  }

  function abrirModalCrearProducto() {
    const calc = editor._calculado;
    const html = `
      <h2>Crear producto de venta</h2>
      <p class="m-sub">Se creará en tu catálogo con el costo ya cargado. Podrás editarlo después desde Inventario (categoría, código de barras, foto…).</p>
      <label>Precio de venta
        <input type="text" inputmode="decimal" id="cp-precio" value="${centavos(calc.precio_sugerido_centavos)}" />
      </label>
      <p class="m-sub">Costo: ${pesos(calc.costo_por_rendimiento_centavos)} por ${escapar(editor.rendimiento_unidad)}</p>
      <p class="m-error" id="cp-error"></p>
      <div class="m-acciones"><span></span><div>
        <button class="btn-sec" id="cp-cancelar">Cancelar</button>
        <button class="btn-primario" id="cp-ok">Crear producto</button>
      </div></div>
    `;
    const modal = abrirModal(html);
    modal.querySelector("#cp-cancelar").addEventListener("click", () => cerrarModal(modal));
    modal.querySelector("#cp-ok").addEventListener("click", async () => {
      const v = parseFloat((modal.querySelector("#cp-precio").value || "0").replace(",", "."));
      if (isNaN(v) || v <= 0) {
        modal.querySelector("#cp-error").textContent = "Escribe un precio válido.";
        return;
      }
      const btn = modal.querySelector("#cp-ok");
      btn.disabled = true;
      btn.textContent = "Creando…";
      try {
        await invoke("receta_crear_producto", {
          recetaId: editor.id,
          precioVentaCentavos: Math.round(v * 100),
          categoriaId: null,
        });
        cerrarModal(modal);
        await abrirEditor(editor.id);
      } catch (e) {
        modal.querySelector("#cp-error").textContent = String(e);
        btn.disabled = false;
        btn.textContent = "Crear producto";
      }
    });
  }

  // ==========================================================================
  // DESPENSA
  // ==========================================================================
  async function renderDespensa() {
    wrap.innerHTML = `
      <header class="rct-head">
        <button class="inv-volver" id="desp-volver" aria-label="Volver">←</button>
        <div>
          <h1 class="rct-titulo">Despensa</h1>
          <p class="rct-sub">Ingredientes que compras para fabricar tus productos. No aparecen en Inventario.</p>
        </div>
        <div class="rct-head-acciones">
          <button class="btn-primario" id="desp-nuevo">+ Nuevo ingrediente</button>
        </div>
      </header>
      <div id="desp-lista"><div class="estado">Cargando…</div></div>
    `;
    wrap.querySelector("#desp-volver").addEventListener("click", () => {
      vista = "lista";
      render();
    });
    wrap.querySelector("#desp-nuevo").addEventListener("click", () => abrirModalIngrediente(null));

    await cargarDespensa();
    const cont = wrap.querySelector("#desp-lista");
    if (!cont) return;
    if (despensaCache.length === 0) {
      cont.innerHTML = `
        <div class="rct-vacio">
          <p>Tu despensa está vacía.</p>
          <p class="rct-vacio-sub">Agrega lo que compras a granel — harina, queso crema, cajas de pizza — con su costo y presentación.</p>
        </div>`;
      return;
    }
    cont.innerHTML = `<div class="desp-tabla">${despensaCache.map(filaDespensa).join("")}</div>`;
    cont.querySelectorAll("[data-editar]").forEach((b) =>
      b.addEventListener("click", () => {
        const ing = despensaCache.find((i) => i.id === b.dataset.editar);
        if (ing) abrirModalIngrediente(ing);
      })
    );
    cont.querySelectorAll("[data-eliminar]").forEach((b) =>
      b.addEventListener("click", async () => {
        const ing = despensaCache.find((i) => i.id === b.dataset.eliminar);
        const ok = await confirmar(`Las recetas que ya usan "${escapar(ing?.nombre || "")}" conservan su costo, pero ya no podrás elegirlo en recetas nuevas.`, {
          titulo: "Eliminar ingrediente",
          ok: "Eliminar",
          peligro: true,
        });
        if (!ok) return;
        try {
          await invoke("desp_eliminar", { id: b.dataset.eliminar });
          renderDespensa();
        } catch (e) {
          alert(String(e));
        }
      })
    );
  }

  function filaDespensa(i) {
    const costoMostrado =
      i.unidad === "pieza"
        ? `${pesos(Math.round(i.costo_por_unidad_centavos))} / pieza`
        : `${pesos(Math.round(i.costo_por_unidad_centavos * 100))} / 100 ${i.unidad}`;
    return `
      <div class="desp-fila">
        <div class="desp-fila-nombre">${escapar(i.nombre)}</div>
        <div class="desp-fila-paquete">${pesos(i.costo_paquete_centavos)} por ${fmtNum(i.tamano_paquete)} ${i.unidad}</div>
        <div class="desp-fila-costo num">${costoMostrado}</div>
        <div class="desp-fila-acciones">
          <button class="btn-mini" data-editar="${i.id}">Editar</button>
          <button class="btn-mini btn-mini--peligro" data-eliminar="${i.id}">Eliminar</button>
        </div>
      </div>`;
  }

  function abrirModalIngrediente(ing) {
    const esEdicion = !!ing;
    const html = `
      <h2>${esEdicion ? "Editar ingrediente" : "Nuevo ingrediente"}</h2>
      <label class="ing-nombre-campo">Nombre
        <input type="text" id="ing-nombre" value="${esEdicion ? escapar(ing.nombre) : ""}" placeholder="Queso crema" autocomplete="off" />
        <div class="ing-sugerencias" id="ing-sugerencias" hidden></div>
      </label>
      <div class="m-grid">
        <label>Costo del paquete
          <input type="text" inputmode="decimal" id="ing-costo" value="${esEdicion ? centavos(ing.costo_paquete_centavos) : ""}" placeholder="0.00" />
        </label>
        <label>Tamaño del paquete
          <input type="text" inputmode="decimal" id="ing-tamano" value="${esEdicion ? fmtNum(ing.tamano_paquete) : ""}" placeholder="1000" />
        </label>
        <label>Unidad
          <select id="ing-unidad">
            ${UNIDADES.map((u) => `<option value="${u.id}" ${esEdicion && ing.unidad === u.id ? "selected" : ""}>${u.nombre}</option>`).join("")}
          </select>
        </label>
      </div>
      <p class="m-sub">Ejemplo: pagaste $45 por una bolsa de 1000 g → escribe 1000 en tamaño (siempre en gramos, mililitros o piezas, nunca en kg/L).</p>

      <details class="ing-nutricion-det">
        <summary>Nutrición (opcional) — por 100 g/ml, o por 1 pieza</summary>
        <div class="ing-buscar-off-fila">
          <button type="button" class="btn-mini" id="ing-buscar-off">Intentar buscar información</button>
          <span class="m-preview" id="ing-buscar-estado"></span>
        </div>
        <div class="m-grid">
          <label>Calorías (kcal)<input type="text" inputmode="decimal" id="ing-cal" value="${esEdicion ? fmtNum(ing.calorias_kcal) : ""}" /></label>
          <label>Azúcares (g)<input type="text" inputmode="decimal" id="ing-azu" value="${esEdicion ? fmtNum(ing.azucares_g) : ""}" /></label>
          <label>Grasas saturadas (g)<input type="text" inputmode="decimal" id="ing-gsat" value="${esEdicion ? fmtNum(ing.grasas_saturadas_g) : ""}" /></label>
          <label>Grasas trans (g)<input type="text" inputmode="decimal" id="ing-gtrans" value="${esEdicion ? fmtNum(ing.grasas_trans_g) : ""}" /></label>
          <label>Sodio (mg)<input type="text" inputmode="decimal" id="ing-sodio" value="${esEdicion ? fmtNum(ing.sodio_mg) : ""}" /></label>
          <label>Proteínas (g)<input type="text" inputmode="decimal" id="ing-prot" value="${esEdicion ? fmtNum(ing.proteinas_g) : ""}" /></label>
          <label>Carbohidratos (g)<input type="text" inputmode="decimal" id="ing-carb" value="${esEdicion ? fmtNum(ing.carbohidratos_g) : ""}" /></label>
          <label>Grasas totales (g)<input type="text" inputmode="decimal" id="ing-gtot" value="${esEdicion ? fmtNum(ing.grasas_totales_g) : ""}" /></label>
          <label>Fibra (g)<input type="text" inputmode="decimal" id="ing-fibra" value="${esEdicion ? fmtNum(ing.fibra_g) : ""}" /></label>
        </div>
      </details>

      <label>Notas
        <input type="text" id="ing-notas" value="${esEdicion ? escapar(ing.notas || "") : ""}" placeholder="Comprado en Costco, presentación de 5 kg…" />
      </label>
      <p class="m-error" id="ing-error"></p>
      <div class="m-acciones"><span></span><div>
        <button class="btn-sec" id="ing-cancelar">Cancelar</button>
        <button class="btn-primario" id="ing-ok">${esEdicion ? "Guardar" : "Agregar"}</button>
      </div></div>
    `;
    const modal = abrirModal(html, { clase: "modal--ancho" });
    const $ = (s) => modal.querySelector(s);
    setTimeout(() => $("#ing-nombre").focus(), 50);
    $("#ing-cancelar").addEventListener("click", () => cerrarModal(modal));

    // --- Búsqueda de nutrición en Open Food Facts (sugerencias + botón) ---
    function rellenarNutricion(c) {
      $("#ing-cal").value = fmtNum(c.calorias_kcal);
      $("#ing-azu").value = fmtNum(c.azucares_g);
      $("#ing-gsat").value = fmtNum(c.grasas_saturadas_g);
      $("#ing-gtrans").value = fmtNum(c.grasas_trans_g);
      $("#ing-sodio").value = fmtNum(c.sodio_mg);
      $("#ing-prot").value = fmtNum(c.proteinas_g);
      $("#ing-carb").value = fmtNum(c.carbohidratos_g);
      $("#ing-gtot").value = fmtNum(c.grasas_totales_g);
      $("#ing-fibra").value = fmtNum(c.fibra_g);
      const det = $(".ing-nutricion-det");
      if (det) det.open = true; // que se vea lo que se acaba de rellenar
      const estado = $("#ing-buscar-estado");
      if (estado) {
        estado.textContent = `Rellenado desde Open Food Facts (${escapar(c.marca || c.nombre)}). Revisa los valores.`;
        estado.className = "m-preview";
      }
    }

    function pintarSugerencias(candidatos) {
      const cont = $("#ing-sugerencias");
      if (!cont) return;
      if (!candidatos.length) {
        cont.innerHTML = "";
        cont.hidden = true;
        return;
      }
      cont.hidden = false;
      cont.innerHTML = candidatos
        .map(
          (c, i) => `
        <button type="button" class="ing-sug-item" data-i="${i}">
          <span>${escapar(c.nombre)}</span>
          ${c.marca ? `<span class="ing-sug-marca">${escapar(c.marca)}</span>` : ""}
        </button>`
        )
        .join("");
      cont.querySelectorAll("[data-i]").forEach((b) =>
        b.addEventListener("click", () => {
          rellenarNutricion(candidatos[+b.dataset.i]);
          cont.innerHTML = "";
          cont.hidden = true;
        })
      );
    }

    let busquedaTimer = null;
    $("#ing-nombre").addEventListener("input", (e) => {
      clearTimeout(busquedaTimer);
      const q = e.target.value.trim();
      if (q.length < 3) {
        pintarSugerencias([]);
        return;
      }
      busquedaTimer = setTimeout(async () => {
        let candidatos = [];
        try {
          candidatos = await invoke("desp_buscar_nutricion", { nombre: q });
        } catch (err) {
          candidatos = [];
        }
        pintarSugerencias(candidatos);
      }, 400);
    });
    // Cerrar sugerencias al hacer clic fuera del campo.
    modal.addEventListener("click", (e) => {
      if (!e.target.closest(".ing-nombre-campo")) pintarSugerencias([]);
    });

    $("#ing-buscar-off").addEventListener("click", async () => {
      const q = $("#ing-nombre").value.trim();
      const estado = $("#ing-buscar-estado");
      if (q.length < 3) {
        estado.textContent = "Escribe al menos 3 letras del nombre.";
        estado.className = "m-preview m-preview--mal";
        return;
      }
      const btn = $("#ing-buscar-off");
      btn.disabled = true;
      estado.className = "m-preview";
      estado.textContent = "Buscando…";
      let candidatos = [];
      try {
        candidatos = await invoke("desp_buscar_nutricion", { nombre: q });
      } catch (err) {
        candidatos = [];
      }
      btn.disabled = false;
      if (candidatos.length === 0) {
        estado.textContent = "No se encontró información para este ingrediente. Puedes llenarla a mano.";
        estado.className = "m-preview m-preview--mal";
        return;
      }
      rellenarNutricion(candidatos[0]);
    });

    $("#ing-ok").addEventListener("click", async () => {
      const err = $("#ing-error");
      err.textContent = "";
      const nombre = $("#ing-nombre").value.trim();
      if (!nombre) return (err.textContent = "Ponle un nombre.");
      const num = (id) => {
        const v = parseFloat(($(id).value || "0").replace(",", "."));
        return isNaN(v) ? 0 : v;
      };
      const costoCent = Math.round(num("#ing-costo") * 100);
      const tamano = num("#ing-tamano");
      if (tamano <= 0) return (err.textContent = "El tamaño del paquete debe ser mayor a cero.");

      const datos = {
        nombre,
        unidad: $("#ing-unidad").value,
        tamano_paquete: tamano,
        costo_paquete_centavos: costoCent,
        calorias_kcal: num("#ing-cal"),
        azucares_g: num("#ing-azu"),
        grasas_saturadas_g: num("#ing-gsat"),
        grasas_trans_g: num("#ing-gtrans"),
        sodio_mg: num("#ing-sodio"),
        proteinas_g: num("#ing-prot"),
        carbohidratos_g: num("#ing-carb"),
        grasas_totales_g: num("#ing-gtot"),
        fibra_g: num("#ing-fibra"),
        notas: $("#ing-notas").value.trim() || null,
      };

      const btn = $("#ing-ok");
      btn.disabled = true;
      try {
        if (esEdicion) {
          await invoke("desp_editar", { datos: { id: ing.id, ...datos } });
        } else {
          await invoke("desp_crear", { datos });
        }
        cerrarModal(modal);
        renderDespensa();
      } catch (e) {
        err.textContent = String(e);
        btn.disabled = false;
      }
    });
  }

  // -------------------------------------------------------------------- utils
  function fmtNum(n) {
    const v = Number(n);
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(2).replace(/\.?0+$/, "");
  }
  function redondeo1(n) {
    return (Math.round((n || 0) * 10) / 10).toString();
  }
}
