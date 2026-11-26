# Changelog

All notable changes to `openfoundry-agent-framework` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-11-26

### Changed

- Independence is stated up front: the package is described as an independent adapter
  that wraps Microsoft's `agent-framework`, not as a Microsoft package.
- PyPI summary, README header and banner subtitle now name the Microsoft dependency
  instead of leading with it, and the "not affiliated with Microsoft" notice sits above
  the fold.
- Documentation index repeats the independence statement.

## [0.1.0] - 2026-11-26

First public release.

### Added

- `OpenFoundryCredential`, a `TokenCredential` that presents the openFoundry project API
  key as a bearer token, so the official `agent-framework` SDK can use a local project
  without an Entra tenant.
- `create_chat_client` for a `FoundryChatClient` bound to the local project endpoint.
- `create_agent` for an `Agent` with name, instructions and forwarded agent options.
- `create_project_client` for an `AIProjectClient` over the local project surface.
- `create_foundry_agent` for running prompt agent versions created on the project.
- `DEFAULT_PROJECT_ENDPOINT` and environment-variable configuration
  (`OPENFOUNDRY_PROJECT_ENDPOINT`, `OPENFOUNDRY_API_KEY`, `OPENFOUNDRY_MODEL`).
- Complete documentation: configuration, API reference, orchestration patterns, agent
  versions, troubleshooting and compatibility.
- Runnable examples for a single agent and for the sequential, concurrent, group chat,
  handoff and Magentic orchestrations.
- `py.typed` marker for type-checker support.
