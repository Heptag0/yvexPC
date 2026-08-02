//! Lógica PURA de días de visita de proveedores.
//!
//! Puerto exacto de `src/base/visitas.ts` del móvil: mismo algoritmo, mismos
//! resultados para las mismas entradas (importante — Inicio en el PC y en el
//! móvil deben decir "Hoy"/"Mañana" al mismo tiempo para el mismo negocio).
//!
//! Convención de días: 0 = domingo, 1 = lunes, ..., 6 = sábado (estilo
//! `Date.getDay()` de JS, para no traducir nada nunca entre plataformas).
//!
//! Fechas como texto "AAAA-MM-DD"; aritmética con `NaiveDate` (sin zona
//! horaria) para que un cruce de mes/año nunca mueva la fecha.

use chrono::{Datelike, Duration, NaiveDate, Weekday};

const DIAS_ES: [&str; 7] = [
    "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
];

/// Convierte el weekday de chrono (lunes=0) al estilo `Date.getDay()` de JS
/// (domingo=0), que es la convención que usa todo el resto del sistema.
fn dia_semana_js(fecha: &NaiveDate) -> i64 {
    match fecha.weekday() {
        Weekday::Sun => 0,
        Weekday::Mon => 1,
        Weekday::Tue => 2,
        Weekday::Wed => 3,
        Weekday::Thu => 4,
        Weekday::Fri => 5,
        Weekday::Sat => 6,
    }
}

fn parsear_ymd(ymd: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(ymd.trim(), "%Y-%m-%d").ok()
}

/// Próxima fecha de visita a partir de `desde_ymd` (INCLUSIVE: si hoy es día
/// de visita, devuelve hoy). `dias` son números 0-6; puede venir desordenado
/// o con duplicados, no importa.
///
/// Devuelve "AAAA-MM-DD" o `None` si no hay días configurados o la fecha de
/// referencia es inválida.
pub fn proxima_fecha_visita(dias: &[i64], desde_ymd: &str) -> Option<String> {
    let validos: Vec<i64> = {
        let mut v: Vec<i64> = dias.iter().copied().filter(|d| (0..=6).contains(d)).collect();
        v.sort_unstable();
        v.dedup();
        v
    };
    if validos.is_empty() {
        return None;
    }
    let inicio = parsear_ymd(desde_ymd)?;
    // 7 días bastan para cubrir cualquier combinación de días de la semana.
    for i in 0..7 {
        let fecha = inicio + Duration::days(i);
        if validos.contains(&dia_semana_js(&fecha)) {
            return Some(fecha.format("%Y-%m-%d").to_string());
        }
    }
    None
}

/// Etiqueta amable para el aviso de Inicio:
///   misma fecha que hoy  -> "Hoy"
///   mañana                -> "Mañana"
///   otro día               -> "El lunes" (weekday en español)
/// Fecha inválida -> la cadena original (nunca truena la UI).
pub fn etiqueta_aviso(fecha_ymd: &str, hoy_ymd: &str) -> String {
    let (f, h) = match (parsear_ymd(fecha_ymd), parsear_ymd(hoy_ymd)) {
        (Some(f), Some(h)) => (f, h),
        _ => return fecha_ymd.to_string(),
    };
    let diff = (f - h).num_days();
    if diff == 0 {
        return "Hoy".to_string();
    }
    if diff == 1 {
        return "Mañana".to_string();
    }
    format!("El {}", DIAS_ES[dia_semana_js(&f) as usize])
}

/// Nombre del día de la semana en español para una fecha "AAAA-MM-DD".
#[allow(dead_code)]
pub fn nombre_dia(fecha_ymd: &str) -> Option<String> {
    let f = parsear_ymd(fecha_ymd)?;
    Some(DIAS_ES[dia_semana_js(&f) as usize].to_string())
}

/// Fecha "AAAA-MM-DD" de hoy en la hora local del dispositivo.
#[allow(dead_code)]
pub fn hoy_ymd() -> String {
    chrono::Local::now().date_naive().format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxima_visita_incluye_hoy() {
        // 2026-07-28 es martes (día 2). Si el proveedor viene martes, "hoy" cuenta.
        assert_eq!(
            proxima_fecha_visita(&[2], "2026-07-28"),
            Some("2026-07-28".to_string())
        );
    }

    #[test]
    fn proxima_visita_cruza_semana() {
        // Si solo viene domingo (0) y hoy es martes, la próxima es en 5 días.
        assert_eq!(
            proxima_fecha_visita(&[0], "2026-07-28"),
            Some("2026-08-02".to_string())
        );
    }

    #[test]
    fn etiqueta_hoy_manana_y_otro_dia() {
        assert_eq!(etiqueta_aviso("2026-07-28", "2026-07-28"), "Hoy");
        assert_eq!(etiqueta_aviso("2026-07-29", "2026-07-28"), "Mañana");
        assert_eq!(etiqueta_aviso("2026-08-02", "2026-07-28"), "El domingo");
    }

    #[test]
    fn sin_dias_configurados_no_hay_proxima() {
        assert_eq!(proxima_fecha_visita(&[], "2026-07-28"), None);
    }
}
