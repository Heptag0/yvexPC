//! Costeo de recetas — cuánto de cada ingrediente de la despensa lleva un
//! producto terminado (pastel, pizza, hamburguesa), para saber su costo real
//! y sugerir un precio de venta. Cuando la receta está lista, puede mandarse
//! al catálogo: ahí nace un producto de venta normal en `productos`.
//!
//! Dos cosas se calculan aquí en Rust y NO en el frontend, a propósito:
//! costo y nutrición son aritmética estable (no reglas de gobierno que
//! cambian de fecha como los sellos NOM-051), así que vive en un solo lugar
//! para que PC y, más adelante, móvil, nunca den un número distinto.
//!
//! Costo CONGELADO por línea (mismo principio que costo_unitario_centavos en
//! ventas): se fija al guardar la receta, no se recalcula solo si cambia el
//! precio del ingrediente en la despensa — hay que reabrir y guardar de
//! nuevo para refrescarlo (o el usuario da un costo manual esa vez).
//!
//! Nutrición, en cambio, se calcula EN VIVO desde los valores actuales de la
//! despensa cada vez que se lee la receta (no se congela): a diferencia del
//! costo, no hay una razón real de negocio para que la nutrición de una
//! receta se quede "vieja" — si corriges los gramos de azúcar de un
//! ingrediente en la despensa, quieres que la etiqueta lo refleje.
//!
//! LOCAL-ONLY (v1), mismo criterio que perfiles_nutrimentales y despensa.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::comun::{ahora, nuevo_id};
use super::despensa;
use super::productos::{self, NuevoProducto};

#[derive(Debug, Serialize, Default)]
pub struct NutricionTotal {
    pub calorias_kcal: f64,
    pub azucares_g: f64,
    pub grasas_saturadas_g: f64,
    pub grasas_trans_g: f64,
    pub sodio_mg: f64,
    pub proteinas_g: f64,
    pub carbohidratos_g: f64,
    pub grasas_totales_g: f64,
    pub fibra_g: f64,
}

#[derive(Debug, Serialize)]
pub struct RecetaLinea {
    pub id: String,
    pub ingrediente_id: String,
    pub nombre_congelado: String,
    pub unidad: String,
    pub cantidad_usada: f64,
    pub costo_congelado_centavos: i64,
}

#[derive(Debug, Serialize)]
pub struct Receta {
    pub id: String,
    pub nombre: String,
    pub rendimiento_cantidad: f64,
    pub rendimiento_unidad: String,
    pub margen_deseado_pct: f64,
    pub producto_id: Option<String>,
    pub notas: Option<String>,
    pub lineas: Vec<RecetaLinea>,
    pub costo_total_centavos: i64,
    pub costo_por_rendimiento_centavos: i64,
    pub precio_sugerido_centavos: i64,
    pub nutricion_total: NutricionTotal,
    /// Suma aproximada del peso/volumen de la receta (g + ml tratados 1:1;
    /// los ingredientes por pieza no cuentan aquí porque no tienen un peso
    /// conocido). Sirve para que el frontend calcule "por 100 g" al mandar
    /// esto a una etiqueta NOM-051 — es una aproximación de cocina, no un
    /// peso certificado.
    pub peso_aprox_g: f64,
    /// Nombres de ingredientes cuyos 9 campos de nutrición están en cero —
    /// probablemente porque nunca se capturaron, no porque de verdad sean
    /// cero. Heurística simple (no hay forma de distinguir "0 real" de
    /// "nunca se llenó" sin una columna nueva) — informativa, nunca bloquea.
    pub ingredientes_sin_nutricion: Vec<String>,
    pub creado_en: String,
    pub actualizado_en: String,
}

#[derive(Debug, Serialize)]
pub struct RecetaResumen {
    pub id: String,
    pub nombre: String,
    pub rendimiento_cantidad: f64,
    pub rendimiento_unidad: String,
    pub costo_por_rendimiento_centavos: i64,
    pub num_ingredientes: i64,
    pub producto_id: Option<String>,
    pub actualizado_en: String,
}

#[derive(Debug, Deserialize)]
pub struct LineaRecetaEntrada {
    pub ingrediente_id: String,
    pub cantidad_usada: f64,
    /// Si el usuario escribió un costo a mano para esta línea (lo compró en
    /// otro lado, otra presentación) se usa este valor tal cual, en vez del
    /// costo calculado desde la despensa.
    #[serde(default)]
    pub costo_manual_centavos: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct NuevaReceta {
    #[serde(default)]
    pub id: String,
    pub nombre: String,
    pub rendimiento_cantidad: f64,
    pub rendimiento_unidad: String,
    pub margen_deseado_pct: f64,
    #[serde(default)]
    pub notas: Option<String>,
    pub lineas: Vec<LineaRecetaEntrada>,
}

fn limpio(s: &Option<String>) -> Option<String> {
    s.as_deref().map(str::trim).filter(|x| !x.is_empty()).map(String::from)
}

/// Precio sugerido a partir del costo unitario y el margen deseado, usando
/// la fórmula de margen sobre precio de venta (no sobre costo): margen 50%
/// significa que la mitad del precio de venta es ganancia, no que se cobra
/// 1.5× el costo. Es la convención más común al hablar de "margen" en
/// negocios de comida. Si el margen es 100 o más (no tiene sentido, sería
/// dividir entre cero o negativo), se cae de vuelta al costo tal cual.
fn precio_sugerido(costo_centavos: i64, margen_pct: f64) -> i64 {
    if margen_pct >= 100.0 || margen_pct < 0.0 {
        return costo_centavos;
    }
    (costo_centavos as f64 / (1.0 - margen_pct / 100.0)).round() as i64
}

const COLS_RECETA: &str = "id, nombre, rendimiento_cantidad, rendimiento_unidad,
       margen_deseado_pct, producto_id, notas, creado_en, actualizado_en";

fn fila_receta_base(
    row: &Row,
) -> rusqlite::Result<(String, String, f64, String, f64, Option<String>, Option<String>, String, String)>
{
    Ok((
        row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
        row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?,
    ))
}

const COLS_LINEA: &str = "id, ingrediente_id, nombre_congelado, unidad, cantidad_usada, costo_congelado_centavos";

fn fila_linea(row: &Row) -> rusqlite::Result<RecetaLinea> {
    Ok(RecetaLinea {
        id: row.get(0)?,
        ingrediente_id: row.get(1)?,
        nombre_congelado: row.get(2)?,
        unidad: row.get(3)?,
        cantidad_usada: row.get(4)?,
        costo_congelado_centavos: row.get(5)?,
    })
}

fn lineas_de(con: &Connection, receta_id: &str) -> Result<Vec<RecetaLinea>, String> {
    let sql = format!(
        "SELECT {COLS_LINEA} FROM receta_lineas WHERE receta_id = ?1 ORDER BY orden"
    );
    let mut stmt = con.prepare(&sql).map_err(|e| format!("error al preparar líneas: {e}"))?;
    let filas = stmt
        .query_map(rusqlite::params![receta_id], fila_linea)
        .map_err(|e| format!("error al listar líneas: {e}"))?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer línea: {e}"))?);
    }
    Ok(out)
}

/// Nutrición en VIVO: suma, para cada línea, lo que aporta el ingrediente
/// SEGÚN SUS VALORES ACTUALES en la despensa (no lo congelado). Une por
/// ingrediente_id ignorando `eliminado` a propósito — un ingrediente que se
/// borró de la despensa sigue existiendo como fila (soft delete), así que
/// una receta vieja que lo referenciaba puede seguir mostrando su aporte.
fn nutricion_y_peso(
    con: &Connection,
    lineas: &[RecetaLinea],
) -> Result<(NutricionTotal, f64, Vec<String>), String> {
    let mut total = NutricionTotal::default();
    let mut peso_aprox_g = 0.0;
    let mut sin_nutricion = Vec::new();

    for l in lineas {
        let fila: Option<(String, f64, f64, f64, f64, f64, f64, f64, f64, f64)> = con
            .query_row(
                "SELECT unidad, calorias_kcal, azucares_g, grasas_saturadas_g, grasas_trans_g,
                        sodio_mg, proteinas_g, carbohidratos_g, grasas_totales_g, fibra_g
                 FROM despensa_ingredientes WHERE id = ?1",
                rusqlite::params![l.ingrediente_id],
                |r| {
                    Ok((
                        r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?,
                        r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("error al leer nutrición del ingrediente: {e}"))?;

        let Some((unidad, cal, azu, gsat, gtrans, sodio, prot, carbs, gtot, fibra)) = fila else {
            continue; // ingrediente no encontrado (no debería pasar); se omite su aporte
        };

        // Los 9 campos en cero probablemente significan "nunca se llenó",
        // no "de verdad es cero" (agua sería la única excepción real y
        // legítima). Heurística simple, informativa — no bloquea nada.
        if cal == 0.0 && azu == 0.0 && gsat == 0.0 && gtrans == 0.0 && sodio == 0.0
            && prot == 0.0 && carbs == 0.0 && gtot == 0.0 && fibra == 0.0
        {
            sin_nutricion.push(l.nombre_congelado.clone());
        }

        // Base de los valores nutricionales: por 100 g/ml, o por 1 pieza.
        let factor = if unidad == "pieza" { l.cantidad_usada } else { l.cantidad_usada / 100.0 };

        total.calorias_kcal += cal * factor;
        total.azucares_g += azu * factor;
        total.grasas_saturadas_g += gsat * factor;
        total.grasas_trans_g += gtrans * factor;
        total.sodio_mg += sodio * factor;
        total.proteinas_g += prot * factor;
        total.carbohidratos_g += carbs * factor;
        total.grasas_totales_g += gtot * factor;
        total.fibra_g += fibra * factor;

        if unidad == "g" || unidad == "ml" {
            peso_aprox_g += l.cantidad_usada;
        }
    }

    Ok((total, peso_aprox_g, sin_nutricion))
}

pub fn listar_resumen(con: &Connection) -> Result<Vec<RecetaResumen>, String> {
    let sql = "SELECT r.id, r.nombre, r.rendimiento_cantidad, r.rendimiento_unidad,
                      r.producto_id, r.actualizado_en,
                      COALESCE(SUM(rl.costo_congelado_centavos), 0),
                      COUNT(rl.id)
               FROM recetas r
               LEFT JOIN receta_lineas rl ON rl.receta_id = r.id
               WHERE r.eliminado = 0
               GROUP BY r.id
               ORDER BY r.actualizado_en DESC";
    let mut stmt = con.prepare(sql).map_err(|e| format!("error al preparar recetas: {e}"))?;
    let filas = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let nombre: String = row.get(1)?;
            let rendimiento_cantidad: f64 = row.get(2)?;
            let rendimiento_unidad: String = row.get(3)?;
            let producto_id: Option<String> = row.get(4)?;
            let actualizado_en: String = row.get(5)?;
            let costo_total: i64 = row.get(6)?;
            let num_ingredientes: i64 = row.get(7)?;
            let costo_por_rendimiento = if rendimiento_cantidad > 0.0 {
                (costo_total as f64 / rendimiento_cantidad).round() as i64
            } else {
                costo_total
            };
            Ok(RecetaResumen {
                id, nombre, rendimiento_cantidad, rendimiento_unidad,
                costo_por_rendimiento_centavos: costo_por_rendimiento,
                num_ingredientes, producto_id, actualizado_en,
            })
        })
        .map_err(|e| format!("error al listar recetas: {e}"))?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer receta: {e}"))?);
    }
    Ok(out)
}

pub fn obtener(con: &Connection, id: &str) -> Result<Option<Receta>, String> {
    let sql = format!("SELECT {COLS_RECETA} FROM recetas WHERE eliminado = 0 AND id = ?1");
    let base = con
        .query_row(&sql, rusqlite::params![id], fila_receta_base)
        .optional()
        .map_err(|e| format!("error al leer receta: {e}"))?;
    let Some((id, nombre, rendimiento_cantidad, rendimiento_unidad, margen_deseado_pct,
        producto_id, notas, creado_en, actualizado_en)) = base else {
        return Ok(None);
    };

    let lineas = lineas_de(con, &id)?;
    let costo_total: i64 = lineas.iter().map(|l| l.costo_congelado_centavos).sum();
    let costo_por_rendimiento = if rendimiento_cantidad > 0.0 {
        (costo_total as f64 / rendimiento_cantidad).round() as i64
    } else {
        costo_total
    };
    let precio_sugerido_centavos = precio_sugerido(costo_por_rendimiento, margen_deseado_pct);
    let (nutricion_total, peso_aprox_g, ingredientes_sin_nutricion) = nutricion_y_peso(con, &lineas)?;

    Ok(Some(Receta {
        id, nombre, rendimiento_cantidad, rendimiento_unidad, margen_deseado_pct,
        producto_id, notas, lineas,
        costo_total_centavos: costo_total,
        costo_por_rendimiento_centavos: costo_por_rendimiento,
        precio_sugerido_centavos,
        nutricion_total, peso_aprox_g, ingredientes_sin_nutricion,
        creado_en, actualizado_en,
    }))
}

/// Crea o actualiza una receta Y reemplaza TODAS sus líneas (se borran las
/// viejas y se insertan las nuevas) — mismo patrón que
/// `kits::reemplazar_componentes`. `producto_id` NUNCA se toca aquí: solo lo
/// cambia `crear_producto_desde_receta`, para no desvincular sin querer un
/// producto ya creado con solo editar la receta.
pub fn guardar(con: &Connection, dispositivo_id: &str, d: &NuevaReceta) -> Result<String, String> {
    let nombre = d.nombre.trim();
    if nombre.is_empty() {
        return Err("Ponle un nombre a la receta.".into());
    }
    if d.lineas.is_empty() {
        return Err("Agrega al menos un ingrediente a la receta.".into());
    }
    if d.rendimiento_cantidad <= 0.0 {
        return Err("El rendimiento debe ser mayor a cero.".into());
    }
    for l in &d.lineas {
        if l.cantidad_usada <= 0.0 {
            return Err("La cantidad de cada ingrediente debe ser mayor a cero.".into());
        }
    }

    let ts = ahora();
    let es_nuevo = d.id.trim().is_empty();
    let id = if es_nuevo { nuevo_id() } else { d.id.clone() };

    if es_nuevo {
        con.execute(
            "INSERT INTO recetas
               (id, nombre, rendimiento_cantidad, rendimiento_unidad, margen_deseado_pct,
                notas, eliminado, creado_en, actualizado_en, dispositivo_id)
             VALUES (?1,?2,?3,?4,?5,?6,0,?7,?7,?8)",
            rusqlite::params![
                id, nombre, d.rendimiento_cantidad, d.rendimiento_unidad.trim(),
                d.margen_deseado_pct, limpio(&d.notas), ts, dispositivo_id,
            ],
        )
        .map_err(|e| format!("error al crear la receta: {e}"))?;
    } else {
        let n = con
            .execute(
                "UPDATE recetas SET
                   nombre=?2, rendimiento_cantidad=?3, rendimiento_unidad=?4,
                   margen_deseado_pct=?5, notas=?6, actualizado_en=?7
                 WHERE id=?1 AND eliminado=0",
                rusqlite::params![
                    id, nombre, d.rendimiento_cantidad, d.rendimiento_unidad.trim(),
                    d.margen_deseado_pct, limpio(&d.notas), ts,
                ],
            )
            .map_err(|e| format!("error al actualizar la receta: {e}"))?;
        if n == 0 {
            return Err("No se encontró la receta.".into());
        }
    }

    // Reemplazar líneas: borrar todas las anteriores, insertar las nuevas.
    con.execute("DELETE FROM receta_lineas WHERE receta_id = ?1", rusqlite::params![id])
        .map_err(|e| format!("error al limpiar líneas anteriores: {e}"))?;

    for (i, entrada) in d.lineas.iter().enumerate() {
        let ingrediente = despensa::obtener(con, &entrada.ingrediente_id)?
            .ok_or_else(|| "Un ingrediente de la receta ya no existe en la despensa.".to_string())?;
        let costo_calculado = (ingrediente.costo_por_unidad_centavos * entrada.cantidad_usada).round() as i64;
        let costo_final = entrada.costo_manual_centavos.unwrap_or(costo_calculado).max(0);
        let linea_id = nuevo_id();
        con.execute(
            "INSERT INTO receta_lineas
               (id, receta_id, ingrediente_id, nombre_congelado, unidad, cantidad_usada,
                costo_congelado_centavos, orden, creado_en, actualizado_en)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            rusqlite::params![
                linea_id, id, ingrediente.id, ingrediente.nombre, ingrediente.unidad,
                entrada.cantidad_usada, costo_final, i as i64, ts,
            ],
        )
        .map_err(|e| format!("error al guardar línea de receta: {e}"))?;
    }

    Ok(id)
}

pub fn eliminar(con: &Connection, id: &str) -> Result<(), String> {
    let n = con
        .execute(
            "UPDATE recetas SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1",
            rusqlite::params![id, ahora()],
        )
        .map_err(|e| format!("error al eliminar la receta: {e}"))?;
    if n == 0 {
        return Err("No se encontró la receta.".into());
    }
    Ok(())
}

/// Manda la receta al catálogo: crea un producto de venta normal (mismo
/// camino que dar de alta un producto a mano en Inventario) con el costo
/// por rendimiento ya calculado. Falla si la receta ya tiene un producto
/// vinculado — evita crear duplicados sin querer; para eso ya existe editar
/// el producto directo en Inventario.
///
/// También crea automáticamente un perfil de etiqueta NOM-051 vinculado,
/// con la nutrición de la receta convertida a "por 100 g" — solo si hay
/// suficiente peso pesable para que esa conversión tenga sentido (si toda
/// la receta es por pieza, no hay base de 100 g de la cual partir, y no se
/// inventa un número). `anade_azucares`/`anade_grasas`/`anade_sodio` se
/// dejan en `false` A PROPÓSITO: es una determinación legal de la norma que
/// no se puede inferir solo de una lista de ingredientes — se deja anotado
/// en las notas del perfil para que el dueño lo revise a mano.
pub fn crear_producto_desde_receta(
    con: &Connection,
    dispositivo_id: &str,
    usuario_pos_id: &str,
    receta_id: &str,
    precio_venta_centavos: Option<i64>,
    categoria_id: Option<String>,
) -> Result<String, String> {
    let receta = obtener(con, receta_id)?.ok_or("No se encontró la receta.")?;
    if receta.producto_id.is_some() {
        return Err("Esta receta ya tiene un producto de venta vinculado. Edítalo desde Inventario.".into());
    }
    let precio = precio_venta_centavos.unwrap_or(receta.precio_sugerido_centavos).max(0);

    let nuevo = NuevoProducto {
        codigo_barras: None,
        nombre: receta.nombre.clone(),
        categoria_id,
        precio_venta_centavos: precio,
        costo_centavos: Some(receta.costo_por_rendimiento_centavos),
        precio_mayoreo_centavos: None,
        cantidad_mayoreo: None,
        iva_tasa: 0,
        controla_stock: false,
        stock_inicial: 0.0,
        unidad: "pieza".to_string(),
        stock_minimo: 0.0,
        favorito: false,
        imagen_ruta: None,
        es_kit: false,
        componentes: Vec::new(),
    };
    let producto_id = productos::crear(con, dispositivo_id, usuario_pos_id, &nuevo)?;

    con.execute(
        "UPDATE recetas SET producto_id = ?2, actualizado_en = ?3 WHERE id = ?1",
        rusqlite::params![receta_id, producto_id, ahora()],
    )
    .map_err(|e| format!("error al vincular el producto a la receta: {e}"))?;

    // Perfil de etiqueta automático — best effort. Si algo falla aquí, el
    // producto YA se creó (eso es lo importante); no se debe perder por un
    // problema al generar la etiqueta.
    if receta.peso_aprox_g > 0.0 {
        let factor = 100.0 / receta.peso_aprox_g;
        let n = &receta.nutricion_total;
        let aviso_faltantes = if receta.ingredientes_sin_nutricion.is_empty() {
            String::new()
        } else {
            format!(
                " Ingredientes sin datos nutricionales (probablemente subestiman el total): {}.",
                receta.ingredientes_sin_nutricion.join(", ")
            )
        };
        let perfil = super::etiquetas::PerfilEtiqueta {
            id: String::new(),
            producto_id: Some(producto_id.clone()),
            nombre: receta.nombre.clone(),
            tipo: "solido".to_string(),
            calorias_kcal: n.calorias_kcal * factor,
            azucares_g: n.azucares_g * factor,
            grasas_saturadas_g: n.grasas_saturadas_g * factor,
            grasas_trans_g: n.grasas_trans_g * factor,
            sodio_mg: n.sodio_mg * factor,
            proteinas_g: n.proteinas_g * factor,
            carbohidratos_g: n.carbohidratos_g * factor,
            grasas_totales_g: n.grasas_totales_g * factor,
            fibra_g: n.fibra_g * factor,
            anade_azucares: false,
            anade_grasas: false,
            anade_sodio: false,
            contiene_cafeina: false,
            contiene_edulcorantes: false,
            exencion: "ninguna".to_string(),
            area_cm2: 0.0,
            denominacion: None,
            marca: None,
            ingredientes: None,
            alergenos: None,
            contenido_neto: None,
            porcion: None,
            porciones_envase: None,
            responsable_nombre: None,
            responsable_domicilio: None,
            lote: None,
            caducidad: None,
            conservacion: None,
            pais_origen: Some("Hecho en México".to_string()),
            notas: Some(format!(
                "Nutrición calculada automáticamente desde la receta \"{}\" (por 100 g, a partir de los ingredientes pesables). \
                 Revisa manualmente si el producto AÑADE azúcares, grasas o sodio antes de calcular los sellos — eso no se infiere solo.{}",
                receta.nombre, aviso_faltantes
            )),
            actualizado_en: String::new(),
        };
        if let Err(e) = super::etiquetas::guardar(con, dispositivo_id, &perfil) {
            eprintln!("[recetas] no se pudo crear el perfil de etiqueta automático: {e}");
        }
    }

    Ok(producto_id)
}
