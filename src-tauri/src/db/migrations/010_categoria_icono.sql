-- ============================================================================
-- YvexPOS — Migración 010: icono de categoría/departamento
-- ============================================================================
-- Espejo del campo `icono` que el móvil ya tiene en `categorias` (ESQUEMA_V4).
-- LOCAL-ONLY por ahora: no se sincroniza al servidor todavía (igual que
-- proveedores/lealtad antes de sincronizarse — se puede agregar después
-- siguiendo el mismo patrón: MAPA en backend-sync.py + columna en Postgres).
--
-- NULL = sin icono asignado (la categoría se sigue mostrando solo por color,
-- como hasta ahora — nada se rompe para categorías existentes).
-- ============================================================================

ALTER TABLE categorias ADD COLUMN icono TEXT;
