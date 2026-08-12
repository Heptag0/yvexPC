// ============================================================================
// AGREGAR a commands/mod.rs (junto a los demás comandos desp_*)
// ============================================================================
// No necesita `estado`/con: es una consulta HTTP pura, no toca la base de
// datos — mismo motivo por el que `prod_buscar_foto_catalogo` tampoco lo pide.
//
// ⚠️ Verifica al compilar que `.query(...)` exista en la versión de `ureq`
// que ya tienes en Cargo.toml (es parte estándar de la API del builder en
// ureq 2.x, la misma familia que ya usan `.set()`/`.timeout()`/`.call()` en
// este archivo — pero no tengo tu Cargo.toml para confirmar la versión
// exacta). Si `cargo check` se queja de `.query`, dímelo con el error tal
// cual y lo ajusto.
// ============================================================================

use super::db::fotos_externas::{self, CandidatoNutricion};

#[tauri::command]
pub fn desp_buscar_nutricion(nombre: String) -> Result<Vec<CandidatoNutricion>, String> {
    fotos_externas::buscar_nutricion_por_nombre(&nombre)
}
