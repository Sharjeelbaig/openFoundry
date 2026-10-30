mod chat;
mod model;
mod providers;
mod store;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use model::{Agent, AppData, ChatEvent, ChatRequest, ProviderConfig, ProviderStatus, Settings};

#[tauri::command]
fn load_app(app: AppHandle) -> Result<AppData, String> {
    store::load(&app)
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let mut data = store::load(&app)?;
    let mut next = settings;
    if next.api_key.trim().is_empty() {
        next.api_key = format!("of-{}", Uuid::new_v4().simple());
    }
    if next.created_at.trim().is_empty() {
        next.created_at = store::now();
    }
    data.settings = next.clone();
    store::save(&app, &data)?;
    Ok(next)
}

#[tauri::command]
async fn detect_providers(
    app: AppHandle,
    providers: Option<Vec<ProviderConfig>>,
) -> Result<Vec<ProviderStatus>, String> {
    let mut data = store::load(&app)?;
    if data.settings.providers.is_empty() {
        data.settings = store::default_settings();
        store::save(&app, &data)?;
    }
    let selected = providers.unwrap_or_else(|| data.settings.providers.clone());
    let enabled = selected
        .into_iter()
        .filter(|provider| provider.enabled)
        .collect();
    Ok(providers::detect(enabled).await)
}

#[tauri::command(rename_all = "camelCase")]
async fn chat_stream(
    app: AppHandle,
    request: ChatRequest,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let data = store::load(&app)?;
    let provider = providers::provider_by_id(&data.settings.providers, &request.provider_id)
        .ok_or_else(|| "Choose a provider before sending a message.".to_string())?;
    chat::stream_chat(provider, request, on_event).await
}

#[tauri::command]
fn save_agent(app: AppHandle, agent: Agent) -> Result<Agent, String> {
    let mut data = store::load(&app)?;
    let now = store::now();
    let mut next = agent;
    if next.id.trim().is_empty() {
        next.id = Uuid::new_v4().to_string();
        next.created_at = now.clone();
    }
    next.updated_at = now;
    if let Some(existing) = data.agents.iter_mut().find(|item| item.id == next.id) {
        *existing = next.clone();
    } else {
        data.agents.push(next.clone());
    }
    store::save(&app, &data)?;
    Ok(next)
}

#[tauri::command]
fn delete_agent(app: AppHandle, id: String) -> Result<(), String> {
    let mut data = store::load(&app)?;
    data.agents.retain(|agent| agent.id != id);
    store::save(&app, &data)
}

#[tauri::command]
fn app_data_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| format!("Could not resolve app data directory: {error}"))
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_app,
            save_settings,
            detect_providers,
            chat_stream,
            save_agent,
            delete_agent,
            app_data_dir,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running openFoundry");
}
