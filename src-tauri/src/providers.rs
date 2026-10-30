use std::time::{Duration, Instant};

use futures_util::future::join_all;
use serde::Deserialize;

use crate::model::{ProviderConfig, ProviderModel, ProviderStatus};

fn trim_base(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn openai_root(base: &str) -> String {
    let base = trim_base(base);
    if base.ends_with("/v1") {
        base
    } else {
        format!("{base}/v1")
    }
}

pub fn publisher_for(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("deepseek") {
        "DeepSeek"
    } else if n.contains("claude") {
        "Anthropic"
    } else if n.contains("qwen") {
        "Qwen"
    } else if n.contains("gemma") || n.contains("functiongemma") {
        "Google"
    } else if n.contains("llama") || n.contains("meta") {
        "Meta"
    } else if n.contains("mistral") || n.contains("ministral") {
        "Mistral AI"
    } else if n.contains("phi") {
        "Microsoft"
    } else if n.contains("gpt") || n.contains("whisper") {
        "OpenAI"
    } else if n.contains("nemotron") || n.contains("nvidia") {
        "NVIDIA"
    } else if n.contains("nomic") {
        "Nomic AI"
    } else if n.contains("bge") {
        "BAAI"
    } else if n.contains("liquid") || n.contains("lfm") {
        "Liquid AI"
    } else if n.starts_with("hf.co/") {
        "Hugging Face"
    } else {
        "Community"
    }
    .to_string()
}

#[derive(Deserialize)]
struct OllamaTag {
    name: String,
    size: Option<u64>,
    details: Option<OllamaDetails>,
}

#[derive(Deserialize)]
struct OllamaDetails {
    context_length: Option<u64>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    models: Option<Vec<OllamaTag>>,
}

#[derive(Deserialize)]
struct OpenAiModel {
    id: String,
}

#[derive(Deserialize)]
struct OpenAiResponse {
    data: Option<Vec<OpenAiModel>>,
}

async fn detect_ollama(client: &reqwest::Client, provider: &ProviderConfig) -> ProviderStatus {
    let started = Instant::now();
    let base = trim_base(&provider.base_url);
    let result = client
        .get(format!("{base}/api/tags"))
        .timeout(Duration::from_millis(1800))
        .send()
        .await;
    match result {
        Ok(response) if response.status().is_success() => {
            match response.json::<OllamaResponse>().await {
                Ok(body) => ProviderStatus {
                    id: provider.id.clone(),
                    label: provider.label.clone(),
                    kind: provider.kind.clone(),
                    base_url: base,
                    enabled: provider.enabled,
                    online: true,
                    latency_ms: Some(started.elapsed().as_millis() as u64),
                    models: (body.models.unwrap_or_default())
                        .into_iter()
                        .map(|model| {
                            let raw_name = model.name.clone();
                            let name = raw_name.trim_end_matches(":latest").to_string();
                            ProviderModel {
                                id: model.name.clone(),
                                name: name.clone(),
                                provider_id: provider.id.clone(),
                                provider_label: provider.label.clone(),
                                publisher: publisher_for(&name),
                                size_bytes: model.size,
                                context_window: model
                                    .details
                                    .as_ref()
                                    .and_then(|details| details.context_length),
                                kind: "chat".into(),
                            }
                        })
                        .collect(),
                    error: None,
                },
                Err(error) => failed(
                    provider,
                    started,
                    format!("Invalid Ollama response: {error}"),
                ),
            }
        }
        Ok(response) => failed(
            provider,
            started,
            format!("Ollama returned HTTP {}", response.status()),
        ),
        Err(error) => failed(
            provider,
            started,
            format!("Ollama is not reachable: {error}"),
        ),
    }
}

async fn detect_openai(client: &reqwest::Client, provider: &ProviderConfig) -> ProviderStatus {
    let started = Instant::now();
    let base = trim_base(&provider.base_url);
    let root = openai_root(&provider.base_url);
    let result = client
        .get(format!("{root}/models"))
        .timeout(Duration::from_millis(1800))
        .send()
        .await;
    match result {
        Ok(response) if response.status().is_success() => {
            match response.json::<OpenAiResponse>().await {
                Ok(body) => ProviderStatus {
                    id: provider.id.clone(),
                    label: provider.label.clone(),
                    kind: provider.kind.clone(),
                    base_url: base,
                    enabled: provider.enabled,
                    online: true,
                    latency_ms: Some(started.elapsed().as_millis() as u64),
                    models: (body.data.unwrap_or_default())
                        .into_iter()
                        .map(|model| {
                            let name = model.id.clone();
                            ProviderModel {
                                id: model.id.clone(),
                                name: name.clone(),
                                provider_id: provider.id.clone(),
                                provider_label: provider.label.clone(),
                                publisher: publisher_for(&name),
                                size_bytes: None,
                                context_window: None,
                                kind: "chat".into(),
                            }
                        })
                        .collect(),
                    error: None,
                },
                Err(error) => failed(
                    provider,
                    started,
                    format!("Invalid OpenAI-compatible response: {error}"),
                ),
            }
        }
        Ok(response) => failed(
            provider,
            started,
            format!("Runtime returned HTTP {}", response.status()),
        ),
        Err(error) => failed(
            provider,
            started,
            format!("Runtime is not reachable: {error}"),
        ),
    }
}

fn failed(provider: &ProviderConfig, started: Instant, error: String) -> ProviderStatus {
    ProviderStatus {
        id: provider.id.clone(),
        label: provider.label.clone(),
        kind: provider.kind.clone(),
        base_url: trim_base(&provider.base_url),
        enabled: provider.enabled,
        online: false,
        latency_ms: Some(started.elapsed().as_millis() as u64),
        models: Vec::new(),
        error: Some(error),
    }
}

pub async fn detect(providers: Vec<ProviderConfig>) -> Vec<ProviderStatus> {
    let client = reqwest::Client::new();
    let tasks = providers.into_iter().map(|provider| {
        let client = client.clone();
        async move {
            if provider.kind == "ollama" {
                detect_ollama(&client, &provider).await
            } else {
                detect_openai(&client, &provider).await
            }
        }
    });
    join_all(tasks).await
}

pub fn provider_by_id<'a>(providers: &'a [ProviderConfig], id: &str) -> Option<&'a ProviderConfig> {
    providers.iter().find(|provider| provider.id == id)
}

pub fn chat_url(provider: &ProviderConfig) -> String {
    if provider.kind == "ollama" {
        format!("{}/api/chat", trim_base(&provider.base_url))
    } else {
        format!("{}/chat/completions", openai_root(&provider.base_url))
    }
}
