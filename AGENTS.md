# Modu contributor guide

## Development

Use Node.js 22.22 or later, Rust 1.90 or later, and the macOS Command Line Tools. Run `npm ci` and `npm run tauri:dev` for the desktop app. Run `npm run dev` for the browser preview. Use a temporary `MODU_DATA_DIR` for desktop tests that write library data.

Run `npm run typecheck`, `npm test`, and `npm run test:native` for application changes. Preserve the browser build contract in `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs`. Verify it with `npm run build` and `npm run test:sites`.

## Reader and data

- React owns the UI. Tauri and Rust own desktop networking and SQLite. Preserve the browser preview's local storage and demo data.
- Preserve the three-pane layout on wide windows and the navigation drawer on narrow ones. Only the subscription list scrolls within the sidebar. Use semantic CSS tokens and Phosphor icons. Keep the paper-light and metal-gray palettes.
- Keep UI and reading appearance settings independent. Use system fonts by default and the shared 10–20 px range in `src/font-sizes.json`. Default to 14 px for the interface and 16 px for reading. Keep the Aa popover and global settings synchronized.
- Preserve reading position, selection, and input focus on unrelated changes. Keep arrow keys available for reading scroll. Scope batch read to displayed results, with undo. Preserve the query when changing the search scope.
- Preserve article IDs, subscriptions, archives, OPML folder paths, and reading preferences across refresh, migration, and restore. Unsubscribing archives the source and leaves cached articles and bookmarks available. Keep pending articles behind the explicit load banner.
- Serialize library writes, flush before quit or update, and back up before replacing data. Handle native read failure before allowing writes. Preserve recovery options for failed saves.
- Sanitize article HTML, open external pages outside the privileged WebView, and keep third-party frames blocked. Load allowed media lazily and keep playback manual. Preserve address validation across redirects and the existing network and size limits. Cache on-demand full text by article URL and keep the subscription content available.

## Publication

Follow the [update guide](docs/UPDATER.md) for signed releases. Keep signing keys, real reading-library exports, local logs, and personal captures out of Git. Use sample content for public screenshots.
