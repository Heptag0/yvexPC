//! Agenda financiera: dos libros (negocio y personal) en un solo lugar.
//!
//! No es un módulo de "gastos del negocio". Es la agenda de dinero del dueño:
//! la luz del local y la luz de su casa, la renta del negocio y la renta de
//! su departamento. Separadas, porque mezclarlas es justo lo que hace que un
//! negocio familiar nunca sepa si de verdad gana.
//!
//! EL PUENTE ENTRE LOS DOS LIBROS es lo que hace esto distinto de una app de
//! finanzas cualquiera: cuando el dueño saca dinero del negocio para sus
//! cosas (categoría "retiro"), eso es UN GASTO del negocio y UN INGRESO
//! personal a la vez. Se captura una sola vez y el sistema lo refleja en
//! ambos. Con eso puede contestar lo que nadie contesta:
//!   "tu negocio te dio $12,400 este mes para vivir, y gastaste $15,800".
//!
//! ⚠️ NOTA SOBRE EL COSTO DE LO VENDIDO (solo afecta al libro de negocio):
//! se calcula con el costo ACTUAL del producto, porque `venta_lineas` no
//! guarda snapshot del costo al vender. Aproximación honesta mientras los
//! costos se muevan poco; arreglarlo de raíz pide tocar el corazón de ventas.
//!
//! LOCAL-ONLY (v1). Dinero SIEMPRE en centavos enteros.

use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::comun::{ahora, nuevo_id};

fn ambito_valido(a: &str) -> String {
    if a == "personal" { "personal".into() } else { "negocio".into() }
}

// ============================================================================
// Tipos
// ============================================================================

#[derive(Debug, Serialize)]
pub struct Movimiento {
    pub id: String,
    /// "gasto" | "ingreso" — para pintarlos juntos en el calendario/lista.
    pub clase: String,
    pub ambito: String,
    pub concepto: String,
    pub categoria: String,
    pub monto_centavos: i64,
    pub fecha: String,
    pub notas: Option<String>,
    /// Solo gastos: si vino de un fijo.
    pub gasto_fijo_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GastoFijo {
    pub id: String,
    pub ambito: String,
    pub concepto: String,
    pub categoria: String,
    pub monto_centavos: i64,
    pub dia_mes: i64,
    pub notas: Option<String>,
    pub pagado_este_mes: bool,
    /// Días que faltan para su día de pago (negativo = ya se pasó).
    pub dias_faltan: i64,
}

/// Estado de un presupuesto: cuánto se puso de límite y cuánto va gastado.
#[derive(Debug, Serialize)]
pub struct EstadoPresupuesto {
    pub categoria: String,
    pub limite_centavos: i64,
    pub gastado_centavos: i64,
    /// 0-100+ (puede pasar de 100 si se excedió).
    pub pct: i64,
    /// "ok" | "cerca" (>=80%) | "excedido" (>100%)
    pub estado: String,
}

/// Un día del mes con su actividad, para el calendario.
#[derive(Debug, Serialize)]
pub struct DiaCalendario {
    pub fecha: String,
    pub dia: i64,
    pub gastos_centavos: i64,
    pub ingresos_centavos: i64,
    /// Fijos que vencen ese día y aún no se pagan.
    pub fijos_pendientes: i64,
}

#[derive(Debug, Serialize)]
pub struct TotalCategoria {
    pub categoria: String,
    pub total_centavos: i64,
    pub pct: i64,
}

/// Un aviso para la franja de arriba. `tono`: "peligro" | "alerta" | "info".
#[derive(Debug, Serialize)]
pub struct Aviso {
    pub tono: String,
    pub titulo: String,
    pub detalle: String,
}

#[derive(Debug, Serialize)]
pub struct ResumenFinanzas {
    pub ambito: String,

    // --- Mes en curso (los dos libros) ---
    pub ingresos_mes_centavos: i64,
    pub gastos_mes_centavos: i64,
    pub balance_mes_centavos: i64,
    /// Cuánto se lleva gastado hoy (para el "¿cómo voy?" del día).
    pub gastos_hoy_centavos: i64,
    /// Ritmo: a este paso, cuánto se va a gastar en todo el mes.
    pub proyeccion_mes_centavos: i64,

    // --- Solo libro de NEGOCIO (el POS sabe estas cosas) ---
    pub ventas_hoy_centavos: i64,
    pub costo_vendido_hoy_centavos: i64,
    pub ganancia_hoy_centavos: i64,
    pub ventas_mes_centavos: i64,
    pub costo_vendido_mes_centavos: i64,
    pub ganancia_mes_centavos: i64,
    /// Lo que cuesta tener abierto un día (fijos del negocio ÷ 30).
    pub costo_diario_centavos: i64,
    /// Cuánto falta vender HOY para cubrir el día.
    pub falta_hoy_centavos: i64,
    pub margen_pct: f64,

    // --- El puente entre libros ---
    /// Cuánto sacó del negocio este mes (gasto en negocio = ingreso personal).
    pub retiros_mes_centavos: i64,

    // --- Contexto ---
    pub presupuestos: Vec<EstadoPresupuesto>,
    pub por_categoria: Vec<TotalCategoria>,
    pub proximos_fijos: Vec<GastoFijo>,
    pub calendario: Vec<DiaCalendario>,
    pub avisos: Vec<Aviso>,
    pub hay_datos: bool,
}

#[derive(Debug, Deserialize)]
pub struct DatosGasto {
    pub ambito: String,
    pub concepto: String,
    pub categoria: String,
    pub monto_centavos: i64,
    pub fecha: String,
    pub metodo_pago: Option<String>,
    pub gasto_fijo_id: Option<String>,
    pub notas: Option<String>,
    /// Solo si se paga con efectivo del cajón (genera la salida de caja).
    pub caja_sesion_id: Option<String>,
    pub usuario_pos_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DatosIngreso {
    pub ambito: String,
    pub concepto: String,
    pub categoria: String,
    pub monto_centavos: i64,
    pub fecha: String,
    pub notas: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DatosGastoFijo {
    pub ambito: String,
    pub concepto: String,
    pub categoria: String,
    pub monto_centavos: i64,
    pub dia_mes: i64,
    pub notas: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DatosPresupuesto {
    pub ambito: String,
    pub categoria: String,
    pub monto_centavos: i64,
}

// ============================================================================
// Gastos
// ============================================================================

/// Registra un gasto. Dos efectos automáticos según el caso:
///   - efectivo + turno abierto → genera la salida en movimientos_caja
///   - categoría "retiro" en el negocio → genera el ingreso espejo en personal
pub fn registrar_gasto(con: &Connection, dispositivo_id: &str, d: &DatosGasto) -> Result<String, String> {
    let concepto = d.concepto.trim();
    if concepto.is_empty() {
        return Err("Escribe en qué se gastó.".into());
    }
    if d.monto_centavos <= 0 {
        return Err("El monto debe ser mayor a cero.".into());
    }
    let ambito = ambito_valido(&d.ambito);
    let metodo = match d.metodo_pago.as_deref() {
        Some("tarjeta") => "tarjeta",
        Some("transferencia") => "transferencia",
        Some("otro") => "otro",
        _ => "efectivo",
    };
    let ts = ahora();
    let id = nuevo_id();

    // 1. ¿Sale del cajón? Primero el movimiento de caja: si falla, no queda
    //    un gasto "pagado del cajón" huérfano de su salida.
    let mut movimiento_id: Option<String> = None;
    if metodo == "efectivo" {
        if let (Some(caja), Some(usuario)) = (&d.caja_sesion_id, &d.usuario_pos_id) {
            let mid = nuevo_id();
            con.execute(
                "INSERT INTO movimientos_caja
                   (id, caja_sesion_id, tipo, motivo, monto_centavos, usuario_pos_id, creado_en, actualizado_en)
                 VALUES (?1,?2,'salida',?3,?4,?5,?6,?6)",
                rusqlite::params![mid, caja, concepto, d.monto_centavos, usuario, ts],
            )
            .map_err(|e| format!("error al registrar la salida de efectivo: {e}"))?;
            movimiento_id = Some(mid);
        }
    }

    // 2. ¿Es un retiro del negocio? Entonces también ENTRA al libro personal.
    //    Es el mismo dinero visto desde los dos lados: sale del negocio,
    //    llega a su bolsillo. Una captura, dos verdades correctas.
    let mut ingreso_espejo: Option<String> = None;
    if ambito == "negocio" && d.categoria == "retiro" {
        let iid = nuevo_id();
        con.execute(
            "INSERT INTO ingresos
               (id, ambito, concepto, categoria, monto_centavos, fecha,
                gasto_origen_id, notas, eliminado, creado_en, actualizado_en, dispositivo_id)
             VALUES (?1,'personal',?2,'negocio',?3,?4,?5,NULL,0,?6,?6,?7)",
            rusqlite::params![iid, concepto, d.monto_centavos, d.fecha.trim(), id, ts, dispositivo_id],
        )
        .map_err(|e| format!("error al registrar el ingreso personal del retiro: {e}"))?;
        ingreso_espejo = Some(iid);
    }

    con.execute(
        "INSERT INTO gastos
           (id, ambito, concepto, categoria, monto_centavos, fecha, metodo_pago,
            gasto_fijo_id, movimiento_caja_id, ingreso_espejo_id, notas,
            eliminado, creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,0,?12,?12,?13)",
        rusqlite::params![
            id, ambito, concepto, d.categoria.trim(), d.monto_centavos, d.fecha.trim(), metodo,
            d.gasto_fijo_id, movimiento_id, ingreso_espejo,
            d.notas.as_deref().map(str::trim).filter(|s| !s.is_empty()),
            ts, dispositivo_id,
        ],
    )
    .map_err(|e| format!("error al registrar gasto: {e}"))?;

    Ok(id)
}

/// Baja suave. Si generó un ingreso espejo (retiro), también se da de baja —
/// era el mismo dinero. La salida de caja NO se toca: ese efectivo ya salió
/// del cajón y el corte de ese turno ya se calculó con ella.
pub fn eliminar_gasto(con: &Connection, id: &str) -> Result<(), String> {
    let ts = ahora();
    let espejo: Option<String> = con
        .query_row("SELECT ingreso_espejo_id FROM gastos WHERE id = ?1", rusqlite::params![id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("error al leer gasto: {e}"))?
        .flatten();
    let n = con
        .execute(
            "UPDATE gastos SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1 AND eliminado = 0",
            rusqlite::params![id, ts],
        )
        .map_err(|e| format!("error al eliminar gasto: {e}"))?;
    if n == 0 {
        return Err("No se encontró el gasto.".into());
    }
    if let Some(iid) = espejo {
        con.execute(
            "UPDATE ingresos SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1",
            rusqlite::params![iid, ts],
        )
        .map_err(|e| format!("error al eliminar el ingreso espejo: {e}"))?;
    }
    Ok(())
}

// ============================================================================
// Ingresos
// ============================================================================

pub fn registrar_ingreso(con: &Connection, dispositivo_id: &str, d: &DatosIngreso) -> Result<String, String> {
    let concepto = d.concepto.trim();
    if concepto.is_empty() {
        return Err("Escribe de dónde vino el dinero.".into());
    }
    if d.monto_centavos <= 0 {
        return Err("El monto debe ser mayor a cero.".into());
    }
    let id = nuevo_id();
    let ts = ahora();
    con.execute(
        "INSERT INTO ingresos
           (id, ambito, concepto, categoria, monto_centavos, fecha,
            gasto_origen_id, notas, eliminado, creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,0,?8,?8,?9)",
        rusqlite::params![
            id, ambito_valido(&d.ambito), concepto, d.categoria.trim(),
            d.monto_centavos, d.fecha.trim(),
            d.notas.as_deref().map(str::trim).filter(|s| !s.is_empty()),
            ts, dispositivo_id,
        ],
    )
    .map_err(|e| format!("error al registrar ingreso: {e}"))?;
    Ok(id)
}

pub fn eliminar_ingreso(con: &Connection, id: &str) -> Result<(), String> {
    let ts = ahora();
    let n = con
        .execute(
            "UPDATE ingresos SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1 AND eliminado = 0",
            rusqlite::params![id, ts],
        )
        .map_err(|e| format!("error al eliminar ingreso: {e}"))?;
    if n == 0 {
        return Err("No se encontró el ingreso.".into());
    }
    Ok(())
}

/// Movimientos (gastos e ingresos juntos) de un rango, para la lista/agenda.
pub fn listar_movimientos(
    con: &Connection,
    ambito: &str,
    desde: &str,
    hasta: &str,
) -> Result<Vec<Movimiento>, String> {
    let amb = ambito_valido(ambito);
    let mut out = Vec::new();

    let mut stmt = con
        .prepare(
            "SELECT id, concepto, categoria, monto_centavos, fecha, notas, gasto_fijo_id
               FROM gastos
              WHERE eliminado = 0 AND ambito = ?1 AND fecha BETWEEN ?2 AND ?3",
        )
        .map_err(|e| format!("error al preparar gastos: {e}"))?;
    let filas = stmt
        .query_map(rusqlite::params![amb, desde, hasta], |r: &Row| {
            Ok(Movimiento {
                id: r.get(0)?, clase: "gasto".into(), ambito: amb.clone(),
                concepto: r.get(1)?, categoria: r.get(2)?, monto_centavos: r.get(3)?,
                fecha: r.get(4)?, notas: r.get(5)?, gasto_fijo_id: r.get(6)?,
            })
        })
        .map_err(|e| format!("error al listar gastos: {e}"))?;
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer gasto: {e}"))?);
    }

    let mut stmt2 = con
        .prepare(
            "SELECT id, concepto, categoria, monto_centavos, fecha, notas
               FROM ingresos
              WHERE eliminado = 0 AND ambito = ?1 AND fecha BETWEEN ?2 AND ?3",
        )
        .map_err(|e| format!("error al preparar ingresos: {e}"))?;
    let filas2 = stmt2
        .query_map(rusqlite::params![amb, desde, hasta], |r: &Row| {
            Ok(Movimiento {
                id: r.get(0)?, clase: "ingreso".into(), ambito: amb.clone(),
                concepto: r.get(1)?, categoria: r.get(2)?, monto_centavos: r.get(3)?,
                fecha: r.get(4)?, notas: r.get(5)?, gasto_fijo_id: None,
            })
        })
        .map_err(|e| format!("error al listar ingresos: {e}"))?;
    for f in filas2 {
        out.push(f.map_err(|e| format!("error al leer ingreso: {e}"))?);
    }

    // Lo más reciente primero; dentro del mismo día, ingresos antes que gastos.
    out.sort_by(|a, b| b.fecha.cmp(&a.fecha).then(a.clase.cmp(&b.clase)));
    Ok(out)
}

// ============================================================================
// Gastos fijos
// ============================================================================

pub fn crear_fijo(con: &Connection, dispositivo_id: &str, d: &DatosGastoFijo) -> Result<String, String> {
    let concepto = d.concepto.trim();
    if concepto.is_empty() {
        return Err("Escribe el nombre del gasto fijo.".into());
    }
    if d.monto_centavos <= 0 {
        return Err("El monto debe ser mayor a cero.".into());
    }
    let id = nuevo_id();
    let ts = ahora();
    con.execute(
        "INSERT INTO gastos_fijos
           (id, ambito, concepto, categoria, monto_centavos, dia_mes, activo, notas,
            eliminado, creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,1,?7,0,?8,?8,?9)",
        rusqlite::params![
            id, ambito_valido(&d.ambito), concepto, d.categoria.trim(),
            d.monto_centavos, d.dia_mes.clamp(1, 31),
            d.notas.as_deref().map(str::trim).filter(|s| !s.is_empty()), ts, dispositivo_id,
        ],
    )
    .map_err(|e| format!("error al crear gasto fijo: {e}"))?;
    Ok(id)
}

pub fn eliminar_fijo(con: &Connection, id: &str) -> Result<(), String> {
    con.execute(
        "UPDATE gastos_fijos SET eliminado = 1, actualizado_en = ?2 WHERE id = ?1",
        rusqlite::params![id, ahora()],
    )
    .map_err(|e| format!("error al eliminar gasto fijo: {e}"))?;
    Ok(())
}

pub fn listar_fijos(con: &Connection, ambito: &str, hoy: &str) -> Result<Vec<GastoFijo>, String> {
    let amb = ambito_valido(ambito);
    let mes = &hoy[..7];
    let dia_hoy: i64 = hoy[8..10].parse().unwrap_or(1);
    let mut stmt = con
        .prepare(
            "SELECT f.id, f.ambito, f.concepto, f.categoria, f.monto_centavos, f.dia_mes, f.notas,
                    EXISTS (SELECT 1 FROM gastos g
                             WHERE g.gasto_fijo_id = f.id AND g.eliminado = 0
                               AND substr(g.fecha, 1, 7) = ?2)
               FROM gastos_fijos f
              WHERE f.eliminado = 0 AND f.activo = 1 AND f.ambito = ?1
              ORDER BY f.dia_mes",
        )
        .map_err(|e| format!("error al preparar fijos: {e}"))?;
    let filas = stmt
        .query_map(rusqlite::params![amb, mes], |row| {
            let dia: i64 = row.get(5)?;
            Ok(GastoFijo {
                id: row.get(0)?,
                ambito: row.get(1)?,
                concepto: row.get(2)?,
                categoria: row.get(3)?,
                monto_centavos: row.get(4)?,
                dia_mes: dia,
                notas: row.get(6)?,
                pagado_este_mes: row.get::<_, i64>(7)? != 0,
                dias_faltan: dia - dia_hoy,
            })
        })
        .map_err(|e| format!("error al listar fijos: {e}"))?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer fijo: {e}"))?);
    }
    Ok(out)
}

// ============================================================================
// Presupuestos
// ============================================================================

pub fn guardar_presupuesto(con: &Connection, dispositivo_id: &str, d: &DatosPresupuesto) -> Result<(), String> {
    let ts = ahora();
    if d.monto_centavos <= 0 {
        // Poner 0 (o menos) equivale a quitar el límite de esa categoría.
        con.execute(
            "DELETE FROM presupuestos WHERE ambito = ?1 AND categoria = ?2",
            rusqlite::params![ambito_valido(&d.ambito), d.categoria.trim()],
        )
        .map_err(|e| format!("error al quitar presupuesto: {e}"))?;
        return Ok(());
    }
    con.execute(
        "INSERT INTO presupuestos (id, ambito, categoria, monto_centavos, creado_en, actualizado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?5,?6)
         ON CONFLICT(ambito, categoria) DO UPDATE SET
           monto_centavos = excluded.monto_centavos, actualizado_en = excluded.actualizado_en",
        rusqlite::params![nuevo_id(), ambito_valido(&d.ambito), d.categoria.trim(), d.monto_centavos, ts, dispositivo_id],
    )
    .map_err(|e| format!("error al guardar presupuesto: {e}"))?;
    Ok(())
}

// ============================================================================
// El tablero
// ============================================================================

fn suma_gastos(con: &Connection, amb: &str, desde: &str, hasta: &str) -> Result<i64, String> {
    con.query_row(
        "SELECT COALESCE(SUM(monto_centavos),0) FROM gastos
          WHERE eliminado = 0 AND ambito = ?1 AND fecha BETWEEN ?2 AND ?3",
        rusqlite::params![amb, desde, hasta],
        |r| r.get(0),
    )
    .map_err(|e| format!("error al sumar gastos: {e}"))
}

fn suma_ingresos(con: &Connection, amb: &str, desde: &str, hasta: &str) -> Result<i64, String> {
    con.query_row(
        "SELECT COALESCE(SUM(monto_centavos),0) FROM ingresos
          WHERE eliminado = 0 AND ambito = ?1 AND fecha BETWEEN ?2 AND ?3",
        rusqlite::params![amb, desde, hasta],
        |r| r.get(0),
    )
    .map_err(|e| format!("error al sumar ingresos: {e}"))
}

fn suma_ventas(con: &Connection, desde: &str, hasta: &str) -> Result<i64, String> {
    con.query_row(
        "SELECT COALESCE(SUM(total_centavos),0) FROM ventas
          WHERE estado != 'cancelada' AND date(creado_en) BETWEEN ?1 AND ?2",
        rusqlite::params![desde, hasta],
        |r| r.get(0),
    )
    .map_err(|e| format!("error al sumar ventas: {e}"))
}

fn costo_vendido(con: &Connection, desde: &str, hasta: &str) -> Result<i64, String> {
    con.query_row(
        "SELECT COALESCE(SUM(CAST(ROUND(vl.cantidad * COALESCE(p.costo_centavos,0)) AS INTEGER)),0)
           FROM venta_lineas vl
           JOIN ventas v ON vl.venta_id = v.id
           LEFT JOIN productos p ON vl.producto_id = p.id
          WHERE v.estado != 'cancelada' AND date(v.creado_en) BETWEEN ?1 AND ?2",
        rusqlite::params![desde, hasta],
        |r| r.get(0),
    )
    .map_err(|e| format!("error al calcular costo de lo vendido: {e}"))
}

/// Tablero completo de un libro. `hoy` es "AAAA-MM-DD" en hora local.
pub fn resumen(con: &Connection, ambito: &str, hoy: &str) -> Result<ResumenFinanzas, String> {
    let amb = ambito_valido(ambito);
    let es_negocio = amb == "negocio";
    let mes = &hoy[..7];
    let mes_inicio = format!("{mes}-01");
    let dia_hoy: i64 = hoy[8..10].parse().unwrap_or(1);

    // --- Gastos ---
    let gastos_mes = suma_gastos(con, &amb, &mes_inicio, hoy)?;
    let gastos_hoy = suma_gastos(con, &amb, hoy, hoy)?;

    // --- Ingresos: en el negocio, las ventas del POS son el ingreso real;
    //     los `ingresos` capturados a mano son extras que no pasaron por caja.
    let ventas_mes = if es_negocio { suma_ventas(con, &mes_inicio, hoy)? } else { 0 };
    let ventas_hoy = if es_negocio { suma_ventas(con, hoy, hoy)? } else { 0 };
    let ingresos_extra = suma_ingresos(con, &amb, &mes_inicio, hoy)?;
    let ingresos_mes = ventas_mes + ingresos_extra;

    // --- Negocio: costo de mercancía y ganancia real ---
    let costo_mes = if es_negocio { costo_vendido(con, &mes_inicio, hoy)? } else { 0 };
    let costo_hoy = if es_negocio { costo_vendido(con, hoy, hoy)? } else { 0 };
    let ganancia_mes = ventas_mes - costo_mes - gastos_mes;
    let ganancia_hoy = ventas_hoy - costo_hoy - gastos_hoy;

    // Balance del libro: lo que entró menos lo que salió. En personal es EL
    // número; en negocio es un complemento de la ganancia (que además resta
    // el costo de la mercancía).
    let balance_mes = ingresos_mes - gastos_mes - if es_negocio { costo_mes } else { 0 };

    // --- Punto de equilibrio (solo negocio) ---
    let total_fijos: i64 = con
        .query_row(
            "SELECT COALESCE(SUM(monto_centavos),0) FROM gastos_fijos
              WHERE eliminado = 0 AND activo = 1 AND ambito = ?1",
            rusqlite::params![amb],
            |r| r.get(0),
        )
        .map_err(|e| format!("error al sumar fijos: {e}"))?;
    let costo_diario = total_fijos / 30;
    let margen_pct = if ventas_mes > 0 {
        ((ventas_mes - costo_mes) as f64 / ventas_mes as f64) * 100.0
    } else {
        30.0
    };
    let falta_hoy = if es_negocio && margen_pct > 0.0 {
        let objetivo = (((costo_diario + gastos_hoy) as f64) / (margen_pct / 100.0)).round() as i64;
        (objetivo - ventas_hoy).max(0)
    } else {
        0
    };

    // --- Proyección: al ritmo de hoy, ¿en cuánto acaba el mes? ---
    let proyeccion = if dia_hoy > 0 { (gastos_mes / dia_hoy) * 30 } else { gastos_mes };

    // --- El puente: retiros del negocio este mes ---
    let retiros_mes: i64 = con
        .query_row(
            "SELECT COALESCE(SUM(monto_centavos),0) FROM gastos
              WHERE eliminado = 0 AND ambito = 'negocio' AND categoria = 'retiro'
                AND fecha BETWEEN ?1 AND ?2",
            rusqlite::params![mes_inicio, hoy],
            |r| r.get(0),
        )
        .map_err(|e| format!("error al sumar retiros: {e}"))?;

    // --- Presupuestos con su avance ---
    let mut stmt = con
        .prepare(
            "SELECT p.categoria, p.monto_centavos,
                    COALESCE((SELECT SUM(g.monto_centavos) FROM gastos g
                               WHERE g.eliminado = 0 AND g.ambito = p.ambito
                                 AND g.categoria = p.categoria
                                 AND g.fecha BETWEEN ?2 AND ?3), 0)
               FROM presupuestos p WHERE p.ambito = ?1
              ORDER BY p.categoria",
        )
        .map_err(|e| format!("error al preparar presupuestos: {e}"))?;
    let filas = stmt
        .query_map(rusqlite::params![amb, mes_inicio, hoy], |row| {
            let limite: i64 = row.get(1)?;
            let gastado: i64 = row.get(2)?;
            let pct = if limite > 0 { (gastado * 100 / limite).max(0) } else { 0 };
            let estado = if pct > 100 { "excedido" } else if pct >= 80 { "cerca" } else { "ok" };
            Ok(EstadoPresupuesto {
                categoria: row.get(0)?,
                limite_centavos: limite,
                gastado_centavos: gastado,
                pct,
                estado: estado.to_string(),
            })
        })
        .map_err(|e| format!("error al leer presupuestos: {e}"))?;
    let mut presupuestos = Vec::new();
    for f in filas {
        presupuestos.push(f.map_err(|e| format!("error al leer presupuesto: {e}"))?);
    }

    // --- Desglose por categoría ---
    let mut stmt2 = con
        .prepare(
            "SELECT categoria, SUM(monto_centavos) FROM gastos
              WHERE eliminado = 0 AND ambito = ?1 AND fecha BETWEEN ?2 AND ?3
              GROUP BY categoria ORDER BY SUM(monto_centavos) DESC",
        )
        .map_err(|e| format!("error al preparar categorías: {e}"))?;
    let filas2 = stmt2
        .query_map(rusqlite::params![amb, mes_inicio, hoy], |row| {
            let total: i64 = row.get(1)?;
            Ok(TotalCategoria {
                categoria: row.get(0)?,
                total_centavos: total,
                pct: if gastos_mes > 0 { total * 100 / gastos_mes } else { 0 },
            })
        })
        .map_err(|e| format!("error al agrupar categorías: {e}"))?;
    let mut por_categoria = Vec::new();
    for f in filas2 {
        por_categoria.push(f.map_err(|e| format!("error al leer categoría: {e}"))?);
    }

    // --- Fijos ---
    let fijos = listar_fijos(con, &amb, hoy)?;
    let proximos_fijos: Vec<GastoFijo> = fijos
        .iter()
        .filter(|f| !f.pagado_este_mes && f.dias_faltan >= -5 && f.dias_faltan <= 7)
        .map(|f| GastoFijo {
            id: f.id.clone(), ambito: f.ambito.clone(), concepto: f.concepto.clone(),
            categoria: f.categoria.clone(), monto_centavos: f.monto_centavos,
            dia_mes: f.dia_mes, notas: f.notas.clone(),
            pagado_este_mes: f.pagado_este_mes, dias_faltan: f.dias_faltan,
        })
        .collect();

    // --- Calendario del mes ---
    let ultimo_dia: i64 = con
        .query_row(
            "SELECT CAST(strftime('%d', date(?1, 'start of month', '+1 month', '-1 day')) AS INTEGER)",
            rusqlite::params![hoy],
            |r| r.get(0),
        )
        .unwrap_or(30);
    let mut calendario = Vec::new();
    for dia in 1..=ultimo_dia {
        let fecha = format!("{mes}-{:02}", dia);
        let g = suma_gastos(con, &amb, &fecha, &fecha)?;
        let i = suma_ingresos(con, &amb, &fecha, &fecha)?
            + if es_negocio { suma_ventas(con, &fecha, &fecha)? } else { 0 };
        let pend = fijos.iter().filter(|f| f.dia_mes == dia && !f.pagado_este_mes).count() as i64;
        calendario.push(DiaCalendario {
            fecha, dia, gastos_centavos: g, ingresos_centavos: i, fijos_pendientes: pend,
        });
    }

    // --- Avisos: lo que la pantalla debe decir sin que se lo pregunten ---
    let mut avisos = Vec::new();
    for p in presupuestos.iter().filter(|p| p.estado != "ok") {
        if p.estado == "excedido" {
            avisos.push(Aviso {
                tono: "peligro".into(),
                titulo: format!("Te pasaste en {}", p.categoria),
                detalle: format!(
                    "Llevas {} de {} que te pusiste de límite.",
                    fmt_pesos(p.gastado_centavos), fmt_pesos(p.limite_centavos)
                ),
            });
        } else {
            avisos.push(Aviso {
                tono: "alerta".into(),
                titulo: format!("Vas al {}% de tu límite en {}", p.pct, p.categoria),
                detalle: format!("Te quedan {} para el resto del mes.", fmt_pesos(p.limite_centavos - p.gastado_centavos)),
            });
        }
    }
    for f in proximos_fijos.iter().filter(|f| f.dias_faltan < 0) {
        avisos.push(Aviso {
            tono: "peligro".into(),
            titulo: format!("{} venció el día {}", f.concepto, f.dia_mes),
            detalle: format!("{} sin registrar este mes.", fmt_pesos(f.monto_centavos)),
        });
    }
    if !es_negocio && retiros_mes > 0 && gastos_mes > retiros_mes {
        avisos.push(Aviso {
            tono: "alerta".into(),
            titulo: "Estás gastando más de lo que te da el negocio".into(),
            detalle: format!(
                "El negocio te dio {} este mes y llevas {} de gastos personales.",
                fmt_pesos(retiros_mes), fmt_pesos(gastos_mes)
            ),
        });
    }

    let hay_datos = gastos_mes > 0 || ingresos_mes > 0 || total_fijos > 0 || !presupuestos.is_empty();

    Ok(ResumenFinanzas {
        ambito: amb,
        ingresos_mes_centavos: ingresos_mes,
        gastos_mes_centavos: gastos_mes,
        balance_mes_centavos: balance_mes,
        gastos_hoy_centavos: gastos_hoy,
        proyeccion_mes_centavos: proyeccion,
        ventas_hoy_centavos: ventas_hoy,
        costo_vendido_hoy_centavos: costo_hoy,
        ganancia_hoy_centavos: ganancia_hoy,
        ventas_mes_centavos: ventas_mes,
        costo_vendido_mes_centavos: costo_mes,
        ganancia_mes_centavos: ganancia_mes,
        costo_diario_centavos: costo_diario,
        falta_hoy_centavos: falta_hoy,
        margen_pct,
        retiros_mes_centavos: retiros_mes,
        presupuestos,
        por_categoria,
        proximos_fijos,
        calendario,
        avisos,
        hay_datos,
    })
}

/// Formato de pesos para los textos de aviso (el frontend formatea lo demás).
fn fmt_pesos(centavos: i64) -> String {
    format!("${}.{:02}", centavos / 100, (centavos % 100).abs())
}
