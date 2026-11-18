# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Selected product direction

- The user chose the first displayed design: classic three-column RSS reader, with warm paper surfaces, forest-green selection, and a Chinese serif reading face. `docs/reference.png` is the visual source of truth.
- Primary platform: macOS. Primary task: calmly read subscribed blogs and technical articles.
- This checkout now includes a Tauri 2 macOS desktop app plus browser preview. Network fetching and SQLite are desktop-only; keep browser localStorage behavior working. Do not imply signing/notarization or other platforms have been validated.
- Preserve reading position, selection, and input focus when unrelated state changes. Keep arrow keys available for normal reading scroll; J/K navigate articles.
- Use one plain CSS system with semantic tokens. Use Phosphor icons consistently; no additional icon family or raster assets are needed for this text-focused screen.

## Appearance update, 2026-11-17

- User explicitly requested Mozi's metal-gray dark appearance, customizable accent colors, and custom fonts. Their screenshots in `docs/references/mozi-dark.png` and `mozi-light.png` override the original mock's palette; preserve its three-column layout.
- Screenshot samples are the final color reference: dark canvas #24272c, dark accent #d49b7e; light canvas #faf8f4, light accent #a65f44. Mozi workspace.css differs by one level in a few channels, so do not silently replace sampled colors with approximate greens or grays.
- Use semantic `--accent` tokens. Custom accents adapt contrast for each appearance; Mozi defaults keep the exact sampled values.
- UI and reading fonts can be set independently by installed family name, with safe system/CJK fallback. This browser prototype does not scan the system font list or import font files. Preserve old reading-library data when adding optional appearance preferences.

## Desktop implementation, 2026-11-18

- Preserve the existing three-column layout and exact Mozi palette. Native first launch is an empty library with night appearance; imported preferences take precedence.
- Rust owns network and SQLite; React owns reading UI. Never fall back to an empty writable library after native read failures.
- Serialize user-state writes, flush before quit, preserve existing article IDs on feed refresh, and keep refresh results behind an explicit load banner.
- Back up the current library before transactional restore. Unsubscribe is archival: preserve cached articles and bookmarks.
- Keep external pages outside the privileged WebView. No cloud, AI, feed background refresh, or image loading is implied.

## Modu productization, 2026-11-18

- User named the repository `Yunz93/Modu` and product `墨牍`, approved a public repository, and requested code submission.
- Inherit applicable Mozi product contracts by inspecting its actual source; record adopted mechanisms and intentional differences in docs/mozi-practice-adoption.md.
- In-app updates must remain signed, tied to the announced version and repository, non-disruptive during downloads, and blocked when final reading-state save fails.
- Keep the update signing key outside the repository. Production builds exclude the update-qa feature and all insecure QA endpoint overrides.
- New native identity com.yunz.modu must migrate a consistent legacy com.yunz.shidu SQLite snapshot without changing the old library. Keep the browser storage key stable.
