//! Progreso de las misiones de arranque ("Tu arranque" en Inicio).
//!
//! Espejo de la CONTABILIDAD del móvil (`src/base/misiones.ts`): los textos y
//! metas viven en el frontend (`src/util/misiones.js`), aquí solo se cuenta
//! lo que hay en la base — una sola pasada, sin traer listas completas nada
//! más para contarlas.

use rusqlite::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ProgresoMisiones {
    pub productos: i64,
    pub ventas: i64,
    pub con_codigo: i64,
    /// Productos con foto. En el PC la columna se llama `imagen_ruta`
    /// (en el móvil es `imagen_uri` — mismo concepto, nombre distinto).
    pub con_foto: i64,
    pub kits: i64,
}

pub fn progreso(con: &Connection) -> Result<ProgresoMisiones, String> {
    let contar = |sql: &str| -> Result<i64, String> {
        con.query_row(sql, [], |r| r.get(0))
            .map_err(|e| format!("error al contar para misiones: {e}"))
    };
    Ok(ProgresoMisiones {
        productos: contar("SELECT COUNT(*) FROM productos WHERE eliminado = 0")?,
        ventas: contar("SELECT COUNT(*) FROM ventas WHERE estado <> 'cancelada'")?,
        con_codigo: contar(
            "SELECT COUNT(*) FROM productos
              WHERE eliminado = 0 AND codigo_barras IS NOT NULL AND TRIM(codigo_barras) <> ''",
        )?,
        con_foto: contar(
            "SELECT COUNT(*) FROM productos
              WHERE eliminado = 0 AND imagen_ruta IS NOT NULL AND TRIM(imagen_ruta) <> ''",
        )?,
        kits: contar("SELECT COUNT(*) FROM productos WHERE eliminado = 0 AND es_kit = 1")?,
    })
}
