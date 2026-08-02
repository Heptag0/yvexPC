-- ============================================================================
-- YvexPOS — Migración 012: Agenda financiera (negocio y personal)
-- ============================================================================
-- No es un módulo de "gastos del negocio": es la agenda de dinero del dueño,
-- con DOS LIBROS separados que se pueden intercambiar:
--
--   negocio  → la renta del local, la luz del local, los sueldos…
--   personal → la renta de su casa, la luz de su casa, la despensa…
--
-- La misma categoría ("servicios") vive en los dos libros y eso es correcto:
-- la luz del local y la luz de la casa son el mismo tipo de gasto en dos
-- bolsillos distintos. Mezclarlos es justo lo que hace que un negocio
-- familiar nunca sepa si gana dinero.
--
-- EL PUENTE ENTRE LOS DOS LIBROS (lo más importante de este diseño):
-- cuando el dueño saca dinero del negocio para sus cosas, ese movimiento es
-- UN GASTO en el libro del negocio y UN INGRESO en el personal, a la vez.
-- Se registra una sola vez (categoría "retiro" en negocio) y el sistema lo
-- refleja en ambos lados. Así puede contestar la pregunta que nadie contesta:
-- "tu negocio te dio $12,400 para vivir este mes, y gastaste $15,800".
--
-- LOCAL-ONLY (v1), igual que proveedores/lealtad/cotizaciones.
-- Dinero SIEMPRE en centavos enteros.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- gastos: lo que salió, en cualquiera de los dos libros.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gastos (
    id                 TEXT PRIMARY KEY,
    ambito             TEXT NOT NULL DEFAULT 'negocio'
                         CHECK (ambito IN ('negocio', 'personal')),
    concepto           TEXT NOT NULL,
    categoria          TEXT NOT NULL,
    monto_centavos     INTEGER NOT NULL,
    fecha              TEXT NOT NULL,   -- "AAAA-MM-DD"
    metodo_pago        TEXT NOT NULL DEFAULT 'efectivo'
                         CHECK (metodo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'otro')),
    gasto_fijo_id      TEXT REFERENCES gastos_fijos(id),
    -- Si se pagó con efectivo del cajón, el movimiento de caja que lo refleja.
    -- Una sola captura: el corte cuadra sin capturar dos veces lo mismo.
    movimiento_caja_id TEXT REFERENCES movimientos_caja(id),
    -- Si es un RETIRO del negocio (categoría 'retiro' en ámbito negocio),
    -- aquí queda el id del ingreso que generó en el libro personal.
    ingreso_espejo_id  TEXT,
    notas              TEXT,
    eliminado          INTEGER NOT NULL DEFAULT 0,
    creado_en          TEXT NOT NULL,
    actualizado_en     TEXT NOT NULL,
    dispositivo_id     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(ambito, fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(ambito, categoria);

-- ----------------------------------------------------------------------------
-- ingresos: dinero que ENTRA y que NO es una venta del POS.
--   personal → sueldo, apoyo familiar, un trabajo por fuera, una renta que
--              cobra, y los retiros que se hace del negocio.
--   negocio  → un ingreso extra que no pasó por la caja (renta de un espacio,
--              un servicio cobrado aparte).
-- Las ventas del POS NO se copian aquí: se leen de `ventas` en vivo, para que
-- no haya dos verdades sobre lo mismo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingresos (
    id              TEXT PRIMARY KEY,
    ambito          TEXT NOT NULL DEFAULT 'personal'
                      CHECK (ambito IN ('negocio', 'personal')),
    concepto        TEXT NOT NULL,
    categoria       TEXT NOT NULL,
    monto_centavos  INTEGER NOT NULL,
    fecha           TEXT NOT NULL,
    -- Si nació de un retiro del negocio, el gasto que lo originó.
    gasto_origen_id TEXT REFERENCES gastos(id),
    notas           TEXT,
    eliminado       INTEGER NOT NULL DEFAULT 0,
    creado_en       TEXT NOT NULL,
    actualizado_en  TEXT NOT NULL,
    dispositivo_id  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(ambito, fecha);

-- ----------------------------------------------------------------------------
-- gastos_fijos: la PLANTILLA de lo que se repite cada mes, en cualquiera de
-- los dos libros. No es un gasto ocurrido: es un compromiso conocido. Sirve
-- para avisar antes de que venza y para saber cuánto cuesta el mes de arranque.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gastos_fijos (
    id             TEXT PRIMARY KEY,
    ambito         TEXT NOT NULL DEFAULT 'negocio'
                     CHECK (ambito IN ('negocio', 'personal')),
    concepto       TEXT NOT NULL,
    categoria      TEXT NOT NULL,
    monto_centavos INTEGER NOT NULL,
    dia_mes        INTEGER NOT NULL,   -- 1-31
    activo         INTEGER NOT NULL DEFAULT 1,
    notas          TEXT,
    eliminado      INTEGER NOT NULL DEFAULT 0,
    creado_en      TEXT NOT NULL,
    actualizado_en TEXT NOT NULL,
    dispositivo_id TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- presupuestos: el límite mensual por categoría y libro. Sin esto no hay
-- forma honesta de avisar "te estás pasando" — un aviso sin límite definido
-- por el dueño sería una opinión de la app, no un dato suyo.
-- Una fila por (ambito, categoria).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presupuestos (
    id             TEXT PRIMARY KEY,
    ambito         TEXT NOT NULL CHECK (ambito IN ('negocio', 'personal')),
    categoria      TEXT NOT NULL,
    monto_centavos INTEGER NOT NULL,
    creado_en      TEXT NOT NULL,
    actualizado_en TEXT NOT NULL,
    dispositivo_id TEXT NOT NULL,
    UNIQUE (ambito, categoria)
);
