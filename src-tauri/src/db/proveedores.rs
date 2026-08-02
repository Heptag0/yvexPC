//! Proveedores y compras — quién te surte y cada surtido registrado.
//!
//! Espejo de la lógica del móvil (`src/base/proveedores.ts` + `visitas.ts`).
//! El PC no tiene escáner de tickets todavía (foto-a-inventario es
//! post-lanzamiento), así que aquí toda compra nace con `origen = "manual"`.
//!
//! ✅ SINCRONIZADO: proveedores y compras son compartidos por el negocio
//! (igual que categorías/productos). Cada alta/edición/baja se encola con
//! `encolar_sync`; el servidor las trae de vuelta en `/sync/bajar` y
//! `sync_pull.rs` las aplica localmente. No hay problema de concurrencia
//! aquí (nadie "resta" un proveedor), a diferencia de los puntos de lealtad.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::comun::{ahora, encolar_sync, nuevo_id};
use super::visitas::{etiqueta_aviso, proxima_fecha_visita};

// ============================================================================
// Tipos
// ============================================================================

#[derive(Debug, Serialize)]
pub struct Proveedor {
    pub id: String,
    pub nombre: String,
    pub contacto: Option<String>,
    pub telefono: Option<String>,
    pub notas: Option<String>,
    /// Días de visita (0 = domingo … 6 = sábado). None = sin rutina.
    pub dias_visita: Option<Vec<i64>>,
    pub creado_en: String,
    pub actualizado_en: String,
}

/// Proveedor con su resumen de compras (para la lista y los avisos).
#[derive(Debug, Serialize)]
pub struct ProveedorResumen {
    #[serde(flatten)]
    pub proveedor: Proveedor,
    pub total_compras: i64,
    pub ultimo_ticket_centavos: Option<i64>,
    pub ultima_fecha: Option<String>,
    pub ticket_promedio_centavos: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct Compra {
    pub id: String,
    pub proveedor_id: Option<String>,
    pub proveedor_nombre: Option<String>,
    pub folio: Option<String>,
    /// "AAAA-MM-DD" (fecha del ticket o elegida). None = sin fecha impresa.
    pub fecha: Option<String>,
    pub tipo: String, // "normal" | "preventa"
    pub total_centavos: i64,
    pub num_lineas: i64,
    pub origen: String, // "manual" | "escaner"
    pub notas: Option<String>,
    pub creado_en: String,
    pub actualizado_en: String,
}

/// Aviso de visita para la tarjeta de Inicio.
#[derive(Debug, Serialize)]
pub struct AvisoVisita {
    pub proveedor: Proveedor,
    pub fecha_visita: String,
    pub etiqueta: String, // "Hoy" | "Mañana"
    pub ultimo_ticket_centavos: Option<i64>,
    pub ticket_promedio_centavos: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DatosProveedor {
    pub nombre: String,
    pub contacto: Option<String>,
    pub telefono: Option<String>,
    pub notas: Option<String>,
    pub dias_visita: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct DatosCompra {
    /// Si se conoce el id (compra registrada desde el historial de un
    /// proveedor ya elegido), se usa directo.
    pub proveedor_id: Option<String>,
    /// Si no hay id, se busca por nombre normalizado — y si no existe, SE
    /// CREA con ese nombre. Permite escribir "Coca-Cola" sin tener que dar
    /// de alta al proveedor primero.
    pub proveedor_nombre: Option<String>,
    pub folio: Option<String>,
    pub fecha: Option<String>,
    pub tipo: Option<String>, // "normal" | "preventa"; default "normal"
    pub total_centavos: i64,
    pub num_lineas: Option<i64>,
    pub notas: Option<String>,
}

// ============================================================================
// Utilidades internas
// ============================================================================

/// Nombre normalizado para el MATCH (no se guarda): minúsculas, sin acentos,
/// sin espacios dobles, trim. Espejo de `normalizarNombre` del móvil.
pub fn normalizar_nombre(nombre: &str) -> String {
    let sin_acentos: String = nombre
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            otro => otro,
        })
        .collect();
    let normalizado: String = sin_acentos
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    normalizado.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn dias_a_json(dias: &Option<Vec<i64>>) -> Option<String> {
    let d = dias.as_ref()?;
    let mut limpios: Vec<i64> = d.iter().copied().filter(|n| (0..=6).contains(n)).collect();
    limpios.sort_unstable();
    limpios.dedup();
    if limpios.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&limpios).unwrap_or_default())
    }
}

fn json_a_dias(texto: &Option<String>) -> Option<Vec<i64>> {
    let t = texto.as_ref()?;
    let arr: Vec<i64> = serde_json::from_str(t).ok()?;
    let limpios: Vec<i64> = arr.into_iter().filter(|n| (0..=6).contains(n)).collect();
    if limpios.is_empty() {
        None
    } else {
        Some(limpios)
    }
}

/// Arma un `Proveedor` a partir de las primeras 8 columnas de la consulta
/// (id, nombre, contacto, telefono, notas, dias_visita, creado_en, actualizado_en).
fn fila_a_proveedor(row: &Row) -> rusqlite::Result<Proveedor> {
    let dias_texto: Option<String> = row.get(5)?;
    Ok(Proveedor {
        id: row.get(0)?,
        nombre: row.get(1)?,
        contacto: row.get(2)?,
        telefono: row.get(3)?,
        notas: row.get(4)?,
        dias_visita: json_a_dias(&dias_texto),
        creado_en: row.get(6)?,
        actualizado_en: row.get(7)?,
    })
}

fn fila_a_resumen(row: &Row) -> rusqlite::Result<ProveedorResumen> {
    Ok(ProveedorResumen {
        proveedor: fila_a_proveedor(row)?,
        total_compras: row.get(8)?,
        ultimo_ticket_centavos: row.get(9)?,
        ultima_fecha: row.get(10)?,
        ticket_promedio_centavos: row.get(11)?,
    })
}

const SELECT_RESUMEN: &str = "SELECT p.id, p.nombre, p.contacto, p.telefono, p.notas, p.dias_visita,
       p.creado_en, p.actualizado_en,
       (SELECT COUNT(*) FROM compras c WHERE c.proveedor_id = p.id AND c.eliminado = 0),
       (SELECT c.total_centavos FROM compras c WHERE c.proveedor_id = p.id AND c.eliminado = 0
          ORDER BY COALESCE(c.fecha, c.creado_en) DESC, c.creado_en DESC LIMIT 1),
       (SELECT COALESCE(c.fecha, c.creado_en) FROM compras c WHERE c.proveedor_id = p.id AND c.eliminado = 0
          ORDER BY COALESCE(c.fecha, c.creado_en) DESC, c.creado_en DESC LIMIT 1),
       (SELECT CAST(ROUND(AVG(c.total_centavos)) AS INTEGER) FROM compras c
          WHERE c.proveedor_id = p.id AND c.eliminado = 0)
  FROM proveedores p";

// ============================================================================
// CRUD de proveedores
// ============================================================================

/// Lista proveedores activos con su resumen de compras, por nombre.
/// `filtro` busca por nombre (contiene, insensible a mayúsculas).
pub fn listar(con: &Connection, filtro: Option<&str>) -> Result<Vec<ProveedorResumen>, String> {
    let filtro_limpio = filtro.map(str::trim).filter(|s| !s.is_empty());
    let mut sql = format!("{SELECT_RESUMEN} WHERE p.eliminado = 0");
    if filtro_limpio.is_some() {
        sql.push_str(" AND lower(p.nombre) LIKE ?1");
    }
    sql.push_str(" ORDER BY p.nombre COLLATE NOCASE");

    let mut stmt = con
        .prepare(&sql)
        .map_err(|e| format!("error al preparar listado de proveedores: {e}"))?;

    let mut out = Vec::new();
    if let Some(f) = filtro_limpio {
        let like = format!("%{}%", f.to_lowercase());
        let filas = stmt
            .query_map(rusqlite::params![like], fila_a_resumen)
            .map_err(|e| format!("error al listar proveedores: {e}"))?;
        for r in filas {
            out.push(r.map_err(|e| format!("error al leer proveedor: {e}"))?);
        }
    } else {
        let filas = stmt
            .query_map([], fila_a_resumen)
            .map_err(|e| format!("error al listar proveedores: {e}"))?;
        for r in filas {
            out.push(r.map_err(|e| format!("error al leer proveedor: {e}"))?);
        }
    }
    Ok(out)
}

pub fn obtener(con: &Connection, id: &str) -> Result<Option<ProveedorResumen>, String> {
    let sql = format!("{SELECT_RESUMEN} WHERE p.id = ?1 AND p.eliminado = 0");
    con.query_row(&sql, rusqlite::params![id], fila_a_resumen)
        .optional()
        .map_err(|e| format!("error al leer proveedor: {e}"))
}

/// Encola el estado ACTUAL completo del proveedor (tras crear/editar/borrar).
/// Un solo punto para armar el payload evita que se nos olvide un campo en
/// alguna de las tres operaciones.
fn encolar_proveedor(
    con: &Connection,
    id: &str,
    nombre: &str,
    contacto: &Option<String>,
    telefono: &Option<String>,
    notas: &Option<String>,
    dias_json: &Option<String>,
    eliminado: bool,
    creado_en: &str,
    actualizado_en: &str,
    operacion: &str,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "id": id, "nombre": nombre, "contacto": contacto, "telefono": telefono,
        "notas": notas, "dias_visita": dias_json, "eliminado": eliminado as i64,
        "creado_en": creado_en, "actualizado_en": actualizado_en,
    });
    encolar_sync(con, "proveedores", id, operacion, &payload)
        .map_err(|e| format!("error al encolar proveedor: {e}"))
}

pub fn crear(con: &Connection, dispositivo_id: &str, d: &DatosProveedor) -> Result<Proveedor, String> {
    let nombre = d.nombre.trim();
    if nombre.is_empty() {
        return Err("El nombre del proveedor no puede estar vacío.".into());
    }
    let id = nuevo_id();
    let ts = ahora();
    let contacto = d.contacto.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let telefono = d.telefono.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let notas = d.notas.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let dias_json = dias_a_json(&d.dias_visita);

    con.execute(
        "INSERT INTO proveedores
           (id, nombre, contacto, telefono, notas, dias_visita, eliminado,
            creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,0,?7,?7,?8)",
        rusqlite::params![id, nombre, contacto, telefono, notas, dias_json, ts, dispositivo_id],
    )
    .map_err(|e| format!("error al crear proveedor: {e}"))?;

    encolar_proveedor(con, &id, nombre, &contacto, &telefono, &notas, &dias_json, false, &ts, &ts, "insert")?;

    Ok(Proveedor {
        id,
        nombre: nombre.to_string(),
        contacto,
        telefono,
        notas,
        dias_visita: json_a_dias(&dias_json),
        creado_en: ts.clone(),
        actualizado_en: ts,
    })
}

pub fn editar(con: &Connection, id: &str, d: &DatosProveedor) -> Result<(), String> {
    let nombre = d.nombre.trim();
    if nombre.is_empty() {
        return Err("El nombre del proveedor no puede estar vacío.".into());
    }
    let ts = ahora();
    let contacto = d.contacto.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let telefono = d.telefono.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let notas = d.notas.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let dias_json = dias_a_json(&d.dias_visita);

    let n = con
        .execute(
            "UPDATE proveedores
                SET nombre = ?2, contacto = ?3, telefono = ?4, notas = ?5,
                    dias_visita = ?6, actualizado_en = ?7
              WHERE id = ?1 AND eliminado = 0",
            rusqlite::params![id, nombre, contacto, telefono, notas, dias_json, ts],
        )
        .map_err(|e| format!("error al editar proveedor: {e}"))?;
    if n == 0 {
        return Err("No se encontró el proveedor.".into());
    }

    // creado_en no cambia; lo leemos para el payload (el servidor lo ignora
    // en un UPDATE, pero mantiene la forma consistente con el insert).
    let creado_en: String = con
        .query_row("SELECT creado_en FROM proveedores WHERE id = ?1", rusqlite::params![id], |r| r.get(0))
        .unwrap_or_else(|_| ts.clone());

    encolar_proveedor(con, id, nombre, &contacto, &telefono, &notas, &dias_json, false, &creado_en, &ts, "update")?;
    Ok(())
}

/// Baja suave. Las compras ya registradas conservan su snapshot del nombre,
/// así que el historial no se pierde ni queda huérfano de contexto.
pub fn eliminar(con: &Connection, id: &str) -> Result<(), String> {
    let ts = ahora();
    let n = con
        .execute(
            "UPDATE proveedores SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1 AND eliminado = 0",
            rusqlite::params![id, ts],
        )
        .map_err(|e| format!("error al eliminar proveedor: {e}"))?;
    if n == 0 {
        return Err("No se encontró el proveedor.".into());
    }
    // Payload mínimo: el servidor solo necesita id + eliminado + actualizado_en
    // para un update parcial (menos de la mitad de las columnas => UPDATE puro).
    let payload = serde_json::json!({ "id": id, "eliminado": 1, "actualizado_en": ts });
    encolar_sync(con, "proveedores", id, "update", &payload)
        .map_err(|e| format!("error al encolar baja de proveedor: {e}"))?;
    Ok(())
}

/// Busca un proveedor por nombre normalizado; si no existe, LO CREA con ese
/// nombre (tal como vino, bonito) y devuelve el id. Así se puede registrar
/// una compra escribiendo solo "Bimbo" sin tener que darlo de alta antes.
pub fn buscar_o_crear_por_nombre(
    con: &Connection,
    dispositivo_id: &str,
    nombre: &str,
) -> Result<String, String> {
    let limpio = nombre.trim();
    if limpio.is_empty() {
        return Err("Nombre de proveedor vacío.".into());
    }
    let clave = normalizar_nombre(limpio);
    let mut stmt = con
        .prepare("SELECT id, nombre FROM proveedores WHERE eliminado = 0")
        .map_err(|e| format!("error al buscar proveedor: {e}"))?;
    let filas = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| format!("error al buscar proveedor: {e}"))?;
    for f in filas {
        let (id, nom) = f.map_err(|e| format!("error al leer proveedor: {e}"))?;
        if normalizar_nombre(&nom) == clave {
            return Ok(id);
        }
    }
    let creado = crear(
        con,
        dispositivo_id,
        &DatosProveedor {
            nombre: limpio.to_string(),
            contacto: None,
            telefono: None,
            notas: None,
            dias_visita: None,
        },
    )?;
    Ok(creado.id)
}

// ============================================================================
// Compras
// ============================================================================

/// Registra una compra manual. Si hay nombre de proveedor y no hay id, lo
/// busca o crea (match por nombre normalizado). Si no hay ni id ni nombre,
/// la compra queda sin proveedor: histórico general sin dueño.
pub fn registrar_compra(con: &Connection, dispositivo_id: &str, d: &DatosCompra) -> Result<String, String> {
    if d.total_centavos < 0 {
        return Err("El total de la compra no puede ser negativo.".into());
    }

    let mut proveedor_id = d.proveedor_id.clone();
    let mut proveedor_nombre = d
        .proveedor_nombre
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);

    if proveedor_id.is_none() {
        if let Some(nombre) = &proveedor_nombre {
            proveedor_id = Some(buscar_o_crear_por_nombre(con, dispositivo_id, nombre)?);
        }
    } else if proveedor_nombre.is_none() {
        proveedor_nombre = con
            .query_row(
                "SELECT nombre FROM proveedores WHERE id = ?1",
                rusqlite::params![proveedor_id.as_deref().unwrap()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("error al leer proveedor: {e}"))?;
    }

    let id = nuevo_id();
    let ts = ahora();
    let folio = d.folio.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let fecha = d.fecha.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let tipo = match d.tipo.as_deref() {
        Some("preventa") => "preventa",
        _ => "normal",
    };
    let notas = d.notas.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let num_lineas = d.num_lineas.unwrap_or(0).max(0);

    con.execute(
        "INSERT INTO compras
           (id, proveedor_id, proveedor_nombre, folio, fecha, tipo, total_centavos,
            num_lineas, origen, notas, eliminado, creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'manual',?9,0,?10,?10,?11)",
        rusqlite::params![
            id, proveedor_id, proveedor_nombre, folio, fecha, tipo,
            d.total_centavos, num_lineas, notas, ts, dispositivo_id,
        ],
    )
    .map_err(|e| format!("error al registrar compra: {e}"))?;

    let payload = serde_json::json!({
        "id": id, "proveedor_id": proveedor_id, "proveedor_nombre": proveedor_nombre,
        "folio": folio, "fecha": fecha, "tipo": tipo, "total_centavos": d.total_centavos,
        "num_lineas": num_lineas, "origen": "manual", "notas": notas,
        "eliminado": 0, "creado_en": ts, "actualizado_en": ts,
    });
    encolar_sync(con, "compras", &id, "insert", &payload)
        .map_err(|e| format!("error al encolar compra: {e}"))?;

    Ok(id)
}

fn fila_a_compra(row: &Row) -> rusqlite::Result<Compra> {
    Ok(Compra {
        id: row.get(0)?,
        proveedor_id: row.get(1)?,
        proveedor_nombre: row.get(2)?,
        folio: row.get(3)?,
        fecha: row.get(4)?,
        tipo: row.get(5)?,
        total_centavos: row.get(6)?,
        num_lineas: row.get(7)?,
        origen: row.get(8)?,
        notas: row.get(9)?,
        creado_en: row.get(10)?,
        actualizado_en: row.get(11)?,
    })
}

const SELECT_COMPRA: &str = "SELECT id, proveedor_id, proveedor_nombre, folio, fecha, tipo,
       total_centavos, num_lineas, origen, notas, creado_en, actualizado_en
  FROM compras WHERE eliminado = 0";

/// Historial de compras de un proveedor (o de todos si `proveedor_id` es
/// None), descendente por fecha (fecha impresa del ticket, o creación).
pub fn historial_compras(con: &Connection, proveedor_id: Option<&str>) -> Result<Vec<Compra>, String> {
    let orden = " ORDER BY COALESCE(fecha, creado_en) DESC, creado_en DESC";
    let mut out = Vec::new();
    if let Some(pid) = proveedor_id {
        let sql = format!("{SELECT_COMPRA} AND proveedor_id = ?1{orden}");
        let mut stmt = con
            .prepare(&sql)
            .map_err(|e| format!("error al preparar historial: {e}"))?;
        let filas = stmt
            .query_map(rusqlite::params![pid], fila_a_compra)
            .map_err(|e| format!("error al listar compras: {e}"))?;
        for f in filas {
            out.push(f.map_err(|e| format!("error al leer compra: {e}"))?);
        }
    } else {
        let sql = format!("{SELECT_COMPRA}{orden}");
        let mut stmt = con
            .prepare(&sql)
            .map_err(|e| format!("error al preparar historial: {e}"))?;
        let filas = stmt
            .query_map([], fila_a_compra)
            .map_err(|e| format!("error al listar compras: {e}"))?;
        for f in filas {
            out.push(f.map_err(|e| format!("error al leer compra: {e}"))?);
        }
    }
    Ok(out)
}

pub fn eliminar_compra(con: &Connection, id: &str) -> Result<(), String> {
    let ts = ahora();
    let n = con
        .execute(
            "UPDATE compras SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1 AND eliminado = 0",
            rusqlite::params![id, ts],
        )
        .map_err(|e| format!("error al eliminar compra: {e}"))?;
    if n == 0 {
        return Err("No se encontró la compra.".into());
    }
    let payload = serde_json::json!({ "id": id, "eliminado": 1, "actualizado_en": ts });
    encolar_sync(con, "compras", id, "update", &payload)
        .map_err(|e| format!("error al encolar baja de compra: {e}"))?;
    Ok(())
}

// ============================================================================
// Avisos de visita (tarjeta de Inicio)
// ============================================================================

/// Proveedores con rutina cuya próxima visita cae HOY o MAÑANA, con el
/// contexto que ayuda a decidir el pedido (último ticket y promedio).
/// Orden: primero los de hoy, luego los de mañana; dentro, por nombre.
pub fn avisos_de_visita(con: &Connection, hoy: &str) -> Result<Vec<AvisoVisita>, String> {
    let proveedores = listar(con, None)?;
    let mut avisos = Vec::new();
    for p in proveedores {
        let dias = match &p.proveedor.dias_visita {
            Some(d) if !d.is_empty() => d,
            _ => continue,
        };
        let proxima = match proxima_fecha_visita(dias, hoy) {
            Some(f) => f,
            None => continue,
        };
        let etiqueta = etiqueta_aviso(&proxima, hoy);
        if etiqueta != "Hoy" && etiqueta != "Mañana" {
            continue;
        }
        avisos.push(AvisoVisita {
            fecha_visita: proxima,
            etiqueta,
            ultimo_ticket_centavos: p.ultimo_ticket_centavos,
            ticket_promedio_centavos: p.ticket_promedio_centavos,
            proveedor: p.proveedor,
        });
    }
    avisos.sort_by(|a, b| {
        if a.etiqueta == b.etiqueta {
            a.proveedor.nombre.to_lowercase().cmp(&b.proveedor.nombre.to_lowercase())
        } else if a.etiqueta == "Hoy" {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });
    Ok(avisos)
}
