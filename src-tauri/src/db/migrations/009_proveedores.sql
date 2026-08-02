-- ============================================================================
-- YvexPOS — Migración 009: Proveedores y compras
--
-- Espejo del esquema v13 del móvil (src/base/db.ts). Mismas columnas, mismo
-- significado. Se añade `dispositivo_id` en ambas tablas para seguir la
-- convención del resto del esquema del PC (auditoría de qué caja creó qué),
-- aunque estas tablas sean LOCAL-ONLY y no se sincronicen todavía.
--
--   proveedores: quién te surte (Coca, Bimbo, el de la verdura...).
--     dias_visita es un JSON array de enteros 0-6 (0 = domingo), la rutina
--     de reparto, para avisar en Inicio "mañana llega tu proveedor".
--     NULL = sin rutina configurada.
--   compras: cada surtido registrado a mano (el PC no tiene escáner de
--     tickets todavía — foto-a-inventario es post-lanzamiento — así que
--     `origen` siempre será 'manual' por ahora, pero se deja el CHECK
--     abierto a 'escaner' para que el dato sea compatible con el móvil el
--     día que el PC también lo tenga).
--     proveedor_id puede ser NULL si la compra no trae proveedor
--     identificable; proveedor_nombre guarda el snapshot del nombre tal
--     como se escribió, aunque el proveedor se edite o borre después
--     (historial fiel).
--
-- ⚠️ LOCAL-ONLY: estas tablas NO se encolan a cola_sync (el servidor no las
-- conoce todavía; igual que en el móvil). Cuando el VPS las soporte, se
-- agrega encolar_sync(...) aquí y en el móvil a la vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS proveedores (
    id             TEXT PRIMARY KEY,
    nombre         TEXT NOT NULL,
    contacto       TEXT,
    telefono       TEXT,
    notas          TEXT,
    dias_visita    TEXT,
    eliminado      INTEGER NOT NULL DEFAULT 0,
    creado_en      TEXT NOT NULL,
    actualizado_en TEXT NOT NULL,
    dispositivo_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proveedores_nombre ON proveedores(nombre COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS compras (
    id               TEXT PRIMARY KEY,
    proveedor_id     TEXT REFERENCES proveedores(id),
    proveedor_nombre TEXT,
    folio            TEXT,
    fecha            TEXT,
    tipo             TEXT NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal', 'preventa')),
    total_centavos   INTEGER NOT NULL DEFAULT 0,
    num_lineas       INTEGER NOT NULL DEFAULT 0,
    origen           TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'escaner')),
    notas            TEXT,
    eliminado        INTEGER NOT NULL DEFAULT 0,
    creado_en        TEXT NOT NULL,
    actualizado_en   TEXT NOT NULL,
    dispositivo_id   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras(fecha);
