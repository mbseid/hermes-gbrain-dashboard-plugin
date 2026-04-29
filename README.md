# Brain — A Markdown Vault Viewer for Hermes Agent

A read-only, deep-linkable viewer for a folder of markdown notes, rendered as a tab inside the [Hermes Agent](https://github.com/NousResearch/hermes-agent) dashboard.

Built for personal knowledge-base setups where an AI agent (or you) writes notes to a directory and you want a clean way to browse them — without running a separate Obsidian / Logseq / wiki stack.

> **Primarily designed for use with [GBrain](https://github.com/garrytan/gbrain)** — a local-first, agent-native markdown knowledge base. GBrain handles the note-writing side (people, companies, projects, daily logs); this plugin gives you a browsable view of that vault inside your Hermes dashboard. It works with any folder of `.md` files, but the wikilink conventions and frontmatter format match GBrain's defaults out of the box.

## Features

- **File tree** of your vault (folders + `.md` files), grouped by directory
- **Rendered markdown** with GitHub-flavored syntax, code blocks, tables, blockquotes
- **Wikilinks** — `[[Note Name]]` and `[[Note|Alias]]` are clickable and navigate within the viewer
- **Relative `.md` links** also work (`[link](../people/mike.md)`)
- **YAML frontmatter** is stripped from the body and shown as a collapsible card; tags / aliases / categories surface as chips even when collapsed
- **Deep linking via URL hash** (`#path=people/mike.md`) — refresh, share, browser back/forward all work
- **Read-only** — no editing, no auth headaches, no sync layer

Designed to pair well with agents that maintain a markdown knowledge base on your behalf.

## Screenshot

_(Add a screenshot here.)_

## Requirements

- Hermes Agent ≥ 0.11 (needs the dashboard plugin system: `~/.hermes/plugins/<name>/dashboard/manifest.json`)
- A directory of `.md` files. Default location is `/opt/data/home/brain` — override with the `BRAIN_VAULT_PATH` environment variable.

## Install

### Option 1: Clone into the Hermes plugins directory

```bash
# $HERMES_HOME defaults to ~/.hermes (or /opt/data in the official Docker image)
mkdir -p "$HERMES_HOME/plugins"
git clone https://github.com/<you>/hermes-gbrain-dashboard-plugin.git "$HERMES_HOME/plugins/brain"
```

Then restart your Hermes dashboard (or the whole gateway). On Docker / Kubernetes, that's a `docker restart` / `kubectl rollout restart deployment/hermes`.

### Option 2: Download the release tarball

```bash
curl -L https://github.com/<you>/hermes-gbrain-dashboard-plugin/releases/latest/download/brain.tar.gz \
  | tar -xz -C "$HERMES_HOME/plugins/"
```

### Verify

After the dashboard reloads, you should see a **Brain** tab in the sidebar. Clicking it shows your vault tree.

If the tab appears but loading a note shows `JSON.parse: unexpected character at line 1 column 1`, the plugin's backend API routes weren't mounted — that means the dashboard process started **before** the plugin files were on disk. Restart the dashboard once more.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `BRAIN_VAULT_PATH` | `/opt/data/home/brain` | Path to the markdown vault directory |

Set on the dashboard container in your deployment manifest, or in `~/.hermes/.env`.

## Wikilink resolution

`[[Note Name]]` resolves by matching the filename stem (case-insensitive). Spaces are also matched against hyphens, so `[[Mike Seid]]` finds `mike-seid.md`. If multiple files match, the first one in the alphabetical walk wins. Aliases (`[[Note|Display Text]]`) work as expected.

## Architecture

Two files do all the work:

- **`dashboard/plugin_api.py`** — small FastAPI router that exposes:
  - `GET /api/plugins/brain/tree` — full vault file tree as nested JSON
  - `GET /api/plugins/brain/file?path=...` — raw markdown contents of a single file
  - `GET /api/plugins/brain/resolve?name=...` — resolve a wikilink target to a file path
  - All paths are validated against the vault root to block traversal.

- **`dashboard/dist/index.js`** — single IIFE bundle (no build step). Uses Hermes' Plugin SDK (React, hooks, UI primitives exposed on `window.__HERMES_PLUGIN_SDK__`). Markdown rendering via [marked](https://github.com/markedjs/marked) loaded from a CDN at runtime.

The whole thing is ~250 lines of Python and ~400 lines of JS. Easy to fork and extend.

## Roadmap / ideas

- Full-text search across the vault
- Graph view of wikilink connections
- Optional write tools (create note, append section) gated behind a flag
- File watcher → live reload when the agent edits a note in the background

PRs welcome.

## License

MIT — see [LICENSE](./LICENSE).

## Credits

Built by [@mbseid](https://github.com/mbseid) with assistance from a Hermes Agent. Pairs nicely with [GBrain](https://github.com/garrytan/gbrain) for the note-writing side of the equation.
