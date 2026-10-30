import type { LocalModel, ModelTask } from "./types";

export const TASK_LABEL: Record<ModelTask, string> = {
  chat: "Chat completion",
  embedding: "Embeddings",
  vision: "Image analysis",
  speech: "Speech",
  image: "Image generation",
  other: "Other",
};

export function taskLabel(task: ModelTask): string {
  return TASK_LABEL[task] || "Other";
}

export function publisherLabel(model: LocalModel): string {
  if (model.provider === "huggingface") return "Hugging Face";
  return model.publisher;
}

export function runtimeLabel(model: LocalModel): string {
  if (model.provider === "foundry") return "Foundry Local";
  if (model.provider === "ollama") return "Ollama";
  if (model.provider === "lmstudio") return "LM Studio";
  if (model.provider === "llamacpp") return "llama.cpp";
  return "Hugging Face cache";
}

export function availabilityLabel(model: LocalModel): string {
  if (model.loaded) return "Loaded";
  if (model.cached) return "Downloaded";
  return "Download on deploy";
}

export function modelFacts(model: LocalModel): { label: string; value: string }[] {
  return [
    {
      label: "Context window",
      value: model.contextWindow
        ? model.contextWindow >= 1000
          ? `${(model.contextWindow / 1000).toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}k`
          : String(model.contextWindow)
        : "—",
    },
    { label: "Inference task", value: taskLabel(model.task) },
    { label: "Runtime", value: runtimeLabel(model) },
    { label: "Availability", value: availabilityLabel(model) },
  ];
}

export function modelDescription(model: LocalModel): string {
  if (model.description) return model.description;
  return `${model.displayName} is a ${taskLabel(
    model.task
  ).toLowerCase()} model published by ${model.publisher} and served on this computer by ${runtimeLabel(
    model
  )}. It exposes the same OpenAI-compatible API as openFoundry, with no cloud resource behind it.`;
}

export function modelTags(model: LocalModel): string[] {
  const tags = new Set<string>(model.tags || []);
  tags.add("Local");
  tags.add(runtimeLabel(model));
  if (model.cached) tags.add("Downloaded");
  if (model.task === "vision") tags.add("Vision");
  if (model.task === "embedding") tags.add("Vectors");
  return [...tags];
}

export function isChatModel(model: LocalModel): boolean {
  return model.task === "chat" || model.task === "vision";
}
