//! Manejo del archivo de la foto de un producto.
//!
//! El archivo que el usuario elige con el diálogo NUNCA se referencia en su
//! ubicación original — se COPIA a la carpeta de datos de la app. Así, si el
//! usuario mueve, renombra o borra el archivo original después (su carpeta
//! de Descargas, una USB, etc.), la foto del producto sigue intacta.
//!
//! No toca SQLite — solo mueve bytes en el disco. `productos.rs` es quien
//! decide cuándo llamar a `guardar`/`borrar` y guarda la ruta resultante en
//! `productos.imagen_ruta`.

use std::io::Read;
use std::path::PathBuf;
use tauri::Manager;

const EXTENSIONES_PERMITIDAS: [&str; 4] = ["jpg", "jpeg", "png", "webp"];

/// Verifica el contenido REAL del archivo, no solo su extensión. Confiar
/// solo en el nombre es fácil de falsear (renombrar "cualquier_cosa.exe" a
/// "foto.jpg" no cambia lo que hay adentro) — esto revisa los primeros
/// bytes contra la firma real de JPEG/PNG/WEBP.
fn es_imagen_valida(datos: &[u8]) -> bool {
    if datos.len() < 12 {
        return false;
    }
    // JPEG: FF D8 FF
    if datos.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return true;
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if datos.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return true;
    }
    // WEBP: "RIFF" + 4 bytes de tamaño + "WEBP"
    if &datos[0..4] == b"RIFF" && &datos[8..12] == b"WEBP" {
        return true;
    }
    false
}

fn carpeta_imagenes(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no se pudo resolver la carpeta de datos: {e}"))?;
    let carpeta = base.join("imagenes").join("productos");
    std::fs::create_dir_all(&carpeta)
        .map_err(|e| format!("no se pudo crear la carpeta de imágenes: {e}"))?;
    Ok(carpeta)
}

/// Copia el archivo elegido por el usuario a la carpeta de datos de la app
/// con un nombre nuevo (UUID), y devuelve la ruta ABSOLUTA final — esa es la
/// que se guarda en `productos.imagen_ruta` y la que el frontend convierte
/// con `convertFileSrc(...)` para mostrarla en un `<img>`.
pub fn guardar(app: &tauri::AppHandle, ruta_origen: &str) -> Result<String, String> {
    let origen = PathBuf::from(ruta_origen);
    if !origen.is_file() {
        return Err("El archivo elegido no existe o no es accesible.".into());
    }

    let ext = origen
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !EXTENSIONES_PERMITIDAS.contains(&ext.as_str()) {
        return Err("Formato no soportado. Usa JPG, PNG o WEBP.".into());
    }

    // El nombre dice que es una imagen — confirmamos que el CONTENIDO
    // también lo sea, antes de copiar nada.
    let mut cabecera = [0u8; 12];
    let mut archivo = std::fs::File::open(&origen)
        .map_err(|e| format!("no se pudo abrir el archivo: {e}"))?;
    let leidos = archivo.read(&mut cabecera).unwrap_or(0);
    if !es_imagen_valida(&cabecera[..leidos]) {
        return Err("El archivo no parece ser una imagen válida.".into());
    }

    let carpeta = carpeta_imagenes(app)?;
    let nombre = format!("{}.{}", super::comun::nuevo_id(), ext);
    let destino = carpeta.join(&nombre);

    std::fs::copy(&origen, &destino).map_err(|e| format!("no se pudo copiar la imagen: {e}"))?;

    Ok(destino.to_string_lossy().to_string())
}

/// Borra una imagen anterior. Best-effort a propósito: si el archivo ya no
/// existe o falla el borrado, NO truena — perder el archivo huérfano de una
/// foto vieja es preferible a bloquear al usuario por un error de limpieza.
pub fn borrar(ruta: &str) {
    if ruta.trim().is_empty() {
        return;
    }
    let _ = std::fs::remove_file(ruta);
}

/// Guarda bytes ya en memoria como un archivo nuevo (mismo destino que
/// `guardar`, mismo esquema de nombre). Se usa para lo que NO llega como
/// archivo local elegido por el usuario, sino descargado o recibido de un
/// servicio: la foto del catálogo abierto, y el resultado de quitar el
/// fondo. Misma carpeta, mismo patrón de nombre — un solo lugar que sabe
/// dónde viven las fotos de producto.
pub fn guardar_bytes(app: &tauri::AppHandle, datos: &[u8], extension: &str) -> Result<String, String> {
    if datos.is_empty() {
        return Err("La imagen recibida está vacía.".into());
    }
    if !es_imagen_valida(datos) {
        return Err("Los datos recibidos no son una imagen válida.".into());
    }
    let carpeta = carpeta_imagenes(app)?;
    let nombre = format!("{}.{}", super::comun::nuevo_id(), extension);
    let destino = carpeta.join(&nombre);
    std::fs::write(&destino, datos).map_err(|e| format!("no se pudo guardar la imagen: {e}"))?;
    Ok(destino.to_string_lossy().to_string())
}
