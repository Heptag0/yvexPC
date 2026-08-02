-- ============================================================================
-- YvexPOS — Migración 013: Etiquetado NOM-051 (México)
-- ============================================================================
-- Para negocios que FABRICAN su propio producto (postres caseros, panadería,
-- conservas, salsas) y necesitan saber qué sellos les tocan y qué debe llevar
-- su etiqueta antes de mandarla a imprimir.
--
-- Guarda TODO lo que necesita una etiqueta completa, no solo lo del cálculo:
-- ingredientes, alérgenos, contenido neto, lote, caducidad, responsable. Con
-- eso se genera la hoja imprimible lista para llevar a imprenta.
--
-- ⚠️ Los VALORES se guardan; el CÁLCULO de qué sellos aplican vive en el
-- frontend (src/util/sellos.js). Si mañana cambia la norma —y ya cambió de
-- fecha tres veces— se actualiza en un solo lugar y todos los perfiles
-- guardados se recalculan solos al abrirse. Nunca se guarda un resultado
-- como si fuera verdad permanente.
--
-- LOCAL-ONLY (v1).
-- ============================================================================

CREATE TABLE IF NOT EXISTS perfiles_nutrimentales (
    id                  TEXT PRIMARY KEY,
    producto_id         TEXT REFERENCES productos(id),
    nombre              TEXT NOT NULL,
    tipo                TEXT NOT NULL DEFAULT 'solido' CHECK (tipo IN ('solido', 'liquido')),

    -- ── Nutrimentos, por cada 100 g (sólido) o 100 ml (líquido) ──
    calorias_kcal            REAL NOT NULL DEFAULT 0,
    azucares_g               REAL NOT NULL DEFAULT 0,
    grasas_saturadas_g       REAL NOT NULL DEFAULT 0,
    grasas_trans_g           REAL NOT NULL DEFAULT 0,
    sodio_mg                 REAL NOT NULL DEFAULT 0,
    -- Estos NO entran al cálculo de sellos, pero la tabla nutrimental de la
    -- etiqueta sí los exige.
    proteinas_g              REAL NOT NULL DEFAULT 0,
    carbohidratos_g          REAL NOT NULL DEFAULT 0,
    grasas_totales_g         REAL NOT NULL DEFAULT 0,
    fibra_g                  REAL NOT NULL DEFAULT 0,

    -- ── Qué se AÑADIÓ: define qué sellos se evalúan en la fase vigente ──
    anade_azucares           INTEGER NOT NULL DEFAULT 0,
    anade_grasas             INTEGER NOT NULL DEFAULT 0,
    anade_sodio              INTEGER NOT NULL DEFAULT 0,
    contiene_cafeina         INTEGER NOT NULL DEFAULT 0,
    contiene_edulcorantes    INTEGER NOT NULL DEFAULT 0,

    -- ── Resto de la etiqueta ──
    denominacion         TEXT,   -- lo que ES el producto ("Galletas de avena")
    marca                TEXT,
    ingredientes         TEXT,   -- texto libre, de mayor a menor cantidad
    alergenos            TEXT,
    contenido_neto       TEXT,   -- "250 g", "500 ml"
    porcion              TEXT,   -- "1 pieza (30 g)"
    porciones_envase     TEXT,   -- "8 porciones"
    responsable_nombre   TEXT,
    responsable_domicilio TEXT,
    lote                 TEXT,
    caducidad            TEXT,
    conservacion         TEXT,
    pais_origen          TEXT DEFAULT 'Hecho en México',

    notas               TEXT,
    eliminado           INTEGER NOT NULL DEFAULT 0,
    creado_en           TEXT NOT NULL,
    actualizado_en      TEXT NOT NULL,
    dispositivo_id      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_perfiles_nutri_producto ON perfiles_nutrimentales(producto_id);
