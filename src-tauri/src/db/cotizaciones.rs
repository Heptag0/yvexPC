//! Cotizaciones — carrito armado sin cobrar, con validez y conversión directa
//! a venta. Pensado para giros donde "cuánto me costaría" es el primer paso
//! (construcción, materiales, servicios), no solo abarrotes.
//!
//! ⚠️ LOCAL-ONLY (v1): no se encola a `cola_sync` todavía — mismo punto de
//! partida que tuvieron proveedores y lealtad. La receta para sincronizarlo
//! ya está probada en otros módulos si hace falta después.
//!
//! Dinero SIEMPRE en centavos enteros. Soft delete vía `eliminado`.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::comun::{ahora, nuevo_id};

// ============================================================================
// Tipos
// ============================================================================

#[derive(Debug, Serialize)]
pub struct LineaCotizacion {
    pub id: String,
    pub producto_id: Option<String>,
    pub descripcion: String,
    pub cantidad: f64,
    pub precio_unitario_centavos: i64,
    pub descuento_linea_centavos: i64,
    pub total_linea_centavos: i64,
}

#[derive(Debug, Serialize)]
pub struct Cotizacion {
    pub id: String,
    pub folio: i64,
    pub cliente_nombre: Option<String>,
    pub cliente_telefono: Option<String>,
    pub cliente_correo: Option<String>,
    pub notas: Option<String>,
    pub subtotal_centavos: i64,
    pub descuento_centavos: i64,
    pub total_centavos: i64,
    pub valida_hasta: Option<String>,
    pub estado: String, // "abierta" | "convertida" | "vencida" | "cancelada"
    pub venta_id: Option<String>,
    pub creado_en: String,
    pub actualizado_en: String,
    pub lineas: Vec<LineaCotizacion>,
}

/// Fila resumida para la lista (sin líneas, más ligero).
#[derive(Debug, Serialize)]
pub struct CotizacionResumen {
    pub id: String,
    pub folio: i64,
    pub cliente_nombre: Option<String>,
    pub total_centavos: i64,
    pub valida_hasta: Option<String>,
    pub estado: String,
    pub num_lineas: i64,
    pub creado_en: String,
}

#[derive(Debug, Deserialize)]
pub struct DatosLinea {
    pub producto_id: Option<String>,
    pub descripcion: String,
    pub cantidad: f64,
    pub precio_unitario_centavos: i64,
    pub descuento_linea_centavos: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DatosCotizacion {
    pub cliente_nombre: Option<String>,
    pub cliente_telefono: Option<String>,
    pub cliente_correo: Option<String>,
    pub notas: Option<String>,
    pub valida_hasta: Option<String>,
    pub descuento_centavos: Option<i64>,
    pub lineas: Vec<DatosLinea>,
}

// ============================================================================
// Utilidades internas
// ============================================================================

fn siguiente_folio(con: &Connection) -> Result<i64, String> {
    con.query_row("SELECT COALESCE(MAX(folio), 0) + 1 FROM cotizaciones", [], |r| r.get(0))
        .map_err(|e| format!("error al calcular folio: {e}"))
}

fn totales(lineas: &[DatosLinea], descuento_centavos: i64) -> (i64, i64) {
    let subtotal: i64 = lineas
        .iter()
        .map(|l| {
            let bruto = (l.precio_unitario_centavos as f64 * l.cantidad).round() as i64;
            bruto - l.descuento_linea_centavos.unwrap_or(0)
        })
        .sum();
    let total = (subtotal - descuento_centavos).max(0);
    (subtotal.max(0), total)
}

fn fila_a_linea(row: &Row) -> rusqlite::Result<LineaCotizacion> {
    Ok(LineaCotizacion {
        id: row.get(0)?,
        producto_id: row.get(1)?,
        descripcion: row.get(2)?,
        cantidad: row.get(3)?,
        precio_unitario_centavos: row.get(4)?,
        descuento_linea_centavos: row.get(5)?,
        total_linea_centavos: row.get(6)?,
    })
}

const SELECT_LINEA: &str = "SELECT id, producto_id, descripcion, cantidad,
       precio_unitario_centavos, descuento_linea_centavos, total_linea_centavos
  FROM cotizacion_lineas WHERE cotizacion_id = ?1 ORDER BY creado_en";

fn lineas_de(con: &Connection, cotizacion_id: &str) -> Result<Vec<LineaCotizacion>, String> {
    let mut stmt = con
        .prepare(SELECT_LINEA)
        .map_err(|e| format!("error al preparar líneas: {e}"))?;
    let filas = stmt
        .query_map(rusqlite::params![cotizacion_id], fila_a_linea)
        .map_err(|e| format!("error al listar líneas: {e}"))?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer línea: {e}"))?);
    }
    Ok(out)
}

// ============================================================================
// CRUD
// ============================================================================

pub fn crear(con: &Connection, dispositivo_id: &str, d: &DatosCotizacion) -> Result<Cotizacion, String> {
    if d.lineas.is_empty() {
        return Err("La cotización necesita al menos un producto o concepto.".into());
    }
    let descuento = d.descuento_centavos.unwrap_or(0).max(0);
    let (subtotal, total) = totales(&d.lineas, descuento);

    let id = nuevo_id();
    let ts = ahora();
    let folio = siguiente_folio(con)?;
    let cliente_nombre = d.cliente_nombre.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let cliente_telefono = d.cliente_telefono.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let cliente_correo = d.cliente_correo.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let notas = d.notas.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let valida_hasta = d.valida_hasta.as_deref().map(str::trim).filter(|s| !s.is_empty());

    con.execute(
        "INSERT INTO cotizaciones
           (id, folio, cliente_nombre, cliente_telefono, cliente_correo, notas,
            subtotal_centavos, descuento_centavos, total_centavos, valida_hasta,
            estado, venta_id, eliminado, creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'abierta',NULL,0,?11,?11,?12)",
        rusqlite::params![
            id, folio, cliente_nombre, cliente_telefono, cliente_correo, notas,
            subtotal, descuento, total, valida_hasta, ts, dispositivo_id,
        ],
    )
    .map_err(|e| format!("error al crear cotización: {e}"))?;

    for l in &d.lineas {
        let bruto = (l.precio_unitario_centavos as f64 * l.cantidad).round() as i64;
        let desc_linea = l.descuento_linea_centavos.unwrap_or(0).max(0);
        let total_linea = (bruto - desc_linea).max(0);
        con.execute(
            "INSERT INTO cotizacion_lineas
               (id, cotizacion_id, producto_id, descripcion, cantidad,
                precio_unitario_centavos, descuento_linea_centavos, total_linea_centavos, creado_en)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            rusqlite::params![
                nuevo_id(), id, l.producto_id, l.descripcion.trim(), l.cantidad,
                l.precio_unitario_centavos, desc_linea, total_linea, ts,
            ],
        )
        .map_err(|e| format!("error al agregar línea: {e}"))?;
    }

    obtener(con, &id)?.ok_or_else(|| "No se pudo leer la cotización recién creada.".into())
}

pub fn listar(con: &Connection, filtro: Option<&str>) -> Result<Vec<CotizacionResumen>, String> {
    let filtro_limpio = filtro.map(str::trim).filter(|s| !s.is_empty());
    let base = "SELECT c.id, c.folio, c.cliente_nombre, c.total_centavos, c.valida_hasta, c.estado,
                       (SELECT COUNT(*) FROM cotizacion_lineas WHERE cotizacion_id = c.id), c.creado_en
                  FROM cotizaciones c WHERE c.eliminado = 0";
    let mapear = |row: &Row| -> rusqlite::Result<CotizacionResumen> {
        Ok(CotizacionResumen {
            id: row.get(0)?, folio: row.get(1)?, cliente_nombre: row.get(2)?,
            total_centavos: row.get(3)?, valida_hasta: row.get(4)?, estado: row.get(5)?,
            num_lineas: row.get(6)?, creado_en: row.get(7)?,
        })
    };
    let mut out = Vec::new();
    if let Some(f) = filtro_limpio {
        let sql = format!("{base} AND (lower(c.cliente_nombre) LIKE ?1 OR CAST(c.folio AS TEXT) LIKE ?1) ORDER BY c.creado_en DESC");
        let like = format!("%{}%", f.to_lowercase());
        let mut stmt = con.prepare(&sql).map_err(|e| format!("error al preparar listado: {e}"))?;
        let filas = stmt.query_map(rusqlite::params![like], mapear).map_err(|e| format!("error al listar cotizaciones: {e}"))?;
        for r in filas { out.push(r.map_err(|e| format!("error al leer cotización: {e}"))?); }
    } else {
        let sql = format!("{base} ORDER BY c.creado_en DESC");
        let mut stmt = con.prepare(&sql).map_err(|e| format!("error al preparar listado: {e}"))?;
        let filas = stmt.query_map([], mapear).map_err(|e| format!("error al listar cotizaciones: {e}"))?;
        for r in filas { out.push(r.map_err(|e| format!("error al leer cotización: {e}"))?); }
    }
    Ok(out)
}

pub fn obtener(con: &Connection, id: &str) -> Result<Option<Cotizacion>, String> {
    let fila = con
        .query_row(
            "SELECT id, folio, cliente_nombre, cliente_telefono, cliente_correo, notas,
                    subtotal_centavos, descuento_centavos, total_centavos, valida_hasta,
                    estado, venta_id, creado_en, actualizado_en
               FROM cotizaciones WHERE id = ?1 AND eliminado = 0",
            rusqlite::params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?, row.get::<_, Option<String>>(4)?, row.get::<_, Option<String>>(5)?,
                    row.get::<_, i64>(6)?, row.get::<_, i64>(7)?, row.get::<_, i64>(8)?, row.get::<_, Option<String>>(9)?,
                    row.get::<_, String>(10)?, row.get::<_, Option<String>>(11)?, row.get::<_, String>(12)?, row.get::<_, String>(13)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("error al leer cotización: {e}"))?;

    let Some((id, folio, cliente_nombre, cliente_telefono, cliente_correo, notas,
        subtotal_centavos, descuento_centavos, total_centavos, valida_hasta,
        estado, venta_id, creado_en, actualizado_en)) = fila else {
        return Ok(None);
    };

    let lineas = lineas_de(con, &id)?;
    Ok(Some(Cotizacion {
        id, folio, cliente_nombre, cliente_telefono, cliente_correo, notas,
        subtotal_centavos, descuento_centavos, total_centavos, valida_hasta,
        estado, venta_id, creado_en, actualizado_en, lineas,
    }))
}

pub fn cancelar(con: &Connection, id: &str) -> Result<(), String> {
    let ts = ahora();
    let n = con
        .execute(
            "UPDATE cotizaciones SET estado = 'cancelada', actualizado_en = ?2
              WHERE id = ?1 AND eliminado = 0 AND estado = 'abierta'",
            rusqlite::params![id, ts],
        )
        .map_err(|e| format!("error al cancelar cotización: {e}"))?;
    if n == 0 {
        return Err("Solo se pueden cancelar cotizaciones abiertas.".into());
    }
    Ok(())
}

pub fn eliminar(con: &Connection, id: &str) -> Result<(), String> {
    let ts = ahora();
    let n = con
        .execute(
            "UPDATE cotizaciones SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1",
            rusqlite::params![id, ts],
        )
        .map_err(|e| format!("error al eliminar cotización: {e}"))?;
    if n == 0 {
        return Err("No se encontró la cotización.".into());
    }
    Ok(())
}

/// Marca como vencidas las cotizaciones abiertas cuya `valida_hasta` ya
/// pasó. Se llama al listar (barato: solo actualiza filas, no hay cron).
pub fn marcar_vencidas(con: &Connection, hoy: &str) -> Result<(), String> {
    con.execute(
        "UPDATE cotizaciones SET estado = 'vencida', actualizado_en = ?2
          WHERE estado = 'abierta' AND valida_hasta IS NOT NULL AND valida_hasta < ?1",
        rusqlite::params![hoy, ahora()],
    )
    .map_err(|e| format!("error al marcar cotizaciones vencidas: {e}"))?;
    Ok(())
}

/// Devuelve las líneas de la cotización en el formato que `venta.js` espera
/// para precargar el carrito. NO cobra nada — solo entrega los datos; la
/// venta se registra normal, como cualquier otra, cuando el cajero cobra.
/// Al cobrar exitosamente, el frontend debe llamar a `marcar_convertida`.
pub fn preparar_para_venta(con: &Connection, id: &str) -> Result<Cotizacion, String> {
    let cot = obtener(con, id)?.ok_or("No se encontró la cotización.")?;
    if cot.estado != "abierta" {
        return Err(format!(
            "Esta cotización está {} y no se puede convertir.",
            match cot.estado.as_str() {
                "convertida" => "ya convertida",
                "vencida" => "vencida",
                "cancelada" => "cancelada",
                _ => "en un estado inesperado",
            }
        ));
    }
    Ok(cot)
}

pub fn marcar_convertida(con: &Connection, id: &str, venta_id: &str) -> Result<(), String> {
    let ts = ahora();
    let n = con
        .execute(
            "UPDATE cotizaciones SET estado = 'convertida', venta_id = ?2, actualizado_en = ?3
              WHERE id = ?1 AND estado = 'abierta'",
            rusqlite::params![id, venta_id, ts],
        )
        .map_err(|e| format!("error al marcar cotización convertida: {e}"))?;
    if n == 0 {
        return Err("La cotización ya no estaba abierta (¿otra caja la convirtió primero?).".into());
    }
    Ok(())
}
