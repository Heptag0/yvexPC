//! Punto de entrada de la librería Tauri de YvexIQ POS.
//!
//! Inicializa SQLite (migraciones incluidas), deja la conexión en el estado de
//! la app y registra los comandos expuestos al frontend.

mod commands;
mod db;

use db::EstadoDb;
use std::sync::Mutex;
use tauri::Manager;

/// Pone la ventana a cubrir el monitor completo, o la devuelve a maximizada.
///
/// POR QUÉ ASÍ Y NO CON setFullscreen():
/// Se intentó cinco veces desde el frontend con `setFullscreen(true)` y
/// siempre quedaba una franja negra abajo, del alto exacto de la barra de
/// tareas: la VENTANA crecía, pero el lienzo de WebView2 se quedaba con el
/// tamaño del área de trabajo y nunca se enteraba. Intentar despertarlo con
/// setSize() empeoraba todo, porque Windows no deja redimensionar una
/// ventana en fullscreen y la degradaba a ventana flotante.
///
/// Como esta ventana ya es `decorations: false`, no hace falta el modo
/// fullscreen del sistema: basta con dimensionarla EXACTAMENTE al monitor y
/// posicionarla en su origen. Windows reconoce una ventana sin bordes que
/// cubre el monitor completo y oculta la barra de tareas por su cuenta (es
/// el "fullscreen sin bordes" de toda la vida). Y como para el sistema esto
/// es un redimensionado corriente, el webview SÍ se redimensiona con él —
/// que era justo lo que fallaba.
///
/// Vive en Rust y no en JS a propósito: aquí no hacen falta permisos de
/// `core:window:*` en capabilities, y se puede aplicar en el arranque antes
/// del primer pixel (para que el login ya salga bien).
#[tauri::command]
fn ventana_modo_completo(ventana: tauri::WebviewWindow, activar: bool) -> Result<(), String> {
    if !activar {
        ventana.set_fullscreen(false).map_err(|e| e.to_string())?;
        ventana.maximize().map_err(|e| e.to_string())?;
        return Ok(());
    }
    cubrir_monitor(&ventana)
}

fn cubrir_monitor(ventana: &tauri::WebviewWindow) -> Result<(), String> {
    let monitor = ventana
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no se pudo determinar el monitor actual")?;
    let tam = *monitor.size();
    let pos = *monitor.position();
    // Salir de maximizado primero: una ventana maximizada ignora set_size,
    // y se quedaría pegada al área de trabajo (pantalla menos barra de tareas).
    if ventana.is_maximized().unwrap_or(false) {
        ventana.unmaximize().map_err(|e| e.to_string())?;
    }
    ventana
        .set_position(tauri::PhysicalPosition::new(pos.x, pos.y))
        .map_err(|e| e.to_string())?;
    ventana
        .set_size(tauri::PhysicalSize::new(tam.width, tam.height))
        .map_err(|e| e.to_string())?;

    // Y AHORA sí, fullscreen real — en este orden y no al revés.
    //
    // Dimensionar la ventana al monitor NO oculta la barra de tareas: la
    // barra de Windows es "siempre encima" y no cede solo porque algo la
    // cubra. Hace falta el modo fullscreen del sistema.
    //
    // Pero pedirlo de entrada era justo lo que fallaba: la ventana crecía
    // de golpe y el lienzo de WebView2 se quedaba con el tamaño viejo,
    // dejando la franja negra. Haciéndolo DESPUÉS de dimensionar, la
    // geometría ya es exactamente la del monitor, así que entrar a
    // fullscreen no cambia ni un pixel — no hay redimensionado que WebView2
    // pueda ignorar, y el bug no tiene por dónde aparecer.
    ventana.set_fullscreen(true).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_thermal_printer::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // Carpeta de datos de la app (p. ej. %APPDATA%\com.yvexiq.pos en Windows).
            let dir = app
                .path()
                .app_data_dir()
                .expect("no se pudo resolver app_data_dir");
            std::fs::create_dir_all(&dir).expect("no se pudo crear la carpeta de datos");
            let ruta_db = dir.join("yvexiq-pos.sqlite");
            println!("[db] usando base de datos en {ruta_db:?}");

            let con = db::inicializar(&ruta_db).expect("fallo inicializando la BD");
            // Arranca el hilo de sincronización de fondo (su propia conexión).
            let sync_tx = db::sync_worker::arrancar_hilo_sync(ruta_db.clone());
            app.manage(EstadoDb {
                con: Mutex::new(con),
                sync_tx: Mutex::new(Some(sync_tx)),
                sesion: Mutex::new(None),
                intentos_login: Mutex::new(std::collections::HashMap::new()),
            });

            // Cubrir el monitor desde el primer pixel (el login incluido),
            // sin esperar a que el frontend lo pida. Si algo falla, la app
            // arranca normal: es un extra, no un requisito.
            if let Some(v) = app.get_webview_window("main") {
                if let Err(e) = cubrir_monitor(&v) {
                    println!("[ventana] no se pudo cubrir el monitor: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ventana_modo_completo,
            commands::db_estado,
            commands::pos_configurado,
            commands::configurar_pos,
            commands::listar_usuarios,
            commands::login,
            commands::sesion_cerrar,
            commands::cat_listar,
            commands::cat_crear,
            commands::cat_editar,
            commands::cat_eliminar,
            commands::cat_reordenar,
            commands::prod_listar,
            commands::prod_contar_negativos,
            commands::prod_por_codigo,
            commands::prod_crear,
            commands::prod_editar,
            commands::prod_eliminar,
            commands::prod_eliminar_varios,
            commands::inventario_reporte,
            commands::inventario_metricas,
            commands::inventario_conteo,
            commands::exportar_csv,
            commands::csv_analizar,
            commands::csv_importar_productos,
            commands::respaldo_completo,
            commands::restaurar_validar,
            commands::restaurar_ejecutar,
            commands::reiniciar_app,
            commands::ticket_espera_listar,
            commands::ticket_espera_crear,
            commands::ticket_espera_guardar,
            commands::ticket_espera_renombrar,
            commands::ticket_espera_eliminar,
            commands::kit_componentes,
            commands::kit_disponibles,
            commands::prod_ajustar_stock,
            commands::caja_abierta,
            commands::caja_abrir,
            commands::venta_cobrar,
            commands::cliente_listar,
            commands::cliente_obtener,
            commands::cliente_crear,
            commands::cliente_editar,
            commands::cliente_eliminar,
            commands::cliente_estado_cuenta,
            commands::cliente_abonar,
            commands::cliente_verificar_limite,
            commands::caja_movimiento,
            commands::caja_corte,
            commands::caja_cerrar,
            commands::devolucion_buscar_venta,
            commands::devolucion_procesar,
            commands::ventas_del_dia,
            commands::reporte_generar,
            commands::config_leer,
            commands::config_guardar,
            commands::config_leer_todo,
            commands::config_guardar_claves,
            commands::usuario_crear,
            commands::usuario_editar,
            commands::usuario_eliminar,
            commands::ticket_generar,
            commands::ticket_ultima,
            commands::ticket_preparar_impresion,
            commands::importar_previsualizar,
            commands::importar_ejecutar,
            commands::fdb_previsualizar,
            commands::fdb_importar,
            commands::inicio_resumen,
            commands::vinc_ya_vinculado,
            commands::vinc_generar_codigo,
            commands::vinc_consultar_estado,
            commands::vinc_desvincular,
            commands::sync_ahora,
            commands::sync_pendientes,
            commands::vinc_registrar,
            commands::vinc_login,
            commands::sync_reintentar,
            commands::sync_bajar_ahora,
            commands::vinc_estado_cuenta,
            commands::vinc_verificar_enviar,
            commands::vinc_verificar_confirmar,
            commands::vinc_verificar_cambiar_email,

            commands::tienda_estado,
            commands::tienda_publicar,
            commands::tienda_slug_disponible,
            commands::tienda_desactivar,
            commands::tienda_pedidos,
            commands::tienda_pedido_estado,
            commands::tienda_pedido_completar,
            commands::tienda_config_local,
            commands::tienda_guardar_config_local,
            commands::tienda_productos_para_publicar,

            commands::lealtad_reglas,
            commands::lealtad_guardar_reglas,
            commands::lealtad_cliente_por_codigo,
            commands::lealtad_asegurar_codigo,
            commands::lealtad_registrar_visita,
            commands::lealtad_ajustar_puntos,
            commands::lealtad_historial,
            commands::lealtad_calcular_canje,
            commands::misiones_progreso,
            commands::prod_guardar_imagen,
            commands::prod_borrar_imagen,
            commands::prov_listar,
            commands::prov_obtener,
            commands::prov_crear,
            commands::prov_editar,
            commands::prov_eliminar,
            commands::compra_registrar,
            commands::compra_historial,
            commands::compra_eliminar,
            commands::prov_avisos_visita,
            commands::cot_listar,
            commands::cot_obtener,
            commands::cot_crear,
            commands::cot_cancelar,
            commands::cot_eliminar,
            commands::cot_preparar_para_venta,
            commands::cot_marcar_convertida,
            commands::fin_resumen,
            commands::fin_movimientos,
            commands::fin_gasto_registrar,
            commands::fin_gasto_eliminar,
            commands::fin_ingreso_registrar,
            commands::fin_ingreso_eliminar,
            commands::fin_fijos_listar,
            commands::fin_fijo_crear,
            commands::fin_fijo_eliminar,
            commands::fin_presupuesto_guardar,
            commands::etq_listar,
            commands::etq_obtener,
            commands::etq_guardar,
            commands::etq_eliminar,
            commands::desp_listar,
            commands::desp_crear,
            commands::desp_editar,
            commands::desp_eliminar,
            commands::desp_buscar_nutricion,
            commands::receta_listar,
            commands::receta_obtener,
            commands::receta_guardar,
            commands::receta_eliminar,
            commands::receta_crear_producto,
            commands::bitacora_listar,
            commands::prod_buscar_foto_catalogo,
            commands::prod_descargar_foto_catalogo,
            commands::prod_recorte_disponible,
            commands::prod_quitar_fondo,
        ])
        .run(tauri::generate_context!())
        .expect("error ejecutando la aplicación Tauri");
}
