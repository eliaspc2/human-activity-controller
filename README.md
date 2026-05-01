# Human Activity Controller

Human Activity Controller is a userscript for Tecnisign AVA pages that keeps a floating activity panel available while you work.

It runs locally in your browser and is meant to behave like a lightweight companion panel, not a browser extension.

## What it does

- Keeps a floating controller on supported AVA pages.
- Provides start, pause, stop, and minimize controls.
- Persists session state locally so a refresh can restore where you were.
- Supports separate behavior for expanded and collapsed panel states.

## Supported sites

- `https://ava.tecnisign.pt/*`
- `https://ava.multiformactiva.pt/*`

## Install

1. Install a userscript manager such as Tampermonkey or Violentmonkey.
2. Open the raw userscript file in GitHub:
   `https://raw.githubusercontent.com/eliaspc2/human-activity-controller/main/human-activity-controller.user.js`
3. Confirm the installation in your userscript manager.

If you already have an older local copy installed, remove that old copy first so the browser only uses this repository version.

## License

MIT. See [LICENSE](./LICENSE).
