// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

// openFoundry desktop shell.
//
// The product UI and all local APIs are the Next.js app. This Rust layer only
// starts the bundled Next standalone server on a free loopback port, waits for
// it to answer, and points the window at it. Workspace data is written to the
// OS app-data directory instead of the read-only application bundle.

#[cfg(not(debug_assertions))]
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use std::thread;
#[cfg(not(debug_assertions))]
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<CommandChild>>);

#[cfg(not(debug_assertions))]
fn free_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .unwrap_or(3210)
}

/// Whether this process may create files in `dir`.
#[cfg(target_os = "macos")]
fn writable(dir: &std::path::Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    let probe = dir.join(format!(".openfoundry-write-{}", std::process::id()));
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
    {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// `~/.local/bin` is not in macOS's default PATH, so add one marked line to the
/// zsh login profile when that is where the command line had to go.
#[cfg(target_os = "macos")]
fn ensure_login_path() {
    use std::io::Write;

    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let profile = std::path::PathBuf::from(home).join(".zprofile");
    let existing = std::fs::read_to_string(&profile).unwrap_or_default();
    // Respect a profile that already puts ~/.local/bin on PATH.
    if existing
        .lines()
        .any(|line| !line.trim_start().starts_with('#') && line.contains(".local/bin"))
    {
        return;
    }
    if existing.contains("openFoundry CLI") {
        return;
    }
    let line = "\n# openFoundry CLI\nexport PATH=\"$HOME/.local/bin:$PATH\"\n";
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&profile)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Put the bundled `openFoundry` command line on the user's PATH.
///
/// The launcher lives inside the app bundle, so a symlink keeps it in step with
/// the installed version. Prefer `/usr/local/bin` when it is writable; otherwise
/// link into `~/.local/bin` and make sure a login shell can find it.
#[cfg(target_os = "macos")]
fn install_cli(resource_dir: &std::path::Path) {
    use std::os::unix::fs::symlink;

    let source = resource_dir.join("resources").join("cli").join("openfoundry");
    if !source.is_file() {
        return;
    }

    let system_bin = std::path::PathBuf::from("/usr/local/bin");
    let target_dir = if writable(&system_bin) {
        system_bin
    } else {
        let Some(home) = std::env::var_os("HOME") else {
            return;
        };
        let user_bin = std::path::PathBuf::from(home).join(".local").join("bin");
        if std::fs::create_dir_all(&user_bin).is_err() || !writable(&user_bin) {
            return;
        }
        ensure_login_path();
        user_bin
    };

    let link = target_dir.join("openfoundry");
    match std::fs::symlink_metadata(&link) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let current = std::fs::read_link(&link).unwrap_or_default();
            if current == source {
                return;
            }
            // Replace a link that points into an old or moved openFoundry
            // bundle. Never take over an unrelated command.
            let ours = !current.exists()
                || current
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .contains("openfoundry");
            if !ours {
                return;
            }
            let _ = std::fs::remove_file(&link);
        }
        Ok(_) => return,
        Err(_) => {}
    }
    let _ = symlink(&source, &link);
}

#[cfg(not(debug_assertions))]
fn machine_key(data_dir: &std::path::Path) -> Option<String> {
    // The server writes this file while it boots. It is the shell's proof that
    // it can read the same data directory, so no sign-in prompt is needed.
    for _ in 0..40 {
        if let Ok(value) = std::fs::read_to_string(data_dir.join("machine.key")) {
            let trimmed = value.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
        thread::sleep(Duration::from_millis(150));
    }
    None
}

#[cfg(not(debug_assertions))]
fn navigate_when_ready(
    window: tauri::WebviewWindow,
    url: String,
    data_dir: std::path::PathBuf,
) {
    thread::spawn(move || {
        for _ in 0..240 {
            if TcpStream::connect(("127.0.0.1", url_port(&url))).is_ok() {
                let target = match machine_key(&data_dir) {
                    Some(key) => format!("{url}/api/auth/machine?key={key}"),
                    None => url,
                };
                let quoted =
                    serde_json::to_string(&target).unwrap_or_else(|_| "\"/\"".into());
                let _ = window.eval(&format!("window.location.replace({quoted});"));
                return;
            }
            thread::sleep(Duration::from_millis(150));
        }
        let _ = window.eval(
            "document.querySelector('h1').textContent = 'openFoundry could not start'; \
             document.querySelector('p').textContent = \
             'The local server did not answer. Quit and open the app again.';",
        );
    });
}

#[cfg(not(debug_assertions))]
fn url_port(url: &str) -> u16 {
    url.rsplit(':')
        .next()
        .and_then(|value| value.trim_end_matches('/').parse().ok())
        .unwrap_or(3210)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            install_cli(&app.path().resource_dir()?);
            #[cfg(debug_assertions)]
            let _ = app;
            #[cfg(not(debug_assertions))]
            {
                let window = app
                    .get_webview_window("main")
                    .ok_or("The main window was not created")?;
                let resource_dir = app.path().resource_dir()?;
                let server_dir = resource_dir.join("next-server");
                let data_dir = app.path().app_data_dir()?.join("data");
                std::fs::create_dir_all(&data_dir)?;

                let port = free_port();
                let public_url = format!("http://127.0.0.1:{port}");
                let node_path = if cfg!(target_os = "macos") {
                    resource_dir
                        .join("resources")
                        .join("OpenFoundry Server.app")
                        .join("Contents")
                        .join("MacOS")
                        .join("node")
                } else if cfg!(target_os = "windows") {
                    resource_dir.join("resources").join("node.exe")
                } else {
                    resource_dir.join("resources").join("node")
                };
                let command = app
                    .shell()
                    .command(&node_path)
                    .args(["start.cjs"])
                    .current_dir(server_dir)
                    .env("PORT", port.to_string())
                    .env("HOSTNAME", "127.0.0.1")
                    .env("NODE_ENV", "production")
                    .env(
                        "OPENFOUNDRY_DATA_DIR",
                        data_dir.to_string_lossy().to_string(),
                    )
                    .env("OPENFOUNDRY_PUBLIC_URL", public_url.clone());

                let (mut events, child) = command
                    .spawn()
                    .map_err(|error| format!("Could not start the local server: {error}"))?;
                app.manage(ServerProcess(Mutex::new(Some(child))));

                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = events.recv().await {
                        match event {
                            CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                                eprintln!("[openFoundry] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(payload) => {
                                eprintln!(
                                    "[openFoundry] local server exited: {:?}",
                                    payload.code
                                );
                            }
                            _ => {}
                        }
                    }
                });

                navigate_when_ready(window, public_url, data_dir);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building openFoundry");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(server) = app_handle.try_state::<ServerProcess>() {
                if let Ok(mut child) = server.0.lock() {
                    if let Some(process) = child.take() {
                        let _ = process.kill();
                    }
                }
            }
        }
    });
}
