# 21 Code

21 Code is a local-first HTML/CSS/JavaScript workspace for browsers and Android. It is an editor and project manager, not a hosted code execution service. The first visit creates an editable **Starter Website** example in IndexedDB; the project switcher opens the dashboard, where you can create a blank project, open recent projects, import a ZIP, or choose an example template. No account or network service is needed for local editing after the application has loaded.

## Requirements and setup

- Node.js 20 or later and npm.
- A modern browser with IndexedDB, JavaScript, `iframe srcdoc`, and Web Crypto. A secure context (HTTPS or localhost) is required for some browser capabilities, including clipboard and service workers.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The server binds to `0.0.0.0` for device/network previews; restrict access at the network layer if that is not desired.

```sh
npm test             # Vitest unit and storage/recovery tests
npm run build        # strict TypeScript checks, then production build in dist/
npm run preview      # serve the production build for local verification
```

Browser end-to-end tests use `playwright-core` and an **existing Chromium executable**. Start the dev server or production preview in another terminal first:

```sh
E2E_BROWSER_PATH=/path/to/chromium E2E_BASE_URL=http://127.0.0.1:5173/ npm run test:e2e
# Against a production preview, optionally test the cached shell offline:
E2E_BROWSER_PATH=/path/to/chromium E2E_BASE_URL=http://127.0.0.1:4173/ E2E_OFFLINE=1 npm run test:e2e
```

The browser test intentionally throws one error inside the preview to verify the console. It does not use `--disable-web-security`. Chromium is not downloaded by the project. On Linux, its normal shared-library dependencies must be installed.

## Android APK and GitHub Actions

The repository includes a Capacitor Android wrapper (`com.twentyonecode.editor`) for Android 6.0 / API 23 and newer. A reasonably recent Android System WebView is required. The app bundles the production web assets and stores projects inside its own WebView; it does not share projects with the browser version. Android exports use the system **Save** document picker, with bounded chunks and no broad storage permission. Some document providers may leave a partial file if an export is interrupted. The native wrapper and file picker have not yet been tested on a physical device.

The **Build Android APK** GitHub Actions workflow runs on pushes, pull requests, and manual dispatch. It installs Node 22 and Java 21, uses the runner’s Android SDK 35; runs the unit tests and web build; syncs Capacitor; builds `assembleDebug`; and uploads the **21-Code-Android-debug** artifact containing `21-Code-debug.apk` and `SHA256SUMS.txt`. Open the repository's **Actions** tab, select a successful run, and download the artifact ZIP. Extract the APK and install it on your device, allowing installation from that source when prompted.

This is an **installable debug-signed APK**, suitable for testing/sideloading, not a production or Play Store release. GitHub runners generate an ephemeral debug signing key, so APKs from different runs may not be able to update one another without uninstalling the old build (which deletes its local projects). Export a backup first. A production release requires a stable, securely managed signing key; no signing credentials are stored in this repository.

To build locally with Node 20+, Java 21, Android SDK platform 35/build-tools 35, and accepted Android SDK licenses:

```sh
npm ci
npm run android:debug
# android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run android:sync` builds the web assets and copies them into the Android project. Android Studio can also open the `android/` directory after this command. Generated assets, Gradle build output, and signing keys are intentionally excluded from Git.

## First run

1. The example opens `index.html`, `styles.css`, and `script.js` as actual CodeMirror tabs. The sidebar offers **Create project**, **Import ZIP**, and **Recent & examples**. On a phone, open the drawer with the menu button.
2. Choose **Create project** and the **Blank HTML** template to start a three-file site. The dashboard also includes Portfolio, Landing Page, Documentation, Blog, Product, Gallery, Browser Game, and the Studio Starter example.
3. Edit the files. Changes are autosaved after the configured delay. The status indicator says **Saved** only after the IndexedDB write completes; a failed write is shown explicitly.
4. Open **Live preview**. The HTML entry selector defaults to `index.html`; the preview updates after HTML, CSS, or JavaScript edits. The console displays actual preview logs and errors.
5. Use **Project actions → Export project ZIP** to download the project (or choose a save location on Android). Close or reload the app and open the project again from the dashboard to recover successfully saved files.
6. Use **Settings → Storage & backup** to export a JSON backup before clearing browser data or changing devices.

## Feature matrix

| Area | Status | Details |
| --- | --- | --- |
| Workbench and responsive navigation | Working | Dark/light/system themes, accent, desktop sidebar and resizable preview/console, mobile drawer and accessory bar, tabs, breadcrumbs, command palette, settings/help/about. |
| Projects and templates | Working | Create, search, sort, pin, rename, duplicate, archive, delete, and reopen projects. Nine editable starters, including the eight requested categories. |
| File management | Working | Nested files/folders, create, rename/move, duplicate files, delete, download, import assets, filename filter, sort, dirty indicators, and desktop tab reordering. Moves update entry metadata but do **not** rewrite source references. |
| CodeMirror editor | Working | HTML, CSS, JS/JSX, TS/TSX, JSON, Markdown, XML/SVG, YAML and plain text; line numbers, highlighting, folding, brackets, indentation, completion, search/replace, multiple cursors, history, line actions, comment toggle, and per-file cursor/scroll state while the app is open. |
| Mobile coding bar | Partial | Touch-friendly scrolling symbols, paired characters, navigation, indent/outdent, line actions, undo/redo, save and preview. It uses the browser's keyboard and viewport; behavior with every Android keyboard/IME and physical device has not been verified. |
| Formatting and document utilities | Partial | Prettier for HTML/SVG, CSS, JS/JSX, TS/TSX, JSON and Markdown, with optional format on manual save. Markdown and images/SVG can be viewed in the preview panel. No HTML outline or dedicated JSON tree. |
| Isolated web preview | Partial | Selected HTML entry, local linked classic scripts, stylesheets, static images/fonts, local relative paths, refresh/debounce, device widths, a separate tab in browsers, console and missing-resource warnings. See sandbox limitations below. |
| Console and diagnostics | Partial | Real console messages, runtime errors, filters/copy/clear and source links when available. Local HTML checks, JSON parsing and CodeMirror/Lezer syntax-parser observations are **not** a standards validator or full language server. Files over 2 MB are skipped by local syntax checks. |
| Search and snippets | Partial | Active-file CodeMirror search/replace; project search with case/whole-word/path filter, navigation, single and confirmed bulk replace. Built-in and user snippets can be searched, edited, imported and exported. Search returns at most 5,000 matches (first 500 displayed); snippet placeholders and project-path completion are not implemented. |
| Persistence and recovery | Partial | IndexedDB projects, files, tabs, settings and snippets; debounced autosave, manual save, dirty markers, background flush attempt, backup/restore and write errors. No revision history or recovery of edits made after the last successful write if the browser terminates abruptly. Concurrent tabs can overwrite one another. |
| Import/export | Working with limits | ZIP projects, individual file download, device file import, JSON backup and settings/snippet import/export. Duplicate device files require confirmation to skip; restores create new projects instead of overwriting. |
| Offline/PWA | Partial | The production service worker caches the application shell after a successful online load. Dynamically loaded formatter plugins are only available offline after they have been fetched online. Installability varies by browser. The Android APK bundles the web assets and does not rely on the browser service worker. |
| Git | Not implemented | No fake source-control or remote-operation controls. A real Git backend/authentication design would be needed. |
| Terminal and non-browser runtimes | Not implemented | No system terminal, Node, Python, PHP, Java or C++ runtime is claimed or simulated. |

## Preview isolation and limitations

Project HTML is parsed without inserting it into the editor's DOM. Local linked resources are converted to data URLs and the document runs inside an iframe with `sandbox="allow-scripts"` **without** `allow-same-origin`. The preview is therefore an opaque origin and cannot access the editor's IndexedDB, localStorage, DOM, or privileged APIs. A restrictive CSP blocks network resource loading and connections in the generated document. Console messages are accepted only from the active iframe and checked against a per-preview token. The browser-only separate-tab feature opens a trusted wrapper containing the same sandboxed iframe; it is hidden inside the Android WebView.

This is a **preview**, not a complete web server or a hardened remote execution environment:

- Storage, popups, form submissions, top-level navigation, external resources, and `fetch`/network connections are restricted. Project code may still navigate its own frame, after which the generated document's CSP no longer applies; the iframe sandbox remains in force. Do not run hostile or untrusted projects expecting CPU/memory isolation.
- Classic linked JavaScript and CSS, inline code, and static relative image/font assets are supported. Static HTML attributes and common CSS `url()`/`@import` references are rewritten. Dynamic JavaScript asset paths, module import graphs, complex `srcset`/CSS syntax, server-side routing, and APIs requiring an HTTP server may not work. TypeScript/JSX are highlighted but are not transpiled or executed.
- The preview builds data URLs in memory. Large assets and projects can be slow; the preview is not a substitute for testing on a real web server. Resource rewriting is deliberately conservative and blocks external references instead of silently loading them.
- Markdown is rendered in a separate script-disabled sandbox; SVG/image files are displayed as images, not inserted as active markup into the editor UI.

## Storage, imports and privacy

Projects are stored in this browser or Android WebView's IndexedDB, not in the operating-system filesystem or a cloud account. Browser site-data deletion, private browsing, Android app data clearing/uninstall, quota eviction, or device loss can remove them. Android automatic backup is disabled; export a backup yourself. Export ZIPs and backups regularly. A write can fail due to quota or browser policy; the application shows an error and does not claim those changes are saved. The background flush is best effort, not a guarantee if a process is killed during the debounce period.

Limits: 10 MB per file, 60 MB of file content per project, 1,500 entries per project, 30 MB compressed ZIP, and 100 MB per JSON backup. ZIP central-directory paths and Unicode path overrides are validated before import; traversal, absolute paths, duplicate paths, unsupported/encrypted archives, ZIP64/multi-disk archives, oversized members, and CRC mismatches are rejected. Decompression is streamed with expanded-size limits. Legacy ZIP filenames that are not valid UTF-8 may be rejected. JSON restore validates paths/content and creates new project IDs; if a storage quota error occurs during a multi-project restore, already restored copies remain and existing projects are untouched.

No analytics, accounts, credentials, remote Git, or external services are used by the application. Project code is untrusted. Exported files and backups contain your project content; store them appropriately.

## Deployment

Run `npm run build`, then serve `dist/` as static files at the **origin root** over HTTPS. The manifest and service-worker paths currently assume `/`; deployment under a subpath requires configuring Vite's base path and updating those URLs. `npm run preview` is for verification, not a hardened production server. Set appropriate hosting security headers, restrict access as needed, and preserve the preview iframe sandbox. Service worker caching requires HTTPS or localhost. Updates are network-first for the document and cache-first for versioned static assets.

## Verification performed

- `npm test`: 6 test files, 19 tests passed (file operations/tabs, templates, IndexedDB/settings, autosave/restart, ZIP safety and round trip, preview, search/replace, formatting, and Android export chunk/cancel/error handling).
- `npm run build`: TypeScript project checks and Vite production build passed.
- Production browser run: `E2E_BASE_URL=http://127.0.0.1:4173/ E2E_BROWSER_PATH=/tmp/chromium E2E_OFFLINE=1 LD_LIBRARY_PATH=/tmp/al2023/lib npm run test:e2e` passed desktop and mobile flows, including HTML/CSS/JS edits, image asset resolution, sandbox boundaries, runtime errors, autosave/reload, new-tab preview, ZIP export/import, responsive navigation, and offline shell reload. The `/tmp` browser/library paths were specific to the verification environment and are not part of this repository.

## Prioritized roadmap

1. Add revision snapshots, cross-tab conflict detection, and transactional multi-project restore.
2. Improve preview isolation with a dedicated origin, a proper virtual filesystem/service-worker resolver, module graphs, and stronger resource/time limits.
3. Add scalable worker-based project search, richer diagnostics, path completion, an outline, and snippet placeholders.
4. Validate the Android wrapper, document picker, IMEs, keyboard insets, accessibility and performance across physical devices.
5. Design optional real Git integration behind a service interface; add remote operations only with an actual backend and secure authentication.
