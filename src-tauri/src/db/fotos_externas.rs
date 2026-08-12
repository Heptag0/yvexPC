//! Fotos de producto que NO vienen del disco del usuario:
//!   · Buscar en Open Food Facts, por código de barras
//!   · Buscar NUTRICIÓN en Open Food Facts, por nombre (para la despensa)
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
// Open Food Facts — nutrición por nombre (para la despensa de Recetas)
// ============================================================================
// Distinto endpoint del que usa `buscar_en_catalogo`: ese busca por código de
// barras exacto (API v2, un solo resultado). Este busca por TEXTO LIBRE
// ("leche santa clara") y puede traer varios candidatos — es el endpoint de
// búsqueda de toda la vida de OFF (`cgi/search.pl`); su sucesor v2 está
// pensado para filtrar por categorías/tags, no para texto libre, así que
// aquí sí es la herramienta correcta pese al nombre "legacy".

#[derive(Debug, Serialize)]
pub struct CandidatoNutricion {
    pub nombre: String,
    pub marca: Option<String>,
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

#[derive(Debug, Deserialize)]
struct OffBusquedaRespuesta {
    #[serde(default)]
    products: Vec<OffProductoBusqueda>,
}

#[derive(Debug, Deserialize)]
struct OffProductoBusqueda {
    product_name: Option<String>,
    brands: Option<String>,
    nutriments: Option<OffNutrientes>,
}

#[derive(Debug, Deserialize, Default)]
struct OffNutrientes {
    #[serde(rename = "energy-kcal_100g")]
    energia_kcal_100g: Option<f64>,
    sugars_100g: Option<f64>,
    #[serde(rename = "saturated-fat_100g")]
    grasas_saturadas_100g: Option<f64>,
    #[serde(rename = "trans-fat_100g")]
    grasas_trans_100g: Option<f64>,
    /// ⚠️ OFF guarda el sodio en GRAMOS por 100 g, no en mg — se convierte
    /// al mapear a CandidatoNutricion (nuestro esquema usa mg, como pide la
    /// tabla nutrimental de una etiqueta NOM-051 real).
    sodium_100g: Option<f64>,
    proteins_100g: Option<f64>,
    carbohydrates_100g: Option<f64>,
    fat_100g: Option<f64>,
    fiber_100g: Option<f64>,
}

/// Busca candidatos de nutrición por nombre de producto. Lista vacía es el
/// caso normal (sin internet, sin resultados, nombre muy corto) — igual que
/// `buscar_en_catalogo`, nunca es un error que deba interrumpir al usuario.
/// Máximo 8 candidatos, para que quepan cómodos en un desplegable.
/// Ejecuta la búsqueda contra OFF. `solo_mexico` filtra a productos
/// etiquetados como vendidos en México (marca `tagtype_0=countries`, el
/// mecanismo de filtro genérico de la búsqueda "clásica" de OFF) — así se
/// prioriza Lala/Alpura/Santa Clara sobre marcas españolas como Hacendado,
/// que dominan la base por tener muchos más contribuidores.
fn ejecutar_busqueda_off(q: &str, solo_mexico: bool) -> Result<Vec<CandidatoNutricion>, String> {
    let mut req = ureq::get("https://world.openfoodfacts.org/cgi/search.pl")
        .query("search_terms", q)
        .query("search_simple", "1")
        .query("action", "process")
        .query("json", "1")
        .query("page_size", "8")
        .query("fields", "product_name,brands,nutriments");

    if solo_mexico {
        req = req
            .query("tagtype_0", "countries")
            .query("tag_contains_0", "contains")
            .query("tag_0", "mexico");
    }

    let resp = req
        .set("User-Agent", "YvexPOS/1.0 (contacto: soporte@yvexiq.com)")
        .timeout(std::time::Duration::from_secs(8))
        .call();

    let r = match resp {
        Ok(r) => r,
        Err(_) => return Ok(Vec::new()), // sin internet, timeout: lista vacía, no error
    };
    let datos: OffBusquedaRespuesta = match r.into_json() {
        Ok(d) => d,
        Err(_) => return Ok(Vec::new()),
    };

    let candidatos = datos
        .products
        .into_iter()
        .filter_map(|p| {
            let nombre = p.product_name?;
            if nombre.trim().is_empty() {
                return None;
            }
            let n = p.nutriments.unwrap_or_default();
            Some(CandidatoNutricion {
                nombre,
                marca: p.brands,
                calorias_kcal: n.energia_kcal_100g.unwrap_or(0.0),
                azucares_g: n.sugars_100g.unwrap_or(0.0),
                grasas_saturadas_g: n.grasas_saturadas_100g.unwrap_or(0.0),
                grasas_trans_g: n.grasas_trans_100g.unwrap_or(0.0),
                sodio_mg: n.sodium_100g.unwrap_or(0.0) * 1000.0,
                proteinas_g: n.proteins_100g.unwrap_or(0.0),
                carbohidratos_g: n.carbohydrates_100g.unwrap_or(0.0),
                grasas_totales_g: n.fat_100g.unwrap_or(0.0),
                fibra_g: n.fiber_100g.unwrap_or(0.0),
            })
        })
        .take(8)
        .collect();

    Ok(candidatos)
}

/// Busca candidatos de nutrición por nombre de producto. Lista vacía es el
/// caso normal (sin internet, sin resultados, nombre muy corto) — igual que
/// `buscar_en_catalogo`, nunca es un error que deba interrumpir al usuario.
///
/// Primero intenta SOLO productos de México (Lala, Alpura, Santa Clara...);
/// si eso no encuentra nada, cae de vuelta a la búsqueda global sin filtro
/// de país — mejor un resultado español que ninguno.
pub fn buscar_nutricion_por_nombre(nombre: &str) -> Result<Vec<CandidatoNutricion>, String> {
    let q = nombre.trim();
    if q.chars().count() < 3 {
        return Ok(Vec::new()); // evita disparar búsquedas con 1-2 letras mientras se escribe
    }

    let de_mexico = ejecutar_busqueda_off(q, true)?;
    if !de_mexico.is_empty() {
        return Ok(de_mexico);
    }
    ejecutar_busqueda_off(q, false)
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
