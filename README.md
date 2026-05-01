# Human Activity Controller

Human Activity Controller is a userscript for Tecnisign AVA pages that keeps a floating activity panel available while you work.

It runs locally in your browser and is meant to behave like a lightweight companion panel, not a browser extension.

## What it does

- Keeps a floating controller on supported AVA pages.
- Provides start, pause, stop, and hide controls, plus a draggable `HA` launcher square.
- Persists session state locally so a refresh can restore where you were.
- Lets you move the launcher square and reopen the panel from it.

## Supported sites

- `https://ava.tecnisign.pt/*`
- `https://ava.multiformactiva.pt/*`

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open the raw userscript file in GitHub:
   `https://raw.githubusercontent.com/eliaspc2/human-activity-controller/main/human-activity-controller.user.js`
3. Confirm the installation in your userscript manager.

If you already have an older local copy installed, remove that old copy first so the browser only uses this repository version.
Installing from the raw GitHub URL keeps Tampermonkey wired to the repository's `@updateURL`, so updates come from GitHub automatically.

If you hide the controller with `x`, the draggable `HA` launcher stays on the page so you can bring it back later.

## License

MIT. See [LICENSE](./LICENSE).
