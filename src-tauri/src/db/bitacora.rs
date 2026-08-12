//! Registro de movimientos — una sola línea de tiempo para "qué pasó en mi
//! negocio y quién lo hizo": ventas, entradas/mermas/ajustes de stock, y
//! altas/bajas/ediciones de productos.
//!
//! ⚠️ No es una tabla única para todo. `ventas` y `ajustes_inventario` ya
//! existen, ya están completos (usuario, fecha, dispositivo), y duplicarlos
//! aquí los haría dos fuentes de verdad para el mismo hecho — justo lo que
//! este proyecto evita en todos lados (ver costo histórico, nombre_congelado
//! en recetas). Esta tabla `bitacora` SOLO guarda lo que de verdad no tiene
//! dónde más quedar: alta/edición/baja de productos del catálogo.
//!
//! `listar()` es quien arma la vista unificada, leyendo de las tres fuentes
//! y devolviendo una sola lista ordenada — el frontend nunca necesita saber
//! que son fuentes distintas.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use super::comun::{ahora, nuevo_id};

#[derive(Debug, Serialize)]
pub struct MovimientoUnificado {
    pub id: String,
    pub tipo: String,
    pub descripcion: String,
    pub usuario_nombre: String,
    pub dispositivo_id: String,
    pub creado_en: String,
    /// Monto en centavos cuando aplica (ventas). None para ajustes/catálogo.
    pub monto_centavos: Option<i64>,
    pub entidad_tipo: Option<String>,
    pub entidad_id: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct FiltroMovimientos {
    /// Fecha ISO (YYYY-MM-DD), inclusive. None = sin límite inferior.
    #[serde(default)]
    pub desde: Option<String>,
    /// Fecha ISO (YYYY-MM-DD), inclusive. None = sin límite superior.
    #[serde(default)]
    pub hasta: Option<String>,
    /// "venta" | "stock" | "catalogo" | None (todos). "stock" agrupa
    /// entrada/merma/ajuste_conteo; "catalogo" agrupa las 3 del bitacora.
    #[serde(default)]
    pub categoria: Option<String>,
}

/// Registra un evento de catálogo (alta/edición/baja de producto). Best
/// effort a propósito: si falla, se registra en el log del servidor pero
/// NUNCA tumba la operación real (crear un producto no debe fallar porque
/// falló su rastro de auditoría — el producto ya se guardó, eso es lo que
/// importa primero).
pub fn registrar(
    con: &Connection,
    tipo: &str,
    descripcion: &str,
    entidad_tipo: Option<&str>,
    entidad_id: Option<&str>,
    usuario_pos_id: &str,
    dispositivo_id: &str,
) {
    let nombre: String = con
        .query_row(
            "SELECT nombre FROM usuarios_pos WHERE id = ?1",
            rusqlite::params![usuario_pos_id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "Usuario desconocido".to_string());

    let id = nuevo_id();
    let ts = ahora();
    let resultado = con.execute(
        "INSERT INTO bitacora
           (id, tipo, descripcion, entidad_tipo, entidad_id, usuario_pos_id,
            usuario_nombre, creado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![id, tipo, descripcion, entidad_tipo, entidad_id, usuario_pos_id, nombre, ts, dispositivo_id],
    );
    if let Err(e) = resultado {
        eprintln!("[bitacora] no se pudo registrar '{tipo}': {e}");
    }
}

/// Vista unificada: une bitacora + ajustes_inventario + ventas, ordenada por
/// fecha descendente (lo más reciente primero). Cada fuente se consulta por
/// separado y se combina en Rust — más simple y legible que forzar un UNION
/// SQL entre tres tablas con formas distintas.
pub fn listar(con: &Connection, f: &FiltroMovimientos) -> Result<Vec<MovimientoUnificado>, String> {
    let incluir_catalogo = f.categoria.is_none() || f.categoria.as_deref() == Some("catalogo");
    let incluir_stock = f.categoria.is_none() || f.categoria.as_deref() == Some("stock");
    let incluir_ventas = f.categoria.is_none() || f.categoria.as_deref() == Some("venta");

    let mut out = Vec::new();

    if incluir_catalogo {
        let sql = "SELECT id, tipo, descripcion, usuario_nombre, dispositivo_id, creado_en,
                          entidad_tipo, entidad_id
                   FROM bitacora
                   WHERE (?1 IS NULL OR date(creado_en) >= date(?1))
                     AND (?2 IS NULL OR date(creado_en) <= date(?2))
                   ORDER BY creado_en DESC LIMIT 300";
        let mut stmt = con.prepare(sql).map_err(|e| format!("error al preparar bitácora: {e}"))?;
        let filas = stmt
            .query_map(rusqlite::params![f.desde, f.hasta], |r| {
                Ok(MovimientoUnificado {
                    id: r.get(0)?,
                    tipo: r.get(1)?,
                    descripcion: r.get(2)?,
                    usuario_nombre: r.get(3)?,
                    dispositivo_id: r.get(4)?,
                    creado_en: r.get(5)?,
                    monto_centavos: None,
                    entidad_tipo: r.get(6)?,
                    entidad_id: r.get(7)?,
                })
            })
            .map_err(|e| format!("error al listar bitácora: {e}"))?;
        for fila in filas {
            out.push(fila.map_err(|e| format!("error al leer bitácora: {e}"))?);
        }
    }

    if incluir_stock {
        let sql = "SELECT a.id, a.tipo, a.cantidad, a.stock_resultante, a.motivo,
                          COALESCE(u.nombre, 'Usuario desconocido'), a.dispositivo_id, a.creado_en,
                          a.producto_id, COALESCE(p.nombre, 'Producto eliminado')
                   FROM ajustes_inventario a
                   LEFT JOIN usuarios_pos u ON u.id = a.usuario_pos_id
                   LEFT JOIN productos p ON p.id = a.producto_id
                   WHERE (?1 IS NULL OR date(a.creado_en) >= date(?1))
                     AND (?2 IS NULL OR date(a.creado_en) <= date(?2))
                   ORDER BY a.creado_en DESC LIMIT 300";
        let mut stmt = con.prepare(sql).map_err(|e| format!("error al preparar ajustes: {e}"))?;
        let filas = stmt
            .query_map(rusqlite::params![f.desde, f.hasta], |r| {
                let tipo: String = r.get(1)?;
                let cantidad: f64 = r.get(2)?;
                let motivo: Option<String> = r.get(4)?;
                let nombre_prod: String = r.get(9)?;
                let etiqueta = match tipo.as_str() {
                    "entrada" => format!("Entrada de {} de {}", fmt_cant(cantidad.abs()), nombre_prod),
                    "merma" => format!("Merma de {} de {}", fmt_cant(cantidad.abs()), nombre_prod),
                    "ajuste_conteo" => format!("Conteo físico: {} ajustado a {}", nombre_prod, fmt_cant(r.get::<_, f64>(3)?)),
                    _ => format!("Ajuste de {}", nombre_prod),
                };
                let descripcion = match &motivo {
                    Some(m) if !m.trim().is_empty() => format!("{etiqueta} — {m}"),
                    _ => etiqueta,
                };
                Ok(MovimientoUnificado {
                    id: r.get(0)?,
                    tipo,
                    descripcion,
                    usuario_nombre: r.get(5)?,
                    dispositivo_id: r.get(6)?,
                    creado_en: r.get(7)?,
                    monto_centavos: None,
                    entidad_tipo: Some("producto".to_string()),
                    entidad_id: r.get(8)?,
                })
            })
            .map_err(|e| format!("error al listar ajustes: {e}"))?;
        for fila in filas {
            out.push(fila.map_err(|e| format!("error al leer ajuste: {e}"))?);
        }
    }

    if incluir_ventas {
        let sql = "SELECT v.id, v.folio, v.total_centavos, v.estado,
                          COALESCE(u.nombre, 'Usuario desconocido'), v.dispositivo_id, v.creado_en
                   FROM ventas v
                   LEFT JOIN usuarios_pos u ON u.id = v.usuario_pos_id
                   WHERE (?1 IS NULL OR date(v.creado_en) >= date(?1))
                     AND (?2 IS NULL OR date(v.creado_en) <= date(?2))
                   ORDER BY v.creado_en DESC LIMIT 300";
        let mut stmt = con.prepare(sql).map_err(|e| format!("error al preparar ventas: {e}"))?;
        let filas = stmt
            .query_map(rusqlite::params![f.desde, f.hasta], |r| {
                let folio: i64 = r.get(1)?;
                let total: i64 = r.get(2)?;
                let estado: String = r.get(3)?;
                let descripcion = if estado == "cancelada" {
                    format!("Venta #{folio} cancelada")
                } else {
                    format!("Venta #{folio}")
                };
                Ok(MovimientoUnificado {
                    id: r.get(0)?,
                    tipo: "venta".to_string(),
                    descripcion,
                    usuario_nombre: r.get(4)?,
                    dispositivo_id: r.get(5)?,
                    creado_en: r.get(6)?,
                    monto_centavos: Some(total),
                    entidad_tipo: Some("venta".to_string()),
                    entidad_id: Some(r.get::<_, String>(0)?),
                })
            })
            .map_err(|e| format!("error al listar ventas: {e}"))?;
        for fila in filas {
            out.push(fila.map_err(|e| format!("error al leer venta: {e}"))?);
        }
    }

    out.sort_by(|a, b| b.creado_en.cmp(&a.creado_en));
    // Cada fuente ya trae su propio LIMIT 300; al unir hasta 3 fuentes nos
    // quedamos con las 300 más recientes en total, no hasta 900.
    out.truncate(300);
    Ok(out)
}

fn fmt_cant(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        format!("{n:.2}")
    }
}
