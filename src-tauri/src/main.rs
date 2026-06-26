#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use serde_json::json;
use std::io::Read;
use std::thread;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};

// Thread-safe state to hold the attendance timer
struct AppTimerState {
  totalsecs: Mutex<f64>,
  is_running: Mutex<bool>,
}

#[derive(Deserialize)]
struct AttendancePayload {
  totalsecs: Option<f64>,
  #[serde(rename = "currDayData")]
  curr_day_data: Option<serde_json::Value>,
}

fn cors_headers() -> Vec<tiny_http::Header> {
  vec![
    tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
    tiny_http::Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"POST, OPTIONS"[..]).unwrap(),
    tiny_http::Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..]).unwrap(),
  ]
}

fn apply_cors_headers<R: Read>(mut response: tiny_http::Response<R>) -> tiny_http::Response<R> {
  for header in cors_headers() {
    response = response.with_header(header);
  }
  response
}

// macOS native window customization for rounded glass effects
#[cfg(target_os = "macos")]
unsafe fn apply_macos_glass_effects(window: &tauri::WebviewWindow, radius: f64) {
  use objc::runtime::{Class, Object, NO, YES};
  use objc::{msg_send, sel, sel_impl};
  
  if let Ok(ptr) = window.ns_window() {
    let ns_window = ptr as *mut Object;
    
    // Make window background transparent
    let clear_color: *mut Object = msg_send![Class::get("NSColor").unwrap(), clearColor];
    let _: () = msg_send![ns_window, setOpaque: NO];
    let _: () = msg_send![ns_window, setBackgroundColor: clear_color];
    
    // Enable layer-backing on contentView and round the corners
    let content_view: *mut Object = msg_send![ns_window, contentView];
    if !content_view.is_null() {
      let _: () = msg_send![content_view, setWantsLayer: YES];
      let layer: *mut Object = msg_send![content_view, layer];
      if !layer.is_null() {
        let _: () = msg_send![layer, setCornerRadius: radius];
        let _: () = msg_send![layer, setMasksToBounds: YES];
      }
    }
  }
}

fn main() {
  tauri::Builder::default()
    .manage(AppTimerState {
      totalsecs: Mutex::new(0.0),
      is_running: Mutex::new(false),
    })
    .setup(|app| {
      let app_handle = app.handle().clone();

      // Setup window config and apply native vibrancy + transparent rounded corners
      if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
          // Vibrancy is disabled to remove blur completely and ensure maximum transparency
          
          // Clear native background and round content layer to prevent sharp corner pixels
          unsafe {
            apply_macos_glass_effects(&window, 18.0);
          }
        }

        let window_clone = window.clone();
        window.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
          }
        });
      }

      // Create System Tray Menu Items
      let show_i = MenuItem::with_id(app, "show", "Show Widget", true, None::<&str>)?;
      let hide_i = MenuItem::with_id(app, "hide", "Hide Widget", true, None::<&str>)?;
      let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let tray_menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

      // Get Default App Icon
      let icon = app.default_window_icon().cloned().expect("failed to get default window icon");

      // Build Tray Icon
      let _tray = TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(true) // treat icon as template so macOS auto-tints it
        .menu(&tray_menu)
        .on_menu_event(|app, event| {
          match event.id.as_ref() {
            "quit" => {
              app.exit(0);
            }
            "show" => {
              if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
            "hide" => {
              if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
              }
            }
            _ => {}
          }
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { .. } = event {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              let is_visible = window.is_visible().unwrap_or(false);
              if is_visible {
                let _ = window.hide();
              } else {
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
          }
        })
        .build(app)?;

      // Start background ticking thread for status bar
      let app_handle_tick = app.handle().clone();
      thread::spawn(move || {
        loop {
          thread::sleep(std::time::Duration::from_secs(1));
          
          let state = app_handle_tick.state::<AppTimerState>();
          let secs = {
            let is_running = state.is_running.lock().unwrap();
            let mut totalsecs = state.totalsecs.lock().unwrap();
            if *is_running {
              *totalsecs += 1.0;
            }
            *totalsecs
          };

          if secs > 0.0 {
            let h = (secs / 3600.0) as i32;
            let m = ((secs % 3600.0) / 60.0) as i32;
            let s = (secs % 60.0) as i32;
            let title = format!("{:02}:{:02}:{:02}", h, m, s);
            
            if let Some(tray) = app_handle_tick.tray_by_id("main") {
              let _ = tray.set_title(Some(title));
            }
          } else {
            if let Some(tray) = app_handle_tick.tray_by_id("main") {
              let _ = tray.set_title(Some("00:00:00".to_string()));
            }
          }
        }
      });

      // Start local HTTP server for attendance data on port 49001
      thread::spawn(move || {
        let server = match tiny_http::Server::http("127.0.0.1:49001") {
          Ok(s) => s,
          Err(e) => {
            eprintln!("failed to bind local attendance bridge: {}", e);
            let _ = app_handle.emit("server-error", json!({ "message": format!("failed to bind port 49001: {}", e) }));
            return;
          }
        };

        let _ = app_handle.emit("server-ready", json!({ "status": "listening" }));

        for mut request in server.incoming_requests() {
          let response = if request.method() == &tiny_http::Method::Options {
            apply_cors_headers(tiny_http::Response::empty(200))
          } else if request.method() == &tiny_http::Method::Post && request.url() == "/attendance" {
            let mut body = String::new();
            request.as_reader().read_to_string(&mut body).ok();
            let parsed: Result<AttendancePayload, _> = serde_json::from_str(&body);
            if let Ok(attendance) = parsed {
              let totalsecs = attendance.totalsecs.unwrap_or(0.0);
              
              // Infer running status from payload
              let is_running = if let Some(current) = &attendance.curr_day_data {
                let status_str = current.get("status")
                  .and_then(|v| v.as_str())
                  .unwrap_or("")
                  .to_uppercase();
                  
                let on_break = current.get("isOnBreak").and_then(|v| v.as_bool()).unwrap_or(false)
                  || current.get("onBreak").and_then(|v| v.as_bool()).unwrap_or(false)
                  || current.get("breakInTime").is_some();
                  
                let checked_out = current.get("checkOutTime").is_some()
                  || current.get("checkedOut").and_then(|v| v.as_bool()).unwrap_or(false);
                  
                if on_break || checked_out {
                  false
                } else {
                  status_str.contains("IN") || status_str.contains("ACTIVE") || totalsecs > 0.0
                }
              } else {
                totalsecs > 0.0
              };

              // Update shared state
              let state = app_handle.state::<AppTimerState>();
              *state.totalsecs.lock().unwrap() = totalsecs;
              *state.is_running.lock().unwrap() = is_running;

              let payload = json!({
                "totalsecs": totalsecs,
                "currDayData": attendance.curr_day_data.unwrap_or(serde_json::Value::Null)
              });
              let _ = app_handle.emit("attendance-update", payload);
            } else {
              let _ = app_handle.emit("server-error", json!({ "message": "invalid attendance payload" }));
            }
            apply_cors_headers(tiny_http::Response::empty(200))
          } else {
            apply_cors_headers(tiny_http::Response::empty(404))
          };
          let _ = request.respond(response);
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
