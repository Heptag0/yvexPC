-- ============================================================================
-- YvexPOS — Migración 014: exención y área del envase para NOM-051
-- ============================================================================
-- Dos datos que faltaban tras leer el texto íntegro de la norma:
--
--   exencion: hay productos que NO llevan sellos por su naturaleza, sin
--     importar sus valores (numeral 4.5.3.3): aceites, azúcar, miel, sal
--     yodada, harinas de cereal, productos de un solo ingrediente, agua,
--     café, té, vinagres, especias, fórmulas infantiles.
--
--   area_cm2: el área de la superficie principal de exhibición determina
--     el TAMAÑO exacto de cada sello (Tabla A1 del Apéndice A) y, si es de
--     40 cm² o menos, obliga a usar el sello agrupado con número en vez de
--     los sellos individuales (numeral 4.5.3.4.2).
-- ============================================================================

ALTER TABLE perfiles_nutrimentales ADD COLUMN exencion TEXT NOT NULL DEFAULT 'ninguna';
ALTER TABLE perfiles_nutrimentales ADD COLUMN area_cm2 REAL NOT NULL DEFAULT 0;
