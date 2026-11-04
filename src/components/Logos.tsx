// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useId, useState } from "react";

const F_FRONT =
  "M8 6h15.8v4.6H13.2v3.6h8.5v4.6h-8.5V26H8V6Z";
const F_COPPER = "M8 6h2.4v20H8z";

export function OpenFoundryLogo({
  size = 20,
  mono = false,
}: {
  size?: number;
  mono?: boolean;
}) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const copperId = `of-cast-${reactId}`;
  return (
    <svg
      height={size}
      width={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden="true"
    >
      {!mono && (
        <defs>
          <linearGradient
            id={copperId}
            x1="8"
            y1="6"
            x2="10.4"
            y2="26"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ffc57e" />
            <stop offset="1" stopColor="#d86831" />
          </linearGradient>
        </defs>
      )}
      <path d={F_FRONT} fill="currentColor" />
      <path
        d={F_COPPER}
        fill={mono ? "currentColor" : `url(#${copperId})`}
      />
    </svg>
  );
}

/**
 * The product tile. Use this at larger sizes where the icon has room to carry
 * the background and material treatment; the standalone mark is used in dense
 * chrome such as the app header.
 */
export function OpenFoundryAppIcon({ size = 72 }: { size?: number }) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const copperId = `of-icon-copper-${reactId}`;
  const bgId = `of-icon-bg-${reactId}`;
  const glowId = `of-icon-glow-${reactId}`;
  const shadowId = `of-icon-shadow-${reactId}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={bgId}
          x1="120"
          y1="0"
          x2="870"
          y2="1024"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2b241d" />
          <stop offset=".5" stopColor="#141414" />
          <stop offset="1" stopColor="#0d0d0e" />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(500 430) rotate(90) scale(430)"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#b96832" stopOpacity=".28" />
          <stop offset="1" stopColor="#b96832" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={copperId}
          x1="8"
          y1="6"
          x2="10.4"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffc57e" />
          <stop offset="1" stopColor="#d86831" />
        </linearGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow
            dx="0"
            dy="22"
            stdDeviation="24"
            floodColor="#000000"
            floodOpacity=".38"
          />
        </filter>
      </defs>
      <rect width="1024" height="1024" rx="228" fill={`url(#${bgId})`} />
      <rect
        x="3"
        y="3"
        width="1018"
        height="1018"
        rx="225"
        stroke="#41382f"
        strokeWidth="3"
      />
      <ellipse cx="500" cy="430" rx="430" ry="430" fill={`url(#${glowId})`} />
      <g transform="translate(-29 -32) scale(34)" filter={`url(#${shadowId})`}>
        <path d={F_FRONT} fill="#f4efe6" />
        <path d={F_COPPER} fill={`url(#${copperId})`} />
      </g>
    </svg>
  );
}

// Model-publisher marks are fetched from Simple Icons' public CDN (CC0) and
// never bundled with the app. If a mark is unavailable or not allowed, the
// component falls back to a neutral first-letter tile.
const LOGO_SLUGS: [RegExp, string, string][] = [
  [/anthropic|claude/i, "anthropic", "d97757"],
  [/meta/i, "meta", "0866ff"],
  [/mistral|ministral/i, "mistralai", "ff7000"],
  [/google|gemma/i, "google", "8ab4f8"],
  [/deepseek/i, "deepseek", "4d6bfe"],
  [/qwen/i, "qwen", "a78bfa"],
  [/nvidia/i, "nvidia", "76b900"],
  [/hugging ?face/i, "huggingface", "ffd21e"],
  [/alibaba/i, "alibabacloud", "ff6a00"],
  [/xai|^x$/i, "x", "ffffff"],
];

export function ModelLogo({
  publisher,
  name,
  size = 44,
  dark = false,
}: {
  publisher: string;
  name?: string;
  size?: number;
  dark?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const key = publisher.toLowerCase();
  const match = LOGO_SLUGS.find(([pattern]) => pattern.test(key));
  const slug = match?.[1];
  const color = match?.[2];
  const letter =
    (name || publisher || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";

  if (slug && !failed) {
    return (
      <span
        className={`model-logo brand${dark ? " dark" : ""}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://cdn.simpleicons.org/${slug}/${color}`}
          alt=""
          width={Math.round(size * 0.55)}
          height={Math.round(size * 0.55)}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`model-logo${dark ? " dark" : ""}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.36)),
      }}
      aria-hidden="true"
      title={publisher}
    >
      {letter}
    </span>
  );
}

export function DottedObject({ className = "empty-illustration" }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="of-empty-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="1.6" cy="1.6" r="1.1" fill="currentColor" />
          </pattern>
        </defs>
        <path
          d="M55 30c0-8 16-14 35-14s35 6 35 14v66c0 12-16 22-35 22s-35-10-35-22V30Z"
          fill="url(#of-empty-dots)"
        />
        <ellipse cx="90" cy="96" rx="35" ry="14" fill="var(--bg-elevated)" />
      </svg>
    </span>
  );
}

export const FoundryLogo = OpenFoundryLogo;

export function AgentTileIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.76 4.5c.34 0 .66.19.84.49l3.82 6.64c.13.23.13.51 0 .74l-3.89 6.75a.75.75 0 0 1-.65.38H12.5a.75.75 0 0 0 0 1.5h3.38c.8 0 1.55-.43 1.95-1.13l3.89-6.75c.4-.7.4-1.55 0-2.24L17.9 4.24a2.47 2.47 0 0 0-4.5.48L8.91 18.84a.95.95 0 0 1-1.73.17l-3.62-6.63a.75.75 0 0 1 .01-.73l3.9-6.77a.75.75 0 0 1 .65-.38h3.13a.75.75 0 0 0 0-1.5H8.12c-.8 0-1.55.43-1.95 1.13l-3.9 6.77c-.4.68-.4 1.5-.03 2.2l3.62 6.62a2.45 2.45 0 0 0 4.48-.43l4.5-14.12c.12-.4.5-.67.92-.67Z" />
    </svg>
  );
}

export function ModelTileIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10.52 4.25a4.5 4.5 0 0 1 3.07.04l5.91 2.1a3 3 0 0 1 1 .59v-.42a2 2 0 0 0-1.33-1.88L14 2.85a6 6 0 0 0-4.02 0L4.83 4.68A2 2 0 0 0 3.5 6.56v.42a3 3 0 0 1 1-.6l5.91-2.1c.04 0 .07-.02.1-.03Zm-4.07 5.86c.14-.39.57-.6.96-.45L12 11.28l4.6-1.62a.75.75 0 0 1 .5 1.4l-4.35 1.55v4.72a.75.75 0 0 1-1.5 0v-4.72l-4.34-1.54a.75.75 0 0 1-.46-.96Zm4.3-4.88c.8-.29 1.7-.29 2.5 0l5.92 2.1A2 2 0 0 1 20.5 9.2v8.24a2 2 0 0 1-1.33 1.88l-5.92 2.1c-.8.29-1.7.29-2.5 0l-5.92-2.1a2 2 0 0 1-1.33-1.88V9.2a2 2 0 0 1 1.33-1.88l5.92-2.1Zm2 1.41a2.25 2.25 0 0 0-1.5 0l-5.92 2.1a.5.5 0 0 0-.33.47v8.24c0 .2.13.4.33.47l5.92 2.1c.48.17 1.02.17 1.5 0l5.92-2.1a.5.5 0 0 0 .33-.47V9.2a.5.5 0 0 0-.33-.47l-5.92-2.1Z" />
    </svg>
  );
}

export function BentoTileArt({ variant }: { variant: "agent" | "model" }) {
  const id = `dots-${variant}`;
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
          <circle cx="2" cy="2" r="1.2" fill="var(--bento-dot, #b9adcf)" />
        </pattern>
      </defs>
      {variant === "agent" ? (
        <g fill={`url(#${id})`}>
          <ellipse cx="130" cy="56" rx="78" ry="30" />
          <path d="M52 56h156v122c0 37-35 62-78 62s-78-25-78-62V56Z" />
          <ellipse cx="130" cy="196" rx="78" ry="32" fill="var(--bento-shade, #1f1f1f)" opacity="0.92" />
          <ellipse cx="130" cy="196" rx="52" ry="18" fill={`url(#${id})`} opacity="0.65" />
        </g>
      ) : (
        <g fill={`url(#${id})`}>
          <path d="M130 22 216 70 130 118 44 70 130 22Z" opacity="0.9" />
          <path d="M44 70 130 118v118L44 188V70Z" opacity="0.55" />
          <path d="M216 70 130 118v118l86-48V70Z" opacity="0.7" />
          <path d="m130 142 44-25v55l-44 25v-55Z" fill="var(--bento-shade, #1f1f1f)" opacity="0.94" />
        </g>
      )}
    </svg>
  );
}
