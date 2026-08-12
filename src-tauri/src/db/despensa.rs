//! Despensa de ingredientes — insumos que se COMPRAN a granel para fabricar
//! productos (harina, queso crema, cajas de pizza...), reutilizables entre
//! muchas recetas.
//!
//! ⚠️ Un ingrediente de despensa NUNCA es un producto de `productos`. Son
//! catálogos deliberadamente separados: la despensa es "lo que te cuesta
//! fabricar", `productos` es "lo que vendes". Solo una RECETA terminada
//! (ver recetas.rs) puede dar el salto y crear un producto de venta.
//!
//! Todas las cantidades (tamaño de paquete) viven en unidad BASE granular
//! (g, ml o pieza) — la conversión "compré 1 kg" -> 1000 g la hace el
//! frontend antes de mandar el dato aquí.
//!
//! LOCAL-ONLY (v1), mismo criterio que perfiles_nutrimentales.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::comun::{ahora, nuevo_id};

#[derive(Debug, Serialize)]
pub struct Ingrediente {
    pub id: String,
    pub nombre: String,
    pub unidad: String,
    pub tamano_paquete: f64,
    pub costo_paquete_centavos: i64,
    /// Costo por 1 unidad base (g/ml/pieza), ya calculado — evita que cada
    /// pantalla que lo usa repita la misma división.
    pub costo_por_unidad_centavos: f64,
    pub calorias_kcal: f64,
    pub azucares_g: f64,
    pub grasas_saturadas_g: f64,
    pub grasas_trans_g: f64,
    pub sodio_mg: f64,
    pub proteinas_g: f64,
    pub carbohidratos_g: f64,
    pub grasas_totales_g: f64,
    pub fibra_g: f64,
    pub notas: Option<String>,
    pub actualizado_en: String,
}

#[derive(Debug, Deserialize)]
pub struct NuevoIngrediente {
    pub nombre: String,
    pub unidad: String,
    pub tamano_paquete: f64,
    pub costo_paquete_centavos: i64,
    #[serde(default)]
    pub calorias_kcal: f64,
    #[serde(default)]
    pub azucares_g: f64,
    #[serde(default)]
    pub grasas_saturadas_g: f64,
    #[serde(default)]
    pub grasas_trans_g: f64,
    #[serde(default)]
    pub sodio_mg: f64,
    #[serde(default)]
    pub proteinas_g: f64,
    #[serde(default)]
    pub carbohidratos_g: f64,
    #[serde(default)]
    pub grasas_totales_g: f64,
    #[serde(default)]
    pub fibra_g: f64,
    #[serde(default)]
    pub notas: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EditarIngrediente {
    pub id: String,
    #[serde(flatten)]
    pub datos: NuevoIngrediente,
}

const UNIDADES_VALIDAS: [&str; 3] = ["g", "ml", "pieza"];

fn validar(d: &NuevoIngrediente) -> Result<(), String> {
    if d.nombre.trim().is_empty() {
        return Err("Ponle un nombre al ingrediente.".into());
    }
    if !UNIDADES_VALIDAS.contains(&d.unidad.as_str()) {
        return Err(format!("Unidad inválida: {}", d.unidad));
    }
    if d.tamano_paquete <= 0.0 {
        return Err("El tamaño del paquete debe ser mayor a cero.".into());
    }
    if d.costo_paquete_centavos < 0 {
        return Err("El costo del paquete no puede ser negativo.".into());
    }
    Ok(())
}

fn limpio(s: &Option<String>) -> Option<String> {
    s.as_deref().map(str::trim).filter(|x| !x.is_empty()).map(String::from)
}

const COLS: &str = "id, nombre, unidad, tamano_paquete, costo_paquete_centavos,
       calorias_kcal, azucares_g, grasas_saturadas_g, grasas_trans_g, sodio_mg,
       proteinas_g, carbohidratos_g, grasas_totales_g, fibra_g, notas, actualizado_en";

fn fila(row: &Row) -> rusqlite::Result<Ingrediente> {
    let tamano: f64 = row.get(3)?;
    let costo: i64 = row.get(4)?;
    let costo_por_unidad = if tamano > 0.0 { costo as f64 / tamano } else { 0.0 };
    Ok(Ingrediente {
        id: row.get(0)?,
        nombre: row.get(1)?,
        unidad: row.get(2)?,
        tamano_paquete: tamano,
        costo_paquete_centavos: costo,
        costo_por_unidad_centavos: costo_por_unidad,
        calorias_kcal: row.get(5)?,
        azucares_g: row.get(6)?,
        grasas_saturadas_g: row.get(7)?,
        grasas_trans_g: row.get(8)?,
        sodio_mg: row.get(9)?,
        proteinas_g: row.get(10)?,
        carbohidratos_g: row.get(11)?,
        grasas_totales_g: row.get(12)?,
        fibra_g: row.get(13)?,
        notas: row.get(14)?,
        actualizado_en: row.get(15)?,
    })
}

pub fn listar(con: &Connection) -> Result<Vec<Ingrediente>, String> {
    let sql = format!(
        "SELECT {COLS} FROM despensa_ingredientes WHERE eliminado = 0 ORDER BY nombre COLLATE NOCASE"
    );
    let mut stmt = con.prepare(&sql).map_err(|e| format!("error al preparar despensa: {e}"))?;
    let filas = stmt.query_map([], fila).map_err(|e| format!("error al listar despensa: {e}"))?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer ingrediente: {e}"))?);
    }
    Ok(out)
}

pub fn obtener(con: &Connection, id: &str) -> Result<Option<Ingrediente>, String> {
    let sql = format!("SELECT {COLS} FROM despensa_ingredientes WHERE eliminado = 0 AND id = ?1");
    con.query_row(&sql, rusqlite::params![id], fila)
        .optional()
        .map_err(|e| format!("error al leer ingrediente: {e}"))
}

pub fn crear(con: &Connection, dispositivo_id: &str, d: &NuevoIngrediente) -> Result<String, String> {
    validar(d)?;
    let id = nuevo_id();
    let ts = ahora();
    con.execute(
        "INSERT INTO despensa_ingredientes
           (id, nombre, unidad, tamano_paquete, costo_paquete_centavos,
            calorias_kcal, azucares_g, grasas_saturadas_g, grasas_trans_g, sodio_mg,
            proteinas_g, carbohidratos_g, grasas_totales_g, fibra_g, notas,
            eliminado, creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,0,?16,?16,?17)",
        rusqlite::params![
            id, d.nombre.trim(), d.unidad, d.tamano_paquete, d.costo_paquete_centavos,
            d.calorias_kcal.max(0.0), d.azucares_g.max(0.0), d.grasas_saturadas_g.max(0.0),
            d.grasas_trans_g.max(0.0), d.sodio_mg.max(0.0), d.proteinas_g.max(0.0),
            d.carbohidratos_g.max(0.0), d.grasas_totales_g.max(0.0), d.fibra_g.max(0.0),
            limpio(&d.notas), ts, dispositivo_id,
        ],
    )
    .map_err(|e| format!("error al crear ingrediente: {e}"))?;
    Ok(id)
}

pub fn editar(con: &Connection, e: &EditarIngrediente) -> Result<(), String> {
    validar(&e.datos)?;
    let ts = ahora();
    let n = con
        .execute(
            "UPDATE despensa_ingredientes SET
               nombre=?2, unidad=?3, tamano_paquete=?4, costo_paquete_centavos=?5,
               calorias_kcal=?6, azucares_g=?7, grasas_saturadas_g=?8, grasas_trans_g=?9,
               sodio_mg=?10, proteinas_g=?11, carbohidratos_g=?12, grasas_totales_g=?13,
               fibra_g=?14, notas=?15, actualizado_en=?16
             WHERE id=?1 AND eliminado=0",
            rusqlite::params![
                e.id, e.datos.nombre.trim(), e.datos.unidad, e.datos.tamano_paquete,
                e.datos.costo_paquete_centavos, e.datos.calorias_kcal.max(0.0),
                e.datos.azucares_g.max(0.0), e.datos.grasas_saturadas_g.max(0.0),
                e.datos.grasas_trans_g.max(0.0), e.datos.sodio_mg.max(0.0),
                e.datos.proteinas_g.max(0.0), e.datos.carbohidratos_g.max(0.0),
                e.datos.grasas_totales_g.max(0.0), e.datos.fibra_g.max(0.0),
                limpio(&e.datos.notas), ts,
            ],
        )
        .map_err(|e| format!("error al editar ingrediente: {e}"))?;
    if n == 0 {
        return Err("No se encontró el ingrediente.".into());
    }
    Ok(())
}

/// Soft delete. Las recetas que ya usaron este ingrediente NO se rompen:
/// receta_lineas guardó su propio nombre_congelado y costo_congelado, así
/// que siguen mostrándose completas aunque el ingrediente desaparezca de
/// la despensa activa.
pub fn eliminar(con: &Connection, id: &str) -> Result<(), String> {
    let n = con
        .execute(
            "UPDATE despensa_ingredientes SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1",
            rusqlite::params![id, ahora()],
        )
        .map_err(|e| format!("error al eliminar ingrediente: {e}"))?;
    if n == 0 {
        return Err("No se encontró el ingrediente.".into());
    }
    Ok(())
}
