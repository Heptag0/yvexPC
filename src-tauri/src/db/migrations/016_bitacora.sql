-- ============================================================================
-- YvexPOS — Migración 016: Bitácora de catálogo
-- ============================================================================
-- ⚠️ NÚMERO A CONFIRMAR: se numeró como 016 asumiendo que 015
-- (despensa_recetas) es la última aplicada. Si ya existe una 016 en tu
-- carpeta de migraciones, renombra este archivo al siguiente número libre.
--
-- Esta tabla NO es "la bitácora de todo el sistema" — a propósito. Ya
-- existen dos fuentes completas y correctas que no tiene sentido duplicar:
--   · ajustes_inventario -> entradas, mermas, conteos (con usuario y motivo)
--   · ventas             -> qué se vendió, cuándo, quién cobró
--
-- Esta tabla cubre SOLO lo que hoy no deja NINGÚN rastro: alta, edición y
-- baja de productos del catálogo. La pantalla "Registro de movimientos"
-- (db/bitacora.rs :: listar()) une las tres fuentes en una sola línea de
-- tiempo — no hay que preguntarle a tres tablas por separado.
--
-- usuario_nombre se CONGELA aquí (igual que costo_unitario_centavos en
-- ventas, o nombre_congelado en receta_lineas) — si el usuario se renombra
-- o se elimina después, esta entrada sigue mostrando quién fue en su
-- momento, no un dato que se mueve solo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bitacora (
    id              TEXT PRIMARY KEY,
    tipo            TEXT NOT NULL,   -- 'producto_creado' | 'producto_editado' | 'producto_eliminado'
    descripcion     TEXT NOT NULL,   -- texto legible: 'Creó el producto "Coca-Cola 600ml"'
    entidad_tipo    TEXT,            -- 'producto' (por ahora; más adelante 'cliente', 'usuario'...)
    entidad_id      TEXT,
    usuario_pos_id  TEXT,
    usuario_nombre  TEXT NOT NULL,   -- congelado al momento del evento
    creado_en       TEXT NOT NULL,
    dispositivo_id  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bitacora_creado ON bitacora(creado_en);
CREATE INDEX IF NOT EXISTS idx_bitacora_tipo ON bitacora(tipo);
CREATE INDEX IF NOT EXISTS idx_bitacora_entidad ON bitacora(entidad_tipo, entidad_id);
