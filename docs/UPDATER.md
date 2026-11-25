# Modu updates and releases

Modu checks the [latest GitHub release manifest](https://github.com/Yunz93/Modu/releases/latest/download/latest.json). The desktop app verifies the update archive against the public key in `src-tauri/tauri.conf.json` and checks that the signed version matches the announced release. Before installation, Modu saves the reading session and backs up the library.

## Build and verify a release

Use a protected signing key outside the repository. Set `TAURI_SIGNING_PRIVATE_KEY_PATH` to its path or supply it through Tauri's signing environment variables. The key must match the public key in the app. Forks need their own key pair and release endpoint.

Run the following with the release tag in `RELEASE_TAG`:

```sh
npm run release:version -- "$RELEASE_TAG"
npm ci
npm run typecheck
npm test
npm run test:native
npm run tauri:build
npm run test:sites
npm run package:mac
npm run release:manifest
```

The release directory contains the DMG, app archive, updater signature, checksums, and `latest.json`. Upload all assets before making the release discoverable. Run `npm run release:verify` after publication to check the assets and manifest served by GitHub, then verify an upgrade from the previous release.

Updater signatures and macOS code signing serve separate purposes. Production builds exclude the `update-qa` feature.
