use futures_util::StreamExt;
use serde_json::json;
use tauri::ipc::Channel;

use crate::model::{ChatEvent, ChatRequest, ProviderConfig};
use crate::providers::chat_url;

pub async fn stream_chat(
    provider: &ProviderConfig,
    request: ChatRequest,
    on_event: Channel<ChatEvent>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = chat_url(provider);
    let built = if provider.kind == "ollama" {
        client.post(&url).json(&json!({
            "model": request.model,
            "messages": request.messages,
            "stream": true,
            "keep_alive": "10m",
            "options": {
                "temperature": request.temperature.unwrap_or(0.7),
                "top_p": request.top_p.unwrap_or(0.95),
                "num_predict": request.max_tokens.unwrap_or(1024)
            }
        }))
    } else {
        client.post(&url).json(&json!({
            "model": request.model,
            "messages": request.messages,
            "stream": true,
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(0.95),
            "max_tokens": request.max_tokens.unwrap_or(1024)
        }))
    };

    let response = built
        .send()
        .await
        .map_err(|error| format!("Could not connect to {}: {error}", provider.label))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let message = format!("{} returned HTTP {status}: {body}", provider.label);
        let _ = on_event.send(ChatEvent::Error {
            message: message.clone(),
        });
        return Err(message);
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut prompt_tokens = 0u32;
    let mut completion_tokens = 0u32;

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|error| format!("Stream failed: {error}"))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        if provider.kind == "ollama" {
            while let Some(index) = buffer.find('\n') {
                let line = buffer[..index].trim().to_string();
                buffer.drain(..=index);
                if line.is_empty() {
                    continue;
                }
                let value: serde_json::Value = match serde_json::from_str(&line) {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                if let Some(text) = value
                    .get("message")
                    .and_then(|message| message.get("content"))
                    .and_then(|content| content.as_str())
                {
                    if !text.is_empty() {
                        let _ = on_event.send(ChatEvent::Delta {
                            text: text.to_string(),
                        });
                    }
                }
                if value.get("done").and_then(|done| done.as_bool()) == Some(true) {
                    prompt_tokens = value
                        .get("prompt_eval_count")
                        .and_then(|count| count.as_u64())
                        .unwrap_or(0) as u32;
                    completion_tokens = value
                        .get("eval_count")
                        .and_then(|count| count.as_u64())
                        .unwrap_or(0) as u32;
                }
            }
        } else {
            while let Some(index) = buffer.find('\n') {
                let line = buffer[..index].trim().to_string();
                buffer.drain(..=index);
                if !line.starts_with("data:") {
                    continue;
                }
                let payload = line[5..].trim();
                if payload.is_empty() || payload == "[DONE]" {
                    continue;
                }
                let value: serde_json::Value = match serde_json::from_str(payload) {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                if let Some(text) = value
                    .get("choices")
                    .and_then(|choices| choices.get(0))
                    .and_then(|choice| choice.get("delta"))
                    .and_then(|delta| delta.get("content"))
                    .and_then(|content| content.as_str())
                {
                    if !text.is_empty() {
                        let _ = on_event.send(ChatEvent::Delta {
                            text: text.to_string(),
                        });
                    }
                }
                if let Some(usage) = value.get("usage") {
                    prompt_tokens = usage
                        .get("prompt_tokens")
                        .and_then(|count| count.as_u64())
                        .unwrap_or(0) as u32;
                    completion_tokens = usage
                        .get("completion_tokens")
                        .and_then(|count| count.as_u64())
                        .unwrap_or(0) as u32;
                }
            }
        }
    }

    let _ = on_event.send(ChatEvent::Done {
        prompt_tokens,
        completion_tokens,
    });
    Ok(())
}
