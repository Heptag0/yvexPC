//! Fotos de producto que NO vienen del disco del usuario:
//!   · Buscar en Open Food Facts, por código de barras
//!   · Quitar el fondo, corriendo en TU servidor (nunca en el PC)
//!
//! Mismo patrón que el resto de la comunicación con el VPS (ver
//! `vinculacion.rs`, `sync_push.rs`): todo el HTTP vive en Rust, el frontend
//! solo invoca comandos. A diferencia del móvil, aquí el PC SÍ puede recibir
//! el PNG del recorte en binario directo — no hace falta el rodeo de base64
//! que `FileSystem.uploadAsync` de Expo obliga en el teléfono.

use std::io::Read;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use super::comun::nuevo_id;
use super::sync_push::credenciales_sync;

// Mismo servidor que usa el resto de la app (vinculacion.rs, sync_push.rs).
const URL_BASE: &str = "https://pos.yvexiq.com";

// ============================================================================
// Open Food Facts
// ============================================================================

#[derive(Debug, Serialize)]
pub struct FotoCatalogo {
    pub nombre: Option<String>,
    pub marca: Option<String>,
    pub url: String,
}

#[derive(Debug, Deserialize)]
struct OffRespuesta {
    status: i64,
    product: Option<OffProducto>,
}

#[derive(Debug, Deserialize)]
struct OffProducto {
    product_name: Option<String>,
    brands: Option<String>,
    image_front_url: Option<String>,
    image_url: Option<String>,
}

/// Busca la foto de un producto por su código de barras. `Ok(None)` es el
/// caso normal (sin internet, código no numérico, o simplemente no está en
/// la base) — nunca es un error que deba interrumpir el alta del producto.
pub fn buscar_en_catalogo(codigo_barras: &str) -> Result<Option<FotoCatalogo>, String> {
    let codigo = codigo_barras.trim();
    if codigo.len() < 8 || !codigo.chars().all(|c| c.is_ascii_digit()) {
        return Ok(None); // OFF solo indexa códigos numéricos
    }

    let url = format!(
        "https://world.openfoodfacts.org/api/v2/product/{codigo}.json\
         ?fields=product_name,brands,image_front_url,image_url"
    );
    let resp = ureq::get(&url)
        .set("User-Agent", "YvexPOS/1.0 (contacto: soporte@yvexiq.com)")
        .timeout(std::time::Duration::from_secs(8))
        .call();

    let r = match resp {
        Ok(r) => r,
        Err(_) => return Ok(None), // sin internet, timeout: no hay foto, no es error
    };
    let datos: OffRespuesta = match r.into_json() {
        Ok(d) => d,
        Err(_) => return Ok(None),
    };

    // ⚠️ OFF responde 200 aunque el producto no exista: lo que manda es
    // `status` (1 = encontrado). Fiarse del código HTTP daría falsos
    // positivos — ya lo verificamos así en el módulo del móvil.
    if datos.status != 1 {
        return Ok(None);
    }
    let Some(p) = datos.product else { return Ok(None) };
    let Some(imagen) = p.image_front_url.or(p.image_url) else { return Ok(None) };

    Ok(Some(FotoCatalogo { nombre: p.product_name, marca: p.brands, url: imagen }))
}

/// Descarga la foto sugerida a la carpeta local de imágenes de producto.
/// Devuelve la ruta local, lista para guardarse en `imagen_ruta`.
pub fn descargar_a_local(app: &tauri::AppHandle, url: &str) -> Result<String, String> {
    let resp = ureq::get(url)
        .timeout(std::time::Duration::from_secs(15))
        .call()
        .map_err(|e| format!("no se pudo descargar la imagen: {e}"))?;

    let ext = if url.to_lowercase().contains(".png") { "png" } else { "jpg" };
    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("error al leer la imagen descargada: {e}"))?;

    super::imagenes::guardar_bytes(app, &bytes, ext)
}

// ============================================================================
// Quitar el fondo (en el servidor)
// ============================================================================
// Corre en el VPS, no en el PC: mejor calidad que cualquier cosa que quepa
// razonablemente en un ejecutable de escritorio, sin costo por imagen, y es
// EL MISMO servicio que ya usa el móvil — una sola implementación en el
// servidor sirve a las dos plataformas.

/// ¿Está disponible el recorte? Se consulta ANTES de mostrar el botón, para
/// no ofrecer algo que va a fallar. `false` ante cualquier problema
/// (sin cuenta vinculada, sin internet, servidor sin `rembg` instalado).
pub fn recorte_disponible(con: &Connection) -> bool {
    let Some(cred) = credenciales_sync(con) else { return false };
    let resp = ureq::get(&format!("{URL_BASE}/fotos/estado"))
        .set("X-Dispositivo-Id", &cred.dispositivo_id)
        .set("X-Dispositivo-Token", &cred.token)
        .timeout(std::time::Duration::from_secs(5))
        .call();
    match resp {
        Ok(r) => r
            .into_json::<serde_json::Value>()
            .ok()
            .and_then(|v| v.get("disponible").and_then(|d| d.as_bool()))
            .unwrap_or(false),
        Err(_) => false,
    }
}

/// Arma un cuerpo `multipart/form-data` a mano: `ureq` no trae un helper de
/// alto nivel para esto, así que se construye el boundary y las secciones
/// tal como exige el estándar. Es el mismo formato que espera cualquier
/// `UploadFile` de FastAPI del otro lado.
fn cuerpo_multipart(campo: &str, nombre_archivo: &str, mime: &str, datos: &[u8]) -> (String, Vec<u8>) {
    let boundary = format!("----yvexpos{}", nuevo_id());
    let mut cuerpo = Vec::new();
    cuerpo.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"{campo}\"; filename=\"{nombre_archivo}\"\r\nContent-Type: {mime}\r\n\r\n"
        )
        .as_bytes(),
    );
    cuerpo.extend_from_slice(datos);
    cuerpo.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    (boundary, cuerpo)
}

/// Manda la foto al servidor y guarda el PNG recortado como archivo NUEVO.
/// No borra el original: si al usuario no le gusta el recorte, `productos.rs`
/// puede volver a la foto de antes (mismo criterio que `editar()` ya usa).
pub fn quitar_fondo(app: &tauri::AppHandle, con: &Connection, ruta_local: &str) -> Result<String, String> {
    let cred = credenciales_sync(con)
        .ok_or_else(|| "Necesitas tu cuenta vinculada para quitar el fondo.".to_string())?;

    let datos = std::fs::read(ruta_local).map_err(|e| format!("no se pudo leer la imagen: {e}"))?;
    let (boundary, cuerpo) = cuerpo_multipart("archivo", "foto.jpg", "image/jpeg", &datos);

    // Aquí SÍ se pide el PNG binario directo (?formato=png es el default del
    // servidor) — a diferencia del móvil, Rust no tiene el problema de
    // uploadAsync entregando la respuesta como texto.
    let resp = ureq::post(&format!("{URL_BASE}/fotos/quitar-fondo"))
        .set("X-Dispositivo-Id", &cred.dispositivo_id)
        .set("X-Dispositivo-Token", &cred.token)
        .set("Content-Type", &format!("multipart/form-data; boundary={boundary}"))
        .timeout(std::time::Duration::from_secs(30))
        .send_bytes(&cuerpo);

    let r = match resp {
        Ok(r) => r,
        Err(ureq::Error::Status(503, _)) => {
            return Err("El recorte no está instalado en tu servidor todavía.".into())
        }
        Err(ureq::Error::Status(code, _)) => {
            return Err(format!("No se pudo quitar el fondo (error {code}). Intenta de nuevo."))
        }
        Err(_) => return Err("No se pudo conectar. Revisa tu internet.".into()),
    };

    let mut png = Vec::new();
    r.into_reader()
        .read_to_end(&mut png)
        .map_err(|e| format!("error al leer el resultado del recorte: {e}"))?;

    super::imagenes::guardar_bytes(app, &png, "png")
}
