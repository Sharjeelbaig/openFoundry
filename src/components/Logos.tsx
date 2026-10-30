import { BRAND_PATHS } from "../brand-paths";

export function OpenFoundryMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="openFoundry"
    >
      <defs>
        <linearGradient id="of-mark" x1="4" y1="2" x2="28" y2="30">
          <stop stopColor="#f0a25f" />
          <stop offset="1" stopColor="#c56532" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5 18 9l6.2 2L18 13l-2 6.5L14 13l-6.2-2L14 9l2-6.5Z"
        fill="url(#of-mark)"
      />
      <path
        d="M8.5 19.5h15l-1.7 4.6h-4v3.2h-3.6v-3.2h-4L8.5 19.5Z"
        fill="url(#of-mark)"
      />
    </svg>
  );
}

const BRAND_KEYS: [RegExp, string][] = [
  [/anthropic|claude/i, "anthropic"],
  [/meta/i, "meta"],
  [/mistral|ministral/i, "mistral"],
  [/google|gemma/i, "google"],
  [/deepseek/i, "deepseek"],
  [/qwen/i, "qwen"],
  [/nvidia/i, "nvidia"],
  [/hugging ?face/i, "huggingface"],
  [/alibaba/i, "alibaba"],
  [/xai|^x$/i, "xai"],
];

const BRAND_COLORS: Record<string, string> = {
  anthropic: "#d97757",
  meta: "#0866ff",
  mistral: "#ff7000",
  google: "#8ab4f8",
  deepseek: "#4d6bfe",
  qwen: "#a78bfa",
  nvidia: "#76b900",
  huggingface: "#ffd21e",
  alibaba: "#ff6a00",
  xai: "#ffffff",
};

const FALLBACK_COLORS = [
  "#615ced",
  "#2f7d6b",
  "#a15445",
  "#3f6f9e",
  "#7b5aa6",
  "#8a6a2f",
];

export function ModelLogo({
  publisher,
  name,
  size = 32,
}: {
  publisher: string;
  name?: string;
  size?: number;
}) {
  const key = publisher.toLowerCase();
  const brand = BRAND_KEYS.find(([pattern]) => pattern.test(key))?.[1];
  const path = brand ? BRAND_PATHS[brand] : undefined;

  if (brand && path) {
    return (
      <span
        className="model-logo brand"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.58)} height={Math.round(size * 0.58)}>
          <path d={path} fill={BRAND_COLORS[brand] || "#ffffff"} />
        </svg>
      </span>
    );
  }

  const letter = (name || publisher || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
  let hash = 0;
  for (const character of publisher) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const color = FALLBACK_COLORS[hash % FALLBACK_COLORS.length];

  return (
    <span
      className="model-logo"
      style={{
        width: size,
        height: size,
        background: color,
        color: "#fff",
        fontSize: Math.max(11, Math.round(size * 0.38)),
      }}
      aria-hidden="true"
      title={publisher}
    >
      {letter}
    </span>
  );
}

export function BentoTileArt({ variant }: { variant: "agent" | "model" }) {
  const id = `of-dots-${variant}`;
  return (
    <svg
      className="bento-art"
      viewBox="0 0 260 250"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#b9adcf" />
        </pattern>
      </defs>
      {variant === "agent" ? (
        <g fill={`url(#${id})`}>
          <ellipse cx="130" cy="56" rx="78" ry="30" />
          <path d="M52 56h156v122c0 37-35 62-78 62s-78-25-78-62V56Z" />
          <ellipse cx="130" cy="196" rx="78" ry="32" fill="#1f1f1f" opacity="0.92" />
          <ellipse cx="130" cy="196" rx="52" ry="18" fill={`url(#${id})`} opacity="0.65" />
        </g>
      ) : (
        <g fill={`url(#${id})`}>
          <path d="M130 22 216 70 130 118 44 70 130 22Z" opacity="0.9" />
          <path d="M44 70 130 118v118L44 188V70Z" opacity="0.55" />
          <path d="M216 70 130 118v118l86-48V70Z" opacity="0.7" />
          <path d="m130 142 44-25v55l-44 25v-55Z" fill="#1f1f1f" opacity="0.94" />
        </g>
      )}
    </svg>
  );
}

export function DottedObject() {
  return (
    <span className="empty-illustration" aria-hidden="true">
      <svg viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="of-empty-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="1.6" cy="1.6" r="1.1" fill="#b9adcf" />
          </pattern>
        </defs>
        <path
          d="M55 30c0-8 16-14 35-14s35 6 35 14v66c0 12-16 22-35 22s-35-10-35-22V30Z"
          fill="url(#of-empty-dots)"
        />
        <ellipse cx="90" cy="96" rx="35" ry="14" fill="#1f1f1f" opacity="0.9" />
      </svg>
    </span>
  );
}
