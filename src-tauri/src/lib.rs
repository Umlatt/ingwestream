mod commands;
mod scripts;
mod shortcuts;
mod state;
mod tray;

use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("ingwe".into()),
                    },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .register_uri_scheme_protocol("ingwe-notify", |ctx, req| {
            commands::handle_notify_protocol(ctx.app_handle(), req.uri().to_string());
            tauri::http::Response::builder()
                .status(200)
                .header("Access-Control-Allow-Origin", "*")
                .body(std::borrow::Cow::Borrowed(b"" as &[u8]))
                .unwrap()
        })
        .register_uri_scheme_protocol("ingwe-ctrl", |ctx, req| {
            commands::handle_ctrl_protocol(ctx.app_handle(), req.uri().to_string());
            tauri::http::Response::builder()
                .status(200)
                .header("Access-Control-Allow-Origin", "*")
                .body(std::borrow::Cow::Borrowed(b"" as &[u8]))
                .unwrap()
        })
        .manage(Mutex::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            commands::open_service,
            commands::reset_service,
            commands::close_service,
            commands::show_service_view,
            commands::hide_service_view,
            commands::toggle_fullscreen_layout,
            commands::apply_fullscreen_resize,
            commands::update_window_icon,
            commands::reset_window_icon,
            commands::show_titlebar_overlay,
            commands::get_work_area,
            commands::ctrl_action,
        ])
        .setup(|app| {
            tray::build_tray(&app.handle())?;
            if let Err(e) = shortcuts::register_media_shortcuts(&app.handle()) {
                eprintln!("Warning: media key shortcuts unavailable on this system: {e}");
            }

            if let Some(w) = app.get_webview_window("main") {
                w.show()?;
                w.set_focus()?;
            }

            commands::init_service_webview(&app.handle())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::Resized(_) = event {
                    // Child-webview resize must happen on the main thread on macOS;
                    // dispatching here from the event thread silently no-ops on WKWebView.
                    let app = window.app_handle().clone();
                    if let Some(w) = window.app_handle().get_webview_window("main") {
                        let _ = w.run_on_main_thread(move || {
                            commands::resize_service_view(&app);
                        });
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
