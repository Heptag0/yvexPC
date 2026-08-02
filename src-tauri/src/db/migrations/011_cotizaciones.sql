-- ============================================================================
-- YvexPOS — Migración 011: Cotizaciones
-- ============================================================================
-- Carrito armado SIN cobrar: el dueño arma una cotización (precio, cantidad,
-- validez), se la comparte al cliente (imprime o PDF, mismo mecanismo que el
-- ticket), y si el cliente acepta, se CONVIERTE en una venta real con un
-- clic — sin volver a capturar nada.
--
-- Pensado para giros donde "cuánto me costaría" es el primer paso de la
-- venta, no un extra: construcción, materiales, servicios — no solo abarrotes.
--
-- ⚠️ LOCAL-ONLY (v1), mismo punto de partida que tuvieron proveedores y
-- lealtad antes de sincronizarse. La receta para sincronizarlo después ya
-- está probada (MAPA en backend-sync.py + bajada + PC + móvil) — se puede
-- aplicar en un siguiente paso si hace falta.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cotizaciones (
    id                  TEXT PRIMARY KEY,
    folio               INTEGER NOT NULL,
    cliente_nombre      TEXT,
    cliente_telefono    TEXT,
    cliente_correo      TEXT,
    notas               TEXT,
    subtotal_centavos   INTEGER NOT NULL DEFAULT 0,
    descuento_centavos  INTEGER NOT NULL DEFAULT 0,
    total_centavos      INTEGER NOT NULL DEFAULT 0,
    -- "AAAA-MM-DD" opcional: hasta cuándo se sostiene el precio cotizado.
    valida_hasta        TEXT,
    estado              TEXT NOT NULL DEFAULT 'abierta'
                          CHECK (estado IN ('abierta', 'convertida', 'vencida', 'cancelada')),
    -- Si se convirtió en venta, aquí queda la referencia (nunca se borra la
    -- cotización al convertirla: es el rastro de "de dónde salió esta venta").
    venta_id            TEXT REFERENCES ventas(id),
    eliminado           INTEGER NOT NULL DEFAULT 0,
    creado_en           TEXT NOT NULL,
    actualizado_en      TEXT NOT NULL,
    dispositivo_id      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_folio ON cotizaciones(folio);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones(estado);

CREATE TABLE IF NOT EXISTS cotizacion_lineas (
    id                        TEXT PRIMARY KEY,
    cotizacion_id             TEXT NOT NULL REFERENCES cotizaciones(id),
    producto_id               TEXT REFERENCES productos(id),
    -- Snapshot del nombre: si el producto cambia de nombre o se borra
    -- después, la cotización sigue leyéndose igual que cuando se armó.
    descripcion               TEXT NOT NULL,
    cantidad                  REAL NOT NULL,
    precio_unitario_centavos  INTEGER NOT NULL,
    descuento_linea_centavos  INTEGER NOT NULL DEFAULT 0,
    total_linea_centavos      INTEGER NOT NULL DEFAULT 0,
    creado_en                 TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_lineas_cot ON cotizacion_lineas(cotizacion_id);
