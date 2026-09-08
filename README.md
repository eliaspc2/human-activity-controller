# Human Activity Controller

Human Activity Controller is a userscript for Tecnisign AVA pages that keeps a floating activity panel available while you work.

It runs locally in your browser and is meant to behave like a lightweight companion panel, not a browser extension.

## What it does

- Keeps a floating controller on supported AVA pages.
- Provides start, pause, stop, and hide controls, plus a draggable `HA` launcher square.
- Starts hidden by default behind the `HA` launcher.
- Lets you edit the action mix with per-action numeric weight fields for scroll, mouse move, click, and refresh.
- Provides a reset button to restore the default action weights at any time.
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

The action weights are editable as `0` to `100` values with `5`-step arrows. The controller normalizes the active weights automatically when it chooses the next action, so the mix keeps working even if the values do not add up to exactly `100`. Use the `Reset` button if you want to return to the default mix.

## Development and validation

The installable userscript remains a standalone file with no runtime dependencies.
With Node.js 18 or newer, run:

```sh
node --check human-activity-controller.user.js
npm test
git diff --check
```

The regression suite executes the complete userscript in a simulated browser with controlled timers.
For browser validation, check hidden startup, opening/closing the launcher, start/pause/stop,
and refresh restoration on an isolated test page before using the supported sites.

### 1.3.5

- Cancel pending scroll steps on pause, stop, and teardown.
- Release late wake-lock requests and clean up listeners when replacing the controller.
- Validate saved session values and avoid identical storage writes.
- Skip hidden statistics rendering and redundant visible text updates.
- Add accessible names to interval and weight inputs.

## License

MIT. See [LICENSE](./LICENSE).
