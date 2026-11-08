// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

# Right-click behaviour

The desktop shell runs the workspace in a webview. Its stock right-click menu is
browser chrome: Reload, Back, Forward and Inspect Element. None of those are
product actions, and several of them destroy work in progress (Reload discards
an unsaved agent draft). The web build has the same problem in reverse: a
browser menu appears over an app that has no browser navigation.

`src/components/AppContextMenu.tsx` applies one rule to every screen.

## The rule

| Target under the pointer | Result |
| --- | --- |
| `input`, `textarea`, `select`, `[contenteditable=true]` | Keep the platform menu. Cut, Copy, Paste, spell check and dictation live there and cannot be reproduced faithfully in app code. |
| Any real text selection outside a field | Keep the platform menu, so Copy and Search with the system still work. |
| Chat message bubble | App menu with **Copy message**. |
| Code block, YAML view, JSON/response/log payload | App menu with **Copy**. |
| Everything else (cards, tables, canvases, charts, toolbars, navigation, empty states) | Suppress the menu. The platform menu is removed and no app menu is shown. |

No menu item is decorative. If a screen has nothing to copy or act on, it shows
nothing. Keyboard context-menu events follow the same rules.

## Screen by screen

| Screen | Right-click result |
| --- | --- |
| Sign in, Setup wizard | Profile, token and endpoint fields keep the native editing menu. Cards and the step rail have no menu. |
| Home, Discover (models, agents, tools, services, knowledge) | No menu on cards, filters and lists. Copy is available on code samples and endpoint snippets. |
| Build: Agents, Agent builder | Instructions and parameters keep the native field menu. Chat bubbles copy the message. YAML view and code samples copy their text. The canvas/tool list has no menu. |
| Build: Models, Deployments, Runtime nodes | No menu on tables and rows. Endpoint, key and sample code blocks copy. |
| Build: Knowledge, Memory, Guardrails, Evaluations, Tools, Toolboxes | No menu on lists and forms. Uploaded-document previews and code blocks copy. |
| Build: Workflows, Routines, Data, Fine-tune, Images, Speech | No menu on the React Flow canvas, runs tables or galleries. Run payloads and JSON previews copy. |
| Build: Voice | No menu on the call controls. Transcript and payload panes copy. |
| Playground | The composer and parameter fields keep the native menu. Assistant and user bubbles copy. |
| Operate (assets, compliance) | No menu on asset tables, charts or empty states. |
| Manage (project, access, gateway, quota, retention, tenants, resources) | No menu on tables or role pickers. API keys and endpoint samples copy. |
| Docs | Body text is selectable, so the native menu appears over a selection. Code blocks copy with the app menu. Headings and navigation have no menu. |
| Landing site | Not part of the app shell and unchanged; it is a normal web page. |

## What is deliberately not implemented

- **Reload, Back, Forward, Print, Save page, View source, Inspect.** These are
  browser actions, not product actions. The app has its own navigation,
  versioning and export.
- **A right-click menu on every card.** A menu with one item ("Copy name") is
  noise. The table above lists the places where copied text is actually useful.
- **Custom paste.** Clipboard read permissions differ across WebKit, WebView2 and
  Chromium. The native editing menu already does this correctly.

## Verification

1. Run the app, right-click an empty area of each screen: no menu appears.
2. Right-click a chat bubble: **Copy message**; paste it into a field and confirm
   the exact text.
3. Right-click a code block: **Copy**.
4. Right-click an input and a selected paragraph: the platform menu appears.
5. Right-click the workflow canvas: no menu, and drag/pan still works.
