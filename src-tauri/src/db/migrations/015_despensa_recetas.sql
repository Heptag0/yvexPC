-- ============================================================================
-- YvexPOS — Migración 015: Despensa de ingredientes y costeo de recetas
-- ============================================================================
-- ⚠️ NÚMERO DE MIGRACIÓN A CONFIRMAR: se numeró como 015 asumiendo que 014
-- (etiquetas_exencion) es la última aplicada. Si ya existe una 015 en tu
-- carpeta de migraciones, renombra este archivo al siguiente número libre
-- antes de aplicarlo.
--
-- Dos conceptos nuevos, deliberadamente separados de `productos`:
--
--   despensa_ingredientes: cosas que COMPRAS a granel para fabricar tus
--     productos (harina, queso crema, cajas de pizza...). NUNCA aparecen en
--     el catálogo de venta ni en `productos` — viven solo aquí. Se compran
--     una vez y se reutilizan en muchas recetas.
--
--   recetas / receta_lineas: cuánto de cada ingrediente de la despensa lleva
--     TU producto terminado (el pastel, la pizza), para calcular su costo
--     real y sugerir un precio de venta. Cuando la receta está lista, SÍ
--     puede mandarse al catálogo — ahí nace un producto normal en
--     `productos`, igual que si lo hubieras dado de alta a mano.
--
-- Todas las cantidades (tamaño de paquete, cantidad usada) viven en unidad
-- BASE granular (g, ml o pieza) — nunca kg/L en la base de datos. La
-- conversión "compré 1 kg" -> 1000 g es responsabilidad del frontend al
-- capturar, para que Rust nunca tenga que adivinar una conversión de unidad.
--
-- Costo CONGELADO (mismo principio que costo_unitario_centavos en ventas):
-- cada línea de receta guarda el costo que tenía el ingrediente AL MOMENTO
-- de guardar la receta, no una referencia viva. Si el precio de la despensa
-- cambia después, la receta vieja no se mueve sola — hay que reabrirla y
-- guardarla de nuevo (o el frontend ofrece "actualizar al precio actual").
--
-- LOCAL-ONLY (v1), mismo criterio que perfiles_nutrimentales (migración 013):
-- es una herramienta de planeación de UNA caja, no inventario crítico que
-- deba verse igual en todos los dispositivos. Si en el futuro hace falta
-- verla desde varias cajas, se sincroniza en otra ronda.
-- ============================================================================

CREATE TABLE IF NOT EXISTS despensa_ingredientes (
    id                      TEXT PRIMARY KEY,
    nombre                  TEXT NOT NULL,
    unidad                  TEXT NOT NULL DEFAULT 'g' CHECK (unidad IN ('g', 'ml', 'pieza')),

    -- Paquete tal como lo compraste, en unidad BASE (g, ml o piezas).
    tamano_paquete          REAL NOT NULL DEFAULT 0,
    costo_paquete_centavos  INTEGER NOT NULL DEFAULT 0,

    -- Nutrición por 100 g/ml, o por 1 pieza si unidad = 'pieza'. Todo
    -- opcional (no siempre se conoce) — 0 por defecto, nunca bloquea guardar.
    calorias_kcal           REAL NOT NULL DEFAULT 0,
    azucares_g              REAL NOT NULL DEFAULT 0,
    grasas_saturadas_g      REAL NOT NULL DEFAULT 0,
    grasas_trans_g          REAL NOT NULL DEFAULT 0,
    sodio_mg                REAL NOT NULL DEFAULT 0,
    proteinas_g             REAL NOT NULL DEFAULT 0,
    carbohidratos_g         REAL NOT NULL DEFAULT 0,
    grasas_totales_g        REAL NOT NULL DEFAULT 0,
    fibra_g                 REAL NOT NULL DEFAULT 0,

    notas                   TEXT,
    eliminado               INTEGER NOT NULL DEFAULT 0,
    creado_en               TEXT NOT NULL,
    actualizado_en          TEXT NOT NULL,
    dispositivo_id          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recetas (
    id                      TEXT PRIMARY KEY,
    nombre                  TEXT NOT NULL,

    -- "Rinde 8 rebanadas", "rinde 1 pizza grande" — texto libre a propósito,
    -- cada negocio lo dice distinto.
    rendimiento_cantidad    REAL NOT NULL DEFAULT 1,
    rendimiento_unidad      TEXT NOT NULL DEFAULT 'porción',

    margen_deseado_pct      REAL NOT NULL DEFAULT 50,

    -- Si esta receta ya se mandó al catálogo, aquí queda el vínculo. NULL =
    -- todavía es solo una calculadora, no ha nacido un producto de venta.
    producto_id             TEXT REFERENCES productos(id),

    notas                   TEXT,
    eliminado               INTEGER NOT NULL DEFAULT 0,
    creado_en               TEXT NOT NULL,
    actualizado_en          TEXT NOT NULL,
    dispositivo_id          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receta_lineas (
    id                      TEXT PRIMARY KEY,
    receta_id               TEXT NOT NULL REFERENCES recetas(id),
    ingrediente_id          TEXT NOT NULL REFERENCES despensa_ingredientes(id),

    -- Copia del nombre al momento de agregar (histórico, igual que
    -- `descripcion` en venta_lineas) — si renombras el ingrediente en la
    -- despensa después, esta línea no cambia de nombre sola.
    nombre_congelado        TEXT NOT NULL,
    unidad                  TEXT NOT NULL,
    cantidad_usada          REAL NOT NULL,

    -- Costo CONGELADO de esta línea al momento de guardar la receta.
    costo_congelado_centavos INTEGER NOT NULL DEFAULT 0,

    orden                   INTEGER NOT NULL DEFAULT 0,
    creado_en               TEXT NOT NULL,
    actualizado_en          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_receta_lineas_receta ON receta_lineas(receta_id);
CREATE INDEX IF NOT EXISTS idx_receta_lineas_ingrediente ON receta_lineas(ingrediente_id);
CREATE INDEX IF NOT EXISTS idx_recetas_producto ON recetas(producto_id);
