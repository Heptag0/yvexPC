//! Etiquetado NOM-051 (México) — perfiles de producto para calcular sellos y
//! generar la hoja de etiqueta.
//!
//! ⚠️ ESTE MÓDULO NO CALCULA NADA. Solo guarda lo que el usuario capturó.
//! Qué sellos aplican se calcula en el frontend (src/util/sellos.js), porque
//! son reglas de gobierno que ya cambiaron de fecha dos veces — tenerlas en
//! un solo lugar evita que Rust y JS den resultados distintos algún día.
//!
//! LOCAL-ONLY (v1).

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::comun::{ahora, nuevo_id};

#[derive(Debug, Serialize, Deserialize)]
pub struct PerfilEtiqueta {
    #[serde(default)]
    pub id: String,
    pub producto_id: Option<String>,
    pub nombre: String,
    pub tipo: String,

    pub calorias_kcal: f64,
    pub azucares_g: f64,
    pub grasas_saturadas_g: f64,
    pub grasas_trans_g: f64,
    pub sodio_mg: f64,
    pub proteinas_g: f64,
    pub carbohidratos_g: f64,
    pub grasas_totales_g: f64,
    pub fibra_g: f64,

    pub anade_azucares: bool,
    pub anade_grasas: bool,
    pub anade_sodio: bool,
    pub contiene_cafeina: bool,
    pub contiene_edulcorantes: bool,

    /// Exención por naturaleza del producto (numeral 4.5.3.3). "ninguna" si
    /// el producto sí está sujeto a la norma.
    #[serde(default)]
    pub exencion: String,
    /// Área de la superficie principal de exhibición, en cm². Define el
    /// tamaño del sello (Tabla A1) y si aplica el sello agrupado con número.
    #[serde(default)]
    pub area_cm2: f64,

    pub denominacion: Option<String>,
    pub marca: Option<String>,
    pub ingredientes: Option<String>,
    pub alergenos: Option<String>,
    pub contenido_neto: Option<String>,
    pub porcion: Option<String>,
    pub porciones_envase: Option<String>,
    pub responsable_nombre: Option<String>,
    pub responsable_domicilio: Option<String>,
    pub lote: Option<String>,
    pub caducidad: Option<String>,
    pub conservacion: Option<String>,
    pub pais_origen: Option<String>,

    pub notas: Option<String>,
    #[serde(default)]
    pub actualizado_en: String,
}

fn tipo_valido(t: &str) -> String {
    if t == "liquido" { "liquido".into() } else { "solido".into() }
}

fn limpio(s: &Option<String>) -> Option<String> {
    s.as_deref().map(str::trim).filter(|x| !x.is_empty()).map(String::from)
}

/// Los índices siguen el orden EXACTO de la constante COLS de abajo. Si se
/// agrega una columna ahí, hay que recorrer los índices de aquí.
fn fila(row: &Row) -> rusqlite::Result<PerfilEtiqueta> {
    Ok(PerfilEtiqueta {
        id: row.get(0)?,
        producto_id: row.get(1)?,
        nombre: row.get(2)?,
        tipo: row.get(3)?,
        calorias_kcal: row.get(4)?,
        azucares_g: row.get(5)?,
        grasas_saturadas_g: row.get(6)?,
        grasas_trans_g: row.get(7)?,
        sodio_mg: row.get(8)?,
        proteinas_g: row.get(9)?,
        carbohidratos_g: row.get(10)?,
        grasas_totales_g: row.get(11)?,
        fibra_g: row.get(12)?,
        anade_azucares: row.get::<_, i64>(13)? != 0,
        anade_grasas: row.get::<_, i64>(14)? != 0,
        anade_sodio: row.get::<_, i64>(15)? != 0,
        contiene_cafeina: row.get::<_, i64>(16)? != 0,
        contiene_edulcorantes: row.get::<_, i64>(17)? != 0,
        denominacion: row.get(18)?,
        marca: row.get(19)?,
        ingredientes: row.get(20)?,
        alergenos: row.get(21)?,
        contenido_neto: row.get(22)?,
        porcion: row.get(23)?,
        porciones_envase: row.get(24)?,
        responsable_nombre: row.get(25)?,
        responsable_domicilio: row.get(26)?,
        lote: row.get(27)?,
        caducidad: row.get(28)?,
        conservacion: row.get(29)?,
        pais_origen: row.get(30)?,
        notas: row.get(31)?,
        exencion: row.get(32)?,
        area_cm2: row.get(33)?,
        actualizado_en: row.get(34)?,
    })
}

const COLS: &str = "id, producto_id, nombre, tipo, calorias_kcal, azucares_g,
       grasas_saturadas_g, grasas_trans_g, sodio_mg, proteinas_g, carbohidratos_g,
       grasas_totales_g, fibra_g, anade_azucares, anade_grasas, anade_sodio,
       contiene_cafeina, contiene_edulcorantes, denominacion, marca, ingredientes,
       alergenos, contenido_neto, porcion, porciones_envase, responsable_nombre,
       responsable_domicilio, lote, caducidad, conservacion, pais_origen, notas,
       exencion, area_cm2, actualizado_en";

pub fn listar(con: &Connection) -> Result<Vec<PerfilEtiqueta>, String> {
    let sql = format!("SELECT {COLS} FROM perfiles_nutrimentales WHERE eliminado = 0 ORDER BY actualizado_en DESC");
    let mut stmt = con.prepare(&sql).map_err(|e| format!("error al preparar perfiles: {e}"))?;
    let filas = stmt.query_map([], fila).map_err(|e| format!("error al listar perfiles: {e}"))?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer perfil: {e}"))?);
    }
    Ok(out)
}

pub fn obtener(con: &Connection, id: &str) -> Result<Option<PerfilEtiqueta>, String> {
    let sql = format!("SELECT {COLS} FROM perfiles_nutrimentales WHERE eliminado = 0 AND id = ?1");
    con.query_row(&sql, rusqlite::params![id], fila)
        .optional()
        .map_err(|e| format!("error al leer perfil: {e}"))
}

/// Crea o actualiza. Si `p.id` viene vacío, crea; si trae id, actualiza.
///
/// Los 36 parámetros van en el mismo orden en ambas consultas:
///   ?1..?32  campos del perfil (hasta `notas`)
///   ?33      exencion
///   ?34      area_cm2
///   ?35      marca de tiempo (creado_en y actualizado_en en el INSERT)
///   ?36      dispositivo_id
pub fn guardar(con: &Connection, dispositivo_id: &str, p: &PerfilEtiqueta) -> Result<String, String> {
    let nombre = p.nombre.trim();
    if nombre.is_empty() {
        return Err("Ponle un nombre a esta receta o producto.".into());
    }
    let ts = ahora();
    let es_nuevo = p.id.trim().is_empty();
    let id = if es_nuevo { nuevo_id() } else { p.id.clone() };

    let params = rusqlite::params![
        id, p.producto_id, nombre, tipo_valido(&p.tipo),
        p.calorias_kcal.max(0.0), p.azucares_g.max(0.0), p.grasas_saturadas_g.max(0.0),
        p.grasas_trans_g.max(0.0), p.sodio_mg.max(0.0), p.proteinas_g.max(0.0),
        p.carbohidratos_g.max(0.0), p.grasas_totales_g.max(0.0), p.fibra_g.max(0.0),
        p.anade_azucares as i64, p.anade_grasas as i64, p.anade_sodio as i64,
        p.contiene_cafeina as i64, p.contiene_edulcorantes as i64,
        limpio(&p.denominacion), limpio(&p.marca), limpio(&p.ingredientes),
        limpio(&p.alergenos), limpio(&p.contenido_neto), limpio(&p.porcion),
        limpio(&p.porciones_envase), limpio(&p.responsable_nombre),
        limpio(&p.responsable_domicilio), limpio(&p.lote), limpio(&p.caducidad),
        limpio(&p.conservacion), limpio(&p.pais_origen), limpio(&p.notas),
        if p.exencion.trim().is_empty() { "ninguna".to_string() } else { p.exencion.clone() },
        p.area_cm2.max(0.0),
        ts, dispositivo_id,
    ];

    if es_nuevo {
        con.execute(
            "INSERT INTO perfiles_nutrimentales
               (id, producto_id, nombre, tipo, calorias_kcal, azucares_g, grasas_saturadas_g,
                grasas_trans_g, sodio_mg, proteinas_g, carbohidratos_g, grasas_totales_g, fibra_g,
                anade_azucares, anade_grasas, anade_sodio, contiene_cafeina, contiene_edulcorantes,
                denominacion, marca, ingredientes, alergenos, contenido_neto, porcion,
                porciones_envase, responsable_nombre, responsable_domicilio, lote, caducidad,
                conservacion, pais_origen, notas, exencion, area_cm2,
                eliminado, creado_en, actualizado_en, dispositivo_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,
                     ?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,0,?35,?35,?36)",
            params,
        )
        .map_err(|e| format!("error al guardar el perfil: {e}"))?;
    } else {
        let n = con
            .execute(
                "UPDATE perfiles_nutrimentales SET
                   producto_id=?2, nombre=?3, tipo=?4, calorias_kcal=?5, azucares_g=?6,
                   grasas_saturadas_g=?7, grasas_trans_g=?8, sodio_mg=?9, proteinas_g=?10,
                   carbohidratos_g=?11, grasas_totales_g=?12, fibra_g=?13, anade_azucares=?14,
                   anade_grasas=?15, anade_sodio=?16, contiene_cafeina=?17, contiene_edulcorantes=?18,
                   denominacion=?19, marca=?20, ingredientes=?21, alergenos=?22, contenido_neto=?23,
                   porcion=?24, porciones_envase=?25, responsable_nombre=?26, responsable_domicilio=?27,
                   lote=?28, caducidad=?29, conservacion=?30, pais_origen=?31, notas=?32,
                   exencion=?33, area_cm2=?34, actualizado_en=?35, dispositivo_id=?36
                 WHERE id=?1 AND eliminado=0",
                params,
            )
            .map_err(|e| format!("error al actualizar el perfil: {e}"))?;
        if n == 0 {
            return Err("No se encontró el perfil.".into());
        }
    }
    Ok(id)
}

pub fn eliminar(con: &Connection, id: &str) -> Result<(), String> {
    let n = con
        .execute(
            "UPDATE perfiles_nutrimentales SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1",
            rusqlite::params![id, ahora()],
        )
        .map_err(|e| format!("error al eliminar el perfil: {e}"))?;
    if n == 0 {
        return Err("No se encontró el perfil.".into());
    }
    Ok(())
}
