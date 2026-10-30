use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::model::{AppData, ProviderConfig, Settings};

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve the app data directory: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create app data: {error}"))?;
    Ok(dir)
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("openfoundry.json"))
}

pub fn default_settings() -> Settings {
    let now = Utc::now().to_rfc3339();
    Settings {
        onboarded: false,
        terms_accepted: false,
        display_name: String::new(),
        initials: String::new(),
        workspace_name: "My workspace".into(),
        api_key: format!("of-{}", Uuid::new_v4().simple()),
        providers: vec![
            ProviderConfig {
                id: "ollama".into(),
                label: "Ollama".into(),
                kind: "ollama".into(),
                base_url: "http://127.0.0.1:11434".into(),
                enabled: true,
                custom: false,
            },
            ProviderConfig {
                id: "lmstudio".into(),
                label: "LM Studio".into(),
                kind: "openai".into(),
                base_url: "http://127.0.0.1:1234".into(),
                enabled: true,
                custom: false,
            },
            ProviderConfig {
                id: "llamacpp".into(),
                label: "llama.cpp server".into(),
                kind: "openai".into(),
                base_url: "http://127.0.0.1:8080".into(),
                enabled: true,
                custom: false,
            },
            ProviderConfig {
                id: "foundry".into(),
                label: "Foundry CLI".into(),
                kind: "openai".into(),
                base_url: "http://127.0.0.1:50414".into(),
                enabled: true,
                custom: false,
            },
        ],
        default_provider: String::new(),
        default_model: String::new(),
        created_at: now,
    }
}

pub fn load(app: &AppHandle) -> Result<AppData, String> {
    let path = state_path(app)?;
    if !path.exists() {
        let data = AppData {
            settings: default_settings(),
            agents: Vec::new(),
        };
        save(app, &data)?;
        return Ok(data);
    }
    let raw =
        fs::read_to_string(&path).map_err(|error| format!("Could not read app data: {error}"))?;
    let mut data: AppData =
        serde_json::from_str(&raw).map_err(|error| format!("App data is corrupted: {error}"))?;
    if data.settings.providers.is_empty() {
        data.settings.providers = default_settings().providers;
    }
    Ok(data)
}

pub fn save(app: &AppHandle, data: &AppData) -> Result<(), String> {
    let path = state_path(app)?;
    let temporary = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(data).map_err(|error| error.to_string())?;
    fs::write(&temporary, raw).map_err(|error| format!("Could not write app data: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("Could not save app data: {error}"))?;
    Ok(())
}

pub fn now() -> String {
    Utc::now().to_rfc3339()
}
