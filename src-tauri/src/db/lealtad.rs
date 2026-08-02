//! Programa de lealtad — puntos por compra y por visita, canje como descuento
//! al cobrar. Espejo de la lógica del móvil (`src/base/lealtad.ts` +
//! `lealtadReglas.ts`).
//!
//! Reglas de la casa:
//!   - Puntos en enteros; dinero SIEMPRE en centavos enteros.
//!   - El cliente de lealtad ES el mismo de `clientes` (crédito): no hay otra
//!     tabla de clientes, pero los puntos NO se mezclan con la deuda.
//!   - ✅ SINCRONIZADO: los movimientos de puntos se encolan como bitácora de
//!     solo-inserción. ⚠️ El SALDO (`clientes.puntos`) NUNCA se sube como
//!     columna directa — lo recalcula el servidor sumando los movimientos
//!     (mismo principio que el stock: si dos cajas suman/restan puntos al
//!     mismo tiempo, no se pueden pisar). El saldo real siempre llega de
//!     vuelta al bajar `clientes`.
//!   - NINGÚN canje se aplica solo: aquí solo se registran movimientos YA
//!     confirmados por el usuario en pantalla.
//!
//! Reglas configurables (tabla config, mismas claves del móvil):
//!   lealtad_activa                 -> "1"/"0" (default 1)
//!   lealtad_pesos_por_punto        -> 1 punto por cada N pesos (default 10)
//!   lealtad_puntos_visita          -> puntos por visita, máx. 1 al día (default 5)
//!   lealtad_valor_punto_centavos   -> cuánto vale 1 punto al canjear (default 100)
//!   lealtad_tope_descuento_pct     -> tope del ticket cubrible con puntos (default 50)

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use chrono::TimeZone;

use super::comun::{ahora, encolar_sync, nuevo_id};

// ============================================================================
// Reglas del programa
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReglasLealtad {
    pub activa: bool,
    pub pesos_por_punto: f64,
    pub puntos_visita: i64,
    pub valor_punto_centavos: i64,
    pub tope_descuento_pct: i64,
}

impl Default for ReglasLealtad {
    /// Defaults ESPEJO del móvil (lealtad.ts REGLAS_DEFECTO).
    fn default() -> Self {
        ReglasLealtad {
            activa: true,
            pesos_por_punto: 10.0,
            puntos_visita: 5,
            valor_punto_centavos: 100,
            tope_descuento_pct: 50,
        }
    }
}

pub fn leer_reglas(con: &Connection) -> ReglasLealtad {
    let leer = |clave: &str| -> Option<String> {
        con.query_row(
            "SELECT valor FROM config WHERE clave = ?1",
            rusqlite::params![clave],
            |r| r.get::<_, String>(0),
        )
        .ok()
    };
    let num = |v: Option<String>, def: f64| -> f64 {
        v.and_then(|s| s.parse::<f64>().ok())
            .filter(|n| *n >= 0.0)
            .unwrap_or(def)
    };
    let def = ReglasLealtad::default();
    ReglasLealtad {
        activa: leer("lealtad_activa").map(|v| v == "1").unwrap_or(def.activa),
        pesos_por_punto: num(leer("lealtad_pesos_por_punto"), def.pesos_por_punto),
        puntos_visita: num(leer("lealtad_puntos_visita"), def.puntos_visita as f64) as i64,
        valor_punto_centavos: num(leer("lealtad_valor_punto_centavos"), def.valor_punto_centavos as f64) as i64,
        tope_descuento_pct: num(leer("lealtad_tope_descuento_pct"), def.tope_descuento_pct as f64) as i64,
    }
}

pub fn guardar_reglas(con: &Connection, r: &ReglasLealtad) -> Result<(), String> {
    let pares = [
        ("lealtad_activa", if r.activa { "1".to_string() } else { "0".to_string() }),
        ("lealtad_pesos_por_punto", r.pesos_por_punto.to_string()),
        ("lealtad_puntos_visita", r.puntos_visita.to_string()),
        ("lealtad_valor_punto_centavos", r.valor_punto_centavos.to_string()),
        ("lealtad_tope_descuento_pct", r.tope_descuento_pct.to_string()),
    ];
    // Reusa config::set (ahora pública) en vez de un INSERT crudo: así estas
    // reglas SÍ suben a la nube por la entidad "config" que ya existe, y
    // bajan a las otras cajas — sin esto, cada caja podía tener sus propias
    // reglas y calcular puntos distinto para la misma compra.
    for (clave, valor) in pares {
        super::config::set(con, clave, &valor)
            .map_err(|e| format!("error al guardar {clave}: {e}"))?;
    }
    Ok(())
}

// ============================================================================
// Reglas puras (espejo de lealtadReglas.ts)
// ============================================================================

/// 1 punto por cada `pesos_por_punto` pesos COMPLETOS del total (floor).
/// Entradas inválidas -> 0 puntos, nunca truena.
pub fn puntos_por_compra(total_centavos: i64, pesos_por_punto: f64) -> i64 {
    if total_centavos <= 0 || !(pesos_por_punto > 0.0) {
        return 0;
    }
    (total_centavos as f64 / 100.0 / pesos_por_punto).floor() as i64
}

/// Cuánto descuento da un canje sobre este ticket. Espejo de
/// `descuentoPorCanje`: tope % del ticket, nunca más que el total, y
/// puntos_usados = floor a FAVOR del cliente (nunca le quitamos un punto de más).
/// Devuelve (descuento_centavos, puntos_usados).
pub fn descuento_por_canje(
    puntos_solicitados: i64,
    valor_punto_cent: i64,
    total_centavos: i64,
    tope_pct: i64,
) -> (i64, i64) {
    if puntos_solicitados <= 0 || valor_punto_cent <= 0 || total_centavos <= 0 || tope_pct <= 0 {
        return (0, 0);
    }
    let solicitado = puntos_solicitados * valor_punto_cent;
    let tope = total_centavos * tope_pct.min(100) / 100;
    let descuento = solicitado.min(tope).min(total_centavos).max(0);
    let puntos_usados = descuento / valor_punto_cent; // floor, a favor del cliente
    (descuento, puntos_usados)
}

// ============================================================================
// Código del cliente ("YV-8K3Q2Z") — mismo alfabeto sin ambiguos del móvil
// ============================================================================

const ALFABETO: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/// Código corto único "YV-XXXXXX". Reintenta si choca con uno existente.
pub fn generar_codigo(con: &Connection) -> Result<String, String> {
    for _ in 0..20 {
        let mut cuerpo = String::with_capacity(6);
        for _ in 0..6 {
            let b = rand_byte();
            cuerpo.push(ALFABETO[(b as usize) % ALFABETO.len()] as char);
        }
        let codigo = format!("YV-{cuerpo}");
        let choque: Option<String> = con
            .query_row(
                "SELECT id FROM clientes WHERE codigo = ?1",
                rusqlite::params![codigo],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("error al generar código: {e}"))?;
        if choque.is_none() {
            return Ok(codigo);
        }
    }
    Err("No se pudo generar un código único. Intenta de nuevo.".into())
}

/// Byte aleatorio sin dependencias nuevas: mezcla tiempo + contador estático.
fn rand_byte() -> u8 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEMILLA: AtomicU64 = AtomicU64::new(0);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64 ^ d.as_secs())
        .unwrap_or(0);
    let x = SEMILLA.fetch_add(0x9E3779B97F4A7C15, Ordering::Relaxed) ^ t;
    // xorshift rápido para distribuir
    let mut v = x ^ (x << 13);
    v ^= v >> 7;
    v ^= v << 17;
    (v & 0xFF) as u8
}

/// Asegura que el cliente tenga código (generación perezosa para clientes
/// creados antes de la migración 008). Devuelve el código.
pub fn asegurar_codigo(con: &Connection, cliente_id: &str) -> Result<String, String> {
    let actual: Option<Option<String>> = con
        .query_row(
            "SELECT codigo FROM clientes WHERE id = ?1 AND eliminado = 0",
            rusqlite::params![cliente_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("error al leer cliente: {e}"))?;
    match actual {
        None => Err("No se encontró el cliente.".into()),
        Some(Some(c)) if !c.is_empty() => Ok(c),
        _ => {
            let codigo = generar_codigo(con)?;
            let ts = ahora();
            con.execute(
                "UPDATE clientes SET codigo = ?2, actualizado_en = ?3 WHERE id = ?1",
                rusqlite::params![cliente_id, codigo, ts],
            )
            .map_err(|e| format!("error al asignar código: {e}"))?;
            // Payload parcial (id + codigo + actualizado_en): el receptor lo
            // reconoce como update parcial y solo toca esas columnas.
            let payload = serde_json::json!({
                "id": cliente_id, "codigo": codigo, "actualizado_en": ts,
            });
            encolar_sync(con, "clientes", cliente_id, "update", &payload)
                .map_err(|e| format!("error al encolar código de cliente: {e}"))?;
            Ok(codigo)
        }
    }
}

/// Normaliza lo que llega del QR o del teclado: acepta "YVEXPOS:YV-8K3Q2Z",
/// "YV-8K3Q2Z", "yv8k3q2z" o "8K3Q2Z" (el QR codifica `YVEXPOS:{codigo}`).
pub fn normalizar_codigo(raw: &str) -> String {
    let mut c = raw.trim().to_uppercase().replace(' ', "");
    if let Some(rest) = c.strip_prefix("YVEXPOS:") {
        c = rest.to_string();
    }
    if let Some(rest) = c.strip_prefix("YV-") {
        c = rest.to_string();
    } else if let Some(rest) = c.strip_prefix("YV") {
        c = rest.to_string();
    }
    format!("YV-{c}")
}

/// Busca un cliente por su código (QR escaneado o tecleado).
pub fn cliente_por_codigo(
    con: &Connection,
    codigo: &str,
) -> Result<Option<super::clientes::Cliente>, String> {
    let cod = normalizar_codigo(codigo);
    let id: Option<String> = con
        .query_row(
            "SELECT id FROM clientes WHERE codigo = ?1 AND eliminado = 0",
            rusqlite::params![cod],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("error al buscar por código: {e}"))?;
    match id {
        Some(id) => super::clientes::obtener(con, &id),
        None => Ok(None),
    }
}

// ============================================================================
// Movimientos de puntos
// ============================================================================

#[derive(Debug, Serialize)]
pub struct MovimientoPuntos {
    pub id: String,
    pub cliente_id: String,
    pub venta_id: Option<String>,
    pub tipo: String,
    pub puntos: i64,
    pub nota: Option<String>,
    pub creado_en: String,
}

#[derive(Debug, Serialize)]
pub struct ResultadoVisita {
    pub otorgados: i64,
    pub motivo: Option<String>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)] // espejo del tipo del móvil; el PC aún devuelve (i64, i64) suelto en vez de este struct
pub struct ResultadoAcumulacion {
    pub otorgados: i64,
    pub saldo: i64,
}

/// Inicio del día LOCAL en ISO UTC (para la regla "máx. 1 visita al día").
fn inicio_hoy_iso() -> String {
    let hoy = chrono::Local::now().date_naive();
    let local_dt = hoy.and_hms_opt(0, 0, 0).unwrap();
    let dt = chrono::Local
        .from_local_datetime(&local_dt)
        .single()
        .unwrap_or_else(chrono::Local::now);
    dt.with_timezone(&chrono::Utc).to_rfc3339()
}

/// Inserta un movimiento y actualiza el saldo LOCAL del cliente (optimista,
/// para que el cajero vea el número al instante), DENTRO de una transacción
/// ya abierta. El movimiento se encola para subir; el SALDO no se sube nunca
/// como número — el servidor lo recalcula sumando movimientos y lo devuelve
/// ya correcto en la próxima bajada de `clientes` (así converge aunque otra
/// caja también le haya movido puntos a este cliente mientras tanto).
pub fn registrar_movimiento_en_tx(
    con: &Connection,
    cliente_id: &str,
    venta_id: Option<&str>,
    tipo: &str,
    puntos: i64,
    nota: &str,
    dispositivo_id: &str,
) -> Result<i64, String> {
    let ts = ahora();
    let id = nuevo_id();
    con.execute(
        "INSERT INTO puntos_movimientos
           (id, cliente_id, venta_id, tipo, puntos, nota, creado_en, dispositivo_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        rusqlite::params![id, cliente_id, venta_id, tipo, puntos, nota, ts, dispositivo_id],
    )
    .map_err(|e| format!("error al registrar puntos: {e}"))?;
    con.execute(
        "UPDATE clientes SET puntos = puntos + ?2, actualizado_en = ?3 WHERE id = ?1",
        rusqlite::params![cliente_id, puntos, ts],
    )
    .map_err(|e| format!("error al actualizar puntos: {e}"))?;

    let payload = serde_json::json!({
        "id": id, "cliente_id": cliente_id, "venta_id": venta_id, "tipo": tipo,
        "puntos": puntos, "nota": nota, "creado_en": ts, "actualizado_en": ts,
    });
    encolar_sync(con, "puntos_movimientos", &id, "insert", &payload)
        .map_err(|e| format!("error al encolar movimiento de puntos: {e}"))?;

    saldo_puntos(con, cliente_id)
}

pub fn saldo_puntos(con: &Connection, cliente_id: &str) -> Result<i64, String> {
    con.query_row(
        "SELECT puntos FROM clientes WHERE id = ?1",
        rusqlite::params![cliente_id],
        |r| r.get(0),
    )
    .map_err(|e| format!("error al leer puntos: {e}"))
}

/// +puntos por visita, MÁXIMO una vez al día por cliente (día local del PC).
pub fn registrar_visita(
    con: &mut Connection,
    dispositivo_id: &str,
    cliente_id: &str,
) -> Result<ResultadoVisita, String> {
    let reglas = leer_reglas(con);
    if !reglas.activa {
        return Ok(ResultadoVisita {
            otorgados: 0,
            motivo: Some("El programa de lealtad está apagado.".into()),
        });
    }
    if reglas.puntos_visita <= 0 {
        return Ok(ResultadoVisita {
            otorgados: 0,
            motivo: Some("Los puntos por visita están apagados en los ajustes.".into()),
        });
    }
    let ya: Option<String> = con
        .query_row(
            "SELECT id FROM puntos_movimientos
             WHERE cliente_id = ?1 AND tipo = 'visita' AND creado_en >= ?2 LIMIT 1",
            rusqlite::params![cliente_id, inicio_hoy_iso()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("error al revisar visitas: {e}"))?;
    if ya.is_some() {
        return Ok(ResultadoVisita {
            otorgados: 0,
            motivo: Some("Ya registramos su visita de hoy.".into()),
        });
    }
    let tx = con.transaction().map_err(|e| format!("no se pudo abrir transacción: {e}"))?;
    registrar_movimiento_en_tx(&tx, cliente_id, None, "visita", reglas.puntos_visita, "Visita del día", dispositivo_id)?;
    tx.commit().map_err(|e| format!("error al confirmar visita: {e}"))?;
    Ok(ResultadoVisita { otorgados: reglas.puntos_visita, motivo: None })
}

/// Ajuste manual de puntos (solo dueño): positivo o negativo, con nota.
pub fn ajustar_puntos(
    con: &mut Connection,
    dispositivo_id: &str,
    cliente_id: &str,
    puntos: i64,
    nota: &str,
) -> Result<i64, String> {
    if puntos == 0 {
        return Err("El ajuste no puede ser cero.".into());
    }
    let saldo = saldo_puntos(con, cliente_id)?;
    if saldo + puntos < 0 {
        return Err(format!(
            "El cliente tiene {saldo} puntos; no se le pueden quitar {}.",
            -puntos
        ));
    }
    let nota_final = if nota.trim().is_empty() { "Ajuste manual" } else { nota.trim() };
    let tx = con.transaction().map_err(|e| format!("no se pudo abrir transacción: {e}"))?;
    let nuevo = registrar_movimiento_en_tx(&tx, cliente_id, None, "ajuste", puntos, nota_final, dispositivo_id)?;
    tx.commit().map_err(|e| format!("error al confirmar ajuste: {e}"))?;
    Ok(nuevo)
}

/// Bitácora de puntos del cliente, lo más reciente primero (máx. 100).
pub fn historial(con: &Connection, cliente_id: &str) -> Result<Vec<MovimientoPuntos>, String> {
    let mut stmt = con
        .prepare(
            "SELECT id, cliente_id, venta_id, tipo, puntos, nota, creado_en
             FROM puntos_movimientos WHERE cliente_id = ?1
             ORDER BY creado_en DESC, rowid DESC LIMIT 100",
        )
        .map_err(|e| format!("error al leer historial: {e}"))?;
    let filas = stmt
        .query_map(rusqlite::params![cliente_id], |row| {
            Ok(MovimientoPuntos {
                id: row.get(0)?,
                cliente_id: row.get(1)?,
                venta_id: row.get(2)?,
                tipo: row.get(3)?,
                puntos: row.get(4)?,
                nota: row.get(5)?,
                creado_en: row.get(6)?,
            })
        })
        .map_err(|e| format!("error al consultar historial: {e}"))?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| format!("error al leer movimiento: {e}"))?);
    }
    Ok(out)
}

/// Previsualiza un canje ANTES de cobrar: descuento y puntos reales que se
/// usarían, acotado por tope del ticket Y por el saldo del cliente.
#[derive(Debug, Serialize)]
pub struct PreviaCanje {
    pub descuento_centavos: i64,
    pub puntos_usados: i64,
    pub saldo: i64,
}

pub fn calcular_canje(
    con: &Connection,
    cliente_id: &str,
    total_centavos: i64,
    puntos_solicitados: i64,
) -> Result<PreviaCanje, String> {
    let saldo = saldo_puntos(con, cliente_id)?;
    let reglas = leer_reglas(con);
    let (descuento, puntos_usados) = if reglas.activa {
        descuento_por_canje(
            puntos_solicitados.min(saldo),
            reglas.valor_punto_centavos,
            total_centavos,
            reglas.tope_descuento_pct,
        )
    } else {
        (0, 0)
    };
    Ok(PreviaCanje { descuento_centavos: descuento, puntos_usados, saldo })
}