-- ============================================================================
-- YvexPOS — Migración 008: Programa de lealtad
--
-- El MISMO cliente del crédito pasa a ser también cliente de lealtad (NO se
-- crea otra tabla de clientes: un cliente, dos beneficios). Sin embargo los
-- puntos NO se mezclan con la cuenta de crédito: son mundos separados.
--
--   - clientes.puntos   -> saldo de puntos (enteros).
--   - clientes.codigo   -> código corto "YV-XXXXXX" para su QR (único; NULL en
--                          clientes viejos hasta su primer uso: perezoso, sin
--                          riesgo de colisiones durante la migración).
--   - clientes.correo   -> correo opcional (para promociones futuras).
--   - puntos_movimientos-> bitácora con signo (compra/visita/canje/ajuste).
--
-- ⚠️ LOCAL-ONLY: estas columnas y tabla NO se encolan a cola_sync (el
-- servidor aún no las conoce; igual que en el móvil). Cuando la nube soporte
-- lealtad habrá que añadirlas al mapa de sync.
-- ============================================================================

ALTER TABLE clientes ADD COLUMN puntos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clientes ADD COLUMN codigo TEXT;
ALTER TABLE clientes ADD COLUMN correo TEXT;

-- UNIQUE solo aplica a los no-NULL (SQLite): los clientes sin código no chocan.
CREATE UNIQUE INDEX idx_clientes_codigo ON clientes(codigo);

CREATE TABLE puntos_movimientos (
    id             TEXT PRIMARY KEY,
    cliente_id     TEXT NOT NULL REFERENCES clientes(id),
    -- 'compra' y 'canje' llevan la venta que los originó; 'visita'/'ajuste' NULL.
    venta_id       TEXT REFERENCES ventas(id),
    tipo           TEXT NOT NULL CHECK (tipo IN ('compra', 'visita', 'canje', 'ajuste')),
    -- Positivo acumula, negativo canjea/corrige.
    puntos         INTEGER NOT NULL,
    nota           TEXT,
    creado_en      TEXT NOT NULL,
    dispositivo_id TEXT NOT NULL
);

CREATE INDEX idx_puntos_mov_cliente ON puntos_movimientos(cliente_id);
CREATE INDEX idx_puntos_mov_venta   ON puntos_movimientos(venta_id);
