import release from "./release.json";

export const REPO = "https://github.com/Sharjeelbaig/openFoundry";
export const DOWNLOAD_URL = `${REPO}/releases/download/${release.tag}/${release.asset}`;
export const VERSION = release.version;
export const SIZE_MB = Math.ceil(release.bytes / (1024 * 1024));
export const SHA256 = release.sha256;

export const NAV = [
  { label: "Features", href: "#features" },
  { label: "Screenshots", href: "#screenshots" },
  { label: "Deployments", href: "#deployments" },
  { label: "Docs", href: "./docs/" },
  { label: "Run locally", href: "#run" },
  { label: "Install", href: "#install" },
  { label: "FAQ", href: "#faq" },
];

export const FEATURES = [
  {
    key: "models",
    title: "Find and run models",
    body: "Search the Hugging Face catalog and the Foundry Local catalog. Downloads run in the background with progress and logs.",
  },
  {
    key: "playground",
    title: "Test in the playground",
    body: "Chat with any deployment, change the system prompt, and read the trace for every turn.",
  },
  {
    key: "agents",
    title: "Build prompt agents",
    body: "Write instructions, attach tools, knowledge, memory and a guardrail. Test the agent on the same screen.",
  },
  {
    key: "knowledge",
    title: "Ground answers with Foundry IQ",
    body: "Upload documents, build a local index, and let agents cite the chunks they used.",
  },
  {
    key: "deployments",
    title: "Deploy a real endpoint",
    body: "Every deployment gets an OpenAI-compatible endpoint, its own key, rate limits and token counts.",
  },
  {
    key: "local",
    title: "Keep it local",
    body: "No account and no telemetry. Requests leave your computer only when you point them at a remote provider.",
  },
];

export const SLIDES = [
  {
    src: "./assets/screens/home.webp",
    alt: "The openFoundry home screen with the project endpoint, API key and recent work.",
    title: "Home",
    caption:
      "The project at a glance. Endpoint, key, recent agents and deployments.",
  },
  {
    src: "./assets/screens/agent-builder.webp",
    alt: "The agent builder with model, instructions, tools, knowledge, memory and guardrail on the left, and a chat playground on the right.",
    title: "Agent builder",
    caption:
      "Build and test an agent on one screen. Instructions, tools, knowledge, memory and guardrails on the left. Chat and YAML on the right.",
  },
  {
    src: "./assets/screens/agent-discover.webp",
    alt: "Agent discovery with six templates, a search field and a list of saved agents.",
    title: "Agent discovery",
    caption:
      "Start from a template or open an agent you already built. Search by name, filter by category, and create a real agent in one click.",
  },
  {
    src: "./assets/screens/agent-deployment.webp",
    alt: "Deployment details with the live endpoint, API key, serving mode, routing scope, rate limit and token counts.",
    title: "Deployment model card",
    caption:
      "Every deployment has a live endpoint, its own key, rate limits and token counts. Test it or copy a working code sample.",
  },
  {
    src: "./assets/screens/foundry-iq.webp",
    alt: "Foundry IQ knowledge bases with a ready base, document and chunk counts, and the embedding model.",
    title: "Foundry IQ",
    caption:
      "Upload documents, build a local index, and let agents cite the chunks they used.",
  },
];

export const DEPLOYMENT_MODES = [
  {
    title: "Serving mode",
    body: "Standard and Developer meter tokens per minute and return 429 when the limit is reached. Provisioned reserves slots and queues the rest. Batch takes asynchronous jobs only. Instant answers from the local runtime.",
  },
  {
    title: "Scope",
    body: "Global can use any online runtime node. Data Zone uses nodes tagged for a zone. Region pins one node. Device is this computer. Routing is real. The data residency guarantee is the only simulated part.",
  },
  {
    title: "Section",
    body: "Serverless, Managed compute or Adapter. This is the Build > Models tab that lists the deployment.",
  },
];

export const FAQ = [
  {
    q: "Is openFoundry really free?",
    a: "Yes. The app is Apache-2.0, there is no account, and there is no paid tier. The licenses of the models you download are separate.",
  },
  {
    q: "Does it send my data anywhere?",
    a: "No telemetry, analytics or crash uploads. Requests go only to the providers and endpoints you configure.",
  },
  {
    q: "Which runtimes work?",
    a: "Foundry Local, Ollama, LM Studio, llama.cpp server and the local Hugging Face cache. You can also point it at an OpenAI-compatible endpoint.",
  },
  {
    q: "Can I use the OpenAI SDK?",
    a: "Yes. Every deployment exposes /api/v1 with an OpenAI-compatible chat completions route.",
  },
  {
    q: "Does it need a GPU?",
    a: "No. It runs on the CPU, but larger models need more memory. The app shows CPU, memory and runtime status.",
  },
  {
    q: "Is there a Windows desktop build?",
    a: "Not yet. The web version runs on Windows with Node.js. The desktop build is macOS only for now.",
  },
  {
    q: "How do I update?",
    a: "Download the new DMG and replace the app. Your workspace data stays in the app-data folder.",
  },
  {
    q: "Why does macOS warn about the app?",
    a: "The build is ad-hoc signed, not notarized. Right-click the app and choose Open the first time, or use System Settings > Privacy & Security > Open Anyway.",
  },
];

export const COMMANDS = [
  "git clone https://github.com/Sharjeelbaig/openFoundry.git",
  "cd openFoundry",
  "npm install",
  "npm run dev",
].join("\n");

export const REPO_FILES = {
  readme: `${REPO}/blob/main/README.md`,
  releases: `${REPO}/releases`,
  issues: `${REPO}/issues`,
  sourceZip: `${REPO}/archive/refs/heads/main.zip`,
  terms: `${REPO}/blob/main/TERMS.md`,
  privacy: `${REPO}/blob/main/PRIVACY.md`,
  trademarks: `${REPO}/blob/main/TRADEMARKS.md`,
  notices: `${REPO}/blob/main/NOTICE.md`,
  license: `${REPO}/blob/main/LICENSE`,
  deploymentTable: `${REPO}/blob/main/README.md#deployment-types`,
};
