# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-13

### Added
- Initial public release as `@luckvd/ccbar` on npm.
- Real-time statusline: directory, git branch/remote/changes, session duration, context-window usage, model name, total tokens, and cost.
- Cross-session token/cost/duration accumulation that persists across `/clear`, isolated per git project.
- CLI options: `--version`/`-v`, `--help`/`-h`, `--reset-tokens`, `--reset-all-tokens`, `--show-history`.
- Toggleable display fields via `~/.claude/ccbar/config.json`.
- Per-model `modelPricing` and `modelContextWindow` overrides in `~/.claude/settings.json`.
- Built-in defaults for Claude models (Opus / Sonnet / Haiku 4.x). GLM and other providers supported via overrides.
