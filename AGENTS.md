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

- Preserve the existing three-column layout and exact Mozi palette. A new native library starts in night appearance with five editable technology subscriptions, including 潮流周刊. On upgrade, add missing presets once if a legacy library has no active subscriptions. Preserve existing subscriptions, archives, articles, and preferences. Fetch articles through the normal refresh action.
- Rust owns network and SQLite; React owns reading UI. Never fall back to an empty writable library after native read failures.
- Serialize user-state writes, flush before quit, preserve existing article IDs on feed refresh, and keep refresh results behind an explicit load banner.
- Back up the current library before transactional restore. Unsubscribe is archival: preserve cached articles and bookmarks.
- Keep external pages outside the privileged WebView. Allow sanitized HTTP(S) image, audio and video URLs from article markup and feed attachments. Load images while reading, keep playback manual, and preserve article IDs across media changes. Keep third-party frames blocked.
- Full-text fetches validate and pin the resolved addresses at every redirect. If system DNS returns only virtual addresses from the benchmark range for an HTTPS domain, the reader may query Cloudflare DNS over HTTPS with the hostname and still requires public destination addresses and the origin's valid TLS certificate.
- Keep direct, lazy media loading as the default. Failed image loads in cached SSPAI full text can retry through the native reader on the known CDN, with an origin-only referrer and the public-address and size checks.

## Modu productization, 2026-11-18

- User named the repository `Yunz93/Modu` and product `墨牍`, approved a public repository, and requested code submission.
- Inherit applicable Mozi product contracts by inspecting its actual source; record adopted mechanisms and intentional differences in docs/mozi-practice-adoption.md.
- In-app updates must remain signed, tied to the announced version and repository, non-disruptive during downloads, and blocked when final reading-state save fails.
- Keep the update signing key outside the repository. Production builds exclude the update-qa feature and all insecure QA endpoint overrides.
- New native identity com.yunz.modu must migrate a consistent legacy com.yunz.shidu SQLite snapshot without changing the old library. Keep the browser storage key stable.
- The user requested re-examining actual Mozi practices, updating productize-app where needed, and completing applicable implementation. Keep the adoption matrix current; distinguish existing requirements missed during execution from new skill guidance.
- In native mode, enumerate installed fonts with CoreText while preserving manual input. Never reset typed preferences when the list arrives. Browser preview retains static suggestions.
- Native exit failure must offer retry, continue and export recovery. Cancelling an export must not exit. Failed loads must not initialize an existing incomplete database as an empty library.
- Keep feed failures visible with retry; cancelling a read invalidates late results, while only the actual commit briefly blocks closing. Full backups include canonical committed content and latest unsaved reading facts.
- Remember logical window sizes separately from screen position. Retain a single instance and native menus for existing settings and updates.
- Open global settings via the sidebar footer, the macOS Settings menu, or ⌘,. Put appearance, reading behavior, library maintenance, shortcuts and updates there. Keep the reader's Aa controls and the global settings on the same preferences and save queue.
- Setting changes should patch fields. Preserve legacy defaults and keep update work alive while the settings dialog is closed or another section is selected.

## Interface and reading settings

- On macOS, extend the active canvas color under the native traffic lights. Keep the titlebar draggable and place a Phosphor open-book icon immediately left of the 墨牍 wordmark.
- Use a white bold Phosphor RSS symbol on a rounded black tile for the macOS app icon. Use the bold RSS icon weight for subscription views.
- Show publication time only on the current local day, and include the year for older articles from a different year. Name the active search scope and return keyboard focus to the search trigger on Escape.
- Keep the article search field and scope dropdown on one row, with the dropdown on the right. Hide the list subtitle while searching, and show the clear action when the field has text.
- A left swipe reveals Unsubscribe on the right of the same row. Keep the subscription name on the left and use one shared row background and outline. Keep the source menu as another entry point. Both actions archive the subscription, offer immediate undo, and keep cached articles and reading facts. Archive and restore update the source flag without consuming pending refresh results.
- Follow Mozi's global Interface settings structure for display language, theme, accent and UI typography. Keep article typography, line width and reading behavior in Reading. Aa opens a compact panel that shares the reading font selector and text-size slider. The font choices include system default, system serif, Tsanger JinKai 04, KingHwa OldSong and installed or manually entered families. Resolve named presets through local fonts and show a fallback hint when a preset is unavailable. Keep monospace code typography out of the settings UI.
- Show accent presets as circular swatches with hover and accessible names. Show only the current color name beside the heading, ring the selected swatch, and give the custom picker its own space.
- Keep the shared 10–20 px font-size range and 1 px step in `src/font-sizes.json`. Default the UI to 14 px and reading to 16 px, both in the system sans-serif font. Keep font and size preferences independent. Read older backups and clamp values above the current limit.
- Place the light and dark appearance toggle immediately to the left of the bookmark in the reading toolbar. Switching explicitly selects a theme in the shared appearance preferences.
- Show the original article action as an icon with an accessible name and a tooltip at every width.
- Keep the reading toolbar's focus controls icon-only with accessible names and tooltips. Omit vertical separators between toolbar buttons.
- Keep subscription refresh results and error details in a dismissible popover beside the subscription controls. Keep per-source failure indicators and retry actions accessible, and leave the explicit load banner for queued articles in the article list.
- Scale the article title, section headings, and supporting text from the body size across languages and window widths. At 16 px, use a 28 px article title, 20 px primary section headings, 18 px secondary headings, and 14 px supporting text.
- Give the active sidebar category a muted accent background and an accent-colored icon. At the 16 px UI size, use a 24 px list heading and 18–19 px article-row titles with matching Chinese and English weights. Limit excerpts to two lines and align the source and date across rows. Group the reader title and byline closely, with more space before the body and above section headings.
- Keep the gap from the sidebar wordmark to the first category around 20–24 px in both desktop and drawer layouts.
- Place the text-size slider last in both Interface and Reading settings. Start the Aa popover directly with the reading font field and keep its accessible name.
- Keep the sidebar visible in the wide three-column layout and use a navigation drawer in narrow windows. Anchor the drawer controls at the same top-left coordinates and use an × to close it. Respect reduced motion. Keep the sidebar header, article categories and footer fixed. Scroll only the subscription list and hide its scrollbar. Use the same brand sizing and a subscription heading 2 px larger than feed names in both layouts. Place icon-only Add feed and Refresh feeds buttons to the right of the heading and use a separate Settings button in the footer.
- Put Check for updates alongside the current update status and last successful check. Keep download and install actions with their release details.
- Keep the three columns when adding list tools. Scope batch read to the displayed results and undo only that batch. Preserve the search query when changing scope, and index both the feed body and cached full text.
- Keep subscription metadata and refresh status separate from queued article payloads. Preserve OPML folder paths and manual order. Additive import writes only incoming records, with full replacements using the existing backup and generation checks.
- Offer opt-in automatic refresh while the app runs. Full text is requested explicitly and cached for the matching article URL. Hide the full-text action when the feed supplies a complete body, and keep it for excerpts and ambiguous content. Keep the feed content and its media available alongside the original link.
- Open requested full text after a successful fetch and keep the feed/full-text switch available in the reader toolbar. Store the two reading positions independently and offer an explicit refresh for already cached originals.
- Interpret Atom plain text as text. Preserve safe responsive images, subtitle tracks, MathML, code language hints and local article anchors. Render TeX and code highlighting locally. Provide external links for third-party frames and unsupported media or attachments.
