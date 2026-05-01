// ==UserScript==
// @name         Human Activity Controller
// @namespace    https://github.com/eliaspc2/human-activity-controller
// @version      1.2.1
// @homepageURL  https://github.com/eliaspc2/human-activity-controller
// @downloadURL  https://raw.githubusercontent.com/eliaspc2/human-activity-controller/main/human-activity-controller.user.js
// @updateURL    https://raw.githubusercontent.com/eliaspc2/human-activity-controller/main/human-activity-controller.user.js
// @license      MIT
// @description  Floating controller with a draggable HA launcher for simulated reading-like activity with scroll, cursor movement, clicks, and refresh.
// @match        https://ava.tecnisign.pt/*
// @match        https://ava.multiformactiva.pt/*
// @noframes
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(async function() {
  'use strict';

  if (window.top !== window) {
    return;
  }

  const STYLE_ID = "human-activity-userscript-style";
  const ROOT_ID = "human-activity-userscript-root";
  const PANEL_ID = "human-activity-userscript-panel";
  const CURSOR_ID = "human-activity-userscript-cursor";
  const LAUNCHER_ID = "human-activity-userscript-launcher";
  const BOOT_PROBE_ID = "human-activity-boot-probe";
  const VERSION = "1.2.1";

  if (isPdfContext()) {
    return;
  }

  await waitForBody();
  if (isPdfContext() || hasEmbeddedPdfViewer()) {
    return;
  }
  mountBootProbe();

  const STATUS = {
    IDLE: "IDLE",
    RUNNING: "RUNNING",
    PAUSED: "PAUSED",
    STOPPED: "STOPPED",
    FINISHED: "FINISHED",
    REFRESHING: "REFRESHING",
  };

  const ACTION_WEIGHTS = Object.freeze({
    scroll: 0.55,
    move: 0.25,
    click: 0.15,
    refresh: 0.05,
  });

  const ACTION_LABELS = Object.freeze({
    scroll: "Scroll",
    move: "Mouse move",
    click: "Click",
    refresh: "Refresh",
  });

  const STORE_PREFIX = "human-activity-userscript:";
  const TAB_MARKER = "__hae_tab_id__=";
  const SESSION_KEY = `${STORE_PREFIX}session:${ensureTabId()}`;

  let panelOpen = true;
  let statusMode = STATUS.IDLE;
  let sessionTotalMs = 60 * 60 * 1000;
  let accumulatedElapsedMs = 0;
  let currentRunStartedAt = 0;
  let actionCount = 0;
  let nextActionAt = 0;
  let nextActionName = "-";
  let minDelaySeconds = 5;
  let maxDelaySeconds = 30;
  let enabledActions = createDefaultActionState();
  let actionVariancePercent = 20;
  let panelCollapsed = false;
  let panelExpandedPosition = null;
  let panelCollapsedPosition = null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let isLauncherDragging = false;
  let launcherDragOffsetX = 0;
  let launcherDragOffsetY = 0;
  let launcherDragMoved = false;
  let cursorTimer = null;
  let loopTimer = null;
  let statsTimer = null;
  let wakeLock = null;
  let focusPulseTimer = null;
  let panelPosition = null;
  let launcherPosition = null;
  let noteText = "Ready.";

  if (window.__humanActivityUserscript?.version === VERSION && window.__humanActivityUserscript?.focusPanel) {
    window.__humanActivityUserscript.focusPanel();
    removeBootProbe();
    return;
  }

  const existingRoot = document.getElementById(ROOT_ID);
  if (existingRoot) {
    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel && window.__humanActivityUserscript?.version === VERSION && window.__humanActivityUserscript?.focusPanel) {
      window.__humanActivityUserscript.focusPanel();
      return;
    }

    existingRoot.remove();
    delete window.__humanActivityUserscript;
  }

  injectStyles();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.dataset.humanActivityRoot = "true";

  const cursor = document.createElement("div");
  cursor.id = CURSOR_ID;
  cursor.setAttribute("aria-hidden", "true");

  const launcher = document.createElement("button");
  launcher.id = LAUNCHER_ID;
  launcher.type = "button";
  launcher.dataset.humanActivityRoot = "true";
  launcher.textContent = "HA";
  launcher.title = "Abrir Human Activity";
  launcher.setAttribute("aria-label", "Abrir Human Activity");

  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.dataset.humanActivityRoot = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Human Activity Controller");
  buildPanel(panel);

  root.appendChild(cursor);
  root.appendChild(launcher);
  root.appendChild(panel);
  mountRoot();
  removeBootProbe();
  console.info(`[HumanActivity] controller mounted v${VERSION}`, location.href);

  const startButton = panel.querySelector("#hae-start");
  const pauseButton = panel.querySelector("#hae-pause");
  const stopButton = panel.querySelector("#hae-stop");
  const closeButton = panel.querySelector("#hae-close");
  const panelBody = panel.querySelector(".hae-body");
  const progressBar = panel.querySelector("#hae-progress-bar");
  const minutesInput = panel.querySelector("#hae-minutes");
  const plus5Button = panel.querySelector("#hae-plus-5");
  const plus30Button = panel.querySelector("#hae-plus-30");
  const plus60Button = panel.querySelector("#hae-plus-60");
  const minDelaySlider = panel.querySelector("#hae-min-delay");
  const maxDelaySlider = panel.querySelector("#hae-max-delay");
  const actionVarianceSlider = panel.querySelector("#hae-action-variance");
  const minDelayValue = panel.querySelector("#hae-min-delay-value");
  const maxDelayValue = panel.querySelector("#hae-max-delay-value");
  const actionVarianceValue = panel.querySelector("#hae-action-variance-value");
  const actionToggleInputs = {
    scroll: panel.querySelector("#hae-action-scroll"),
    move: panel.querySelector("#hae-action-move"),
    click: panel.querySelector("#hae-action-click"),
    refresh: panel.querySelector("#hae-action-refresh"),
  };
  const noteValue = panel.querySelector("#hae-note");
  const versionValue = panel.querySelector("#hae-version");
  const statusValue = panel.querySelector("#hae-status");
  const nextActionValue = panel.querySelector("#hae-next-action");
  const countdownValue = panel.querySelector("#hae-countdown");
  const actionsValue = panel.querySelector("#hae-actions-count");
  const timeValue = panel.querySelector("#hae-time");
  const dragbar = panel.querySelector(".hae-header");

  launcher.addEventListener("click", handleLauncherClick);
  launcher.addEventListener("mousedown", handleLauncherDragStart);
  plus5Button.addEventListener("click", () => void addTime(5));
  plus30Button.addEventListener("click", () => void addTime(30));
  plus60Button.addEventListener("click", () => void addTime(60));
  minutesInput.addEventListener("input", handleMinutesTyping);
  minutesInput.addEventListener("change", () => void handleMinutesChange());
  minDelaySlider.addEventListener("input", () => void syncDelayRange());
  maxDelaySlider.addEventListener("input", () => void syncDelayRange());
  actionVarianceSlider.addEventListener("input", () => void handleActionVarianceChange());
  Object.entries(actionToggleInputs).forEach(([actionName, input]) => {
    input.addEventListener("change", () => void handleActionToggle(actionName));
  });
  startButton.addEventListener("click", () => void handleStartClick());
  pauseButton.addEventListener("click", () => void pauseSession());
  stopButton.addEventListener("click", () => void stopSession(STATUS.STOPPED));
  closeButton.addEventListener("click", () => void hidePanel());
  dragbar.addEventListener("mousedown", handleDragStart);
  document.addEventListener("mousemove", handleDragMove);
  document.addEventListener("mouseup", handleDragEnd);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handlePageUnload);
  window.addEventListener("pagehide", handlePageUnload);

  syncDelayRange({ persist: false });
  setPanelCollapsed(panelCollapsed, { persist: false });
  updateUiState();

  void initialize();

  window.__humanActivityUserscript = {
    version: VERSION,
    destroy,
    focusPanel,
    showPanel,
    resetPanel: () => {
      panelPosition = null;
      panelExpandedPosition = null;
      panelCollapsedPosition = null;
      launcherPosition = null;
      panel.style.right = "auto";
      panel.style.left = "16px";
      panel.style.top = "16px";
      launcher.style.right = "auto";
      launcher.style.left = "16px";
      launcher.style.top = "";
      launcher.style.bottom = "16px";
      setPanelCollapsed(false, { persist: false });
      return showPanel();
    },
  };

  async function initialize() {
    const savedSession = await loadSavedSession();

    const initialPanelPosition =
      savedSession?.panelExpandedPosition ?? savedSession?.panelPosition ?? null;
    const initialLauncherPosition = savedSession?.launcherPosition ?? null;

    if (initialPanelPosition) {
      applyPanelPosition(initialPanelPosition);
    }

    if (initialLauncherPosition) {
      applyLauncherPosition(initialLauncherPosition);
    }

    if (savedSession) {
      hydrateSession(savedSession);
    } else {
      await persistSession();
    }

    if (panelOpen) {
      focusPanel();
    } else {
      panel.style.display = "none";
    }

    updateUiState();

    if (statusMode === STATUS.RUNNING) {
      startStatsLoop();
      void requestWakeLock();
      scheduleNextAction({ freshCycle: true });
      updateStats();
    }

    clampPanelToViewport();
  }

  function mountRoot() {
    const host = document.body || document.documentElement;
    host.appendChild(root);
  }

  function waitForBody() {
    if (document.body) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done || !document.body) {
          return;
        }

        done = true;
        window.clearInterval(timer);
        document.removeEventListener("DOMContentLoaded", finish);
        resolve();
      };

      const timer = window.setInterval(finish, 25);
      document.addEventListener("DOMContentLoaded", finish, { once: true });
      window.setTimeout(finish, 0);
      finish();
    });
  }

  function isPdfContext() {
    const contentType = String(document.contentType || "").toLowerCase();
    if (contentType === "application/pdf") {
      return true;
    }

    return /\.pdf(?:[?#]|$)/i.test(location.href);
  }

  function hasEmbeddedPdfViewer() {
    return Boolean(
      document.querySelector(
        "embed[type='application/pdf'], object[type='application/pdf'], iframe[src*='.pdf'], embed[src*='.pdf'], object[data*='.pdf']"
      )
    );
  }

  function mountBootProbe() {
    const mount = () => {
      if (document.getElementById(BOOT_PROBE_ID)) {
        return;
      }

      const probe = document.createElement("div");
      probe.id = BOOT_PROBE_ID;
      probe.textContent = "HA boot";
      probe.title = `Human Activity started v${VERSION}`;
      probe.style.cssText = [
        "position:fixed",
        "left:16px",
        "bottom:16px",
        "z-index:2147483647",
        "padding:8px 10px",
        "border-radius:10px",
        "border:1px solid rgba(15,23,42,.14)",
        "border-top:3px solid #0f766e",
        "background:rgba(248,250,252,.98)",
        "color:#0f172a",
        "box-shadow:0 12px 30px rgba(15,23,42,.18)",
        "font:700 12px/1 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif",
        "letter-spacing:0",
        "pointer-events:none",
      ].join(";");

      const host = document.body || document.documentElement;
      host.appendChild(probe);
    };

    try {
      if (document.body || document.documentElement) {
        mount();
        return;
      }

      document.addEventListener("DOMContentLoaded", mount, { once: true });
    } catch (error) {
      console.debug("[HumanActivity] boot probe failed", error);
    }
  }

  function removeBootProbe() {
    try {
      document.getElementById(BOOT_PROBE_ID)?.remove();
    } catch {}
  }

  function buildPanel(target) {
    const header = node("div", { className: "hae-header" });
    const headerCopy = node("div", { className: "hae-header-copy" });
    const titleRow = node("div", { className: "hae-title-row" });
    titleRow.appendChild(node("span", { className: "hae-title-text", text: "Human Activity" }));
    titleRow.appendChild(node("span", { className: "hae-version", id: "hae-version", text: `v${VERSION}` }));
    headerCopy.appendChild(titleRow);
    headerCopy.appendChild(node("div", { className: "hae-subtitle", id: "hae-note", text: "Ready." }));
    header.appendChild(headerCopy);
    const headerControls = node("div", { className: "hae-header-controls" });
    headerControls.appendChild(node("button", {
      className: "hae-icon-button",
      id: "hae-close",
      type: "button",
      title: "Hide controller",
      ariaLabel: "Hide controller",
      text: "x",
    }));
    header.appendChild(headerControls);

    const body = node("div", { className: "hae-body" });

    const progress = node("div", { className: "hae-progress" });
    progress.appendChild(node("div", { className: "hae-progress-bar", id: "hae-progress-bar" }));

    const actions = node("div", { className: "hae-actions" });
    actions.appendChild(node("button", { className: "hae-button hae-button-start", id: "hae-start", type: "button", text: "Start" }));
    actions.appendChild(node("button", { className: "hae-button hae-button-pause", id: "hae-pause", type: "button", text: "Pause" }));
    actions.appendChild(node("button", { className: "hae-button hae-button-stop", id: "hae-stop", type: "button", text: "Stop" }));

    const durationRow = node("div", { className: "hae-duration-row" });
    const numberWrap = node("div", { className: "hae-number-wrap" });
    numberWrap.appendChild(node("input", {
      id: "hae-minutes",
      type: "text",
      inputMode: "numeric",
      pattern: "[0-9]*",
      autocomplete: "off",
      spellcheck: "false",
      value: "60",
    }));
    numberWrap.appendChild(node("span", { className: "hae-number-suffix", text: "min" }));
    durationRow.appendChild(numberWrap);
    durationRow.appendChild(node("button", { className: "hae-chip", id: "hae-plus-5", type: "button", text: "+5" }));
    durationRow.appendChild(node("button", { className: "hae-chip", id: "hae-plus-30", type: "button", text: "+30" }));
    durationRow.appendChild(node("button", { className: "hae-chip", id: "hae-plus-60", type: "button", text: "+60" }));

    const intervalStack = node("div", { className: "hae-slider-stack" });
    intervalStack.appendChild(sliderRow("Min.", "hae-min-delay", "range", "1", "60", "5", "hae-min-delay-value", "5s"));
    intervalStack.appendChild(sliderRow("Max.", "hae-max-delay", "range", "10", "180", "30", "hae-max-delay-value", "30s"));

    const varianceStack = node("div", { className: "hae-slider-stack" });
    varianceStack.appendChild(sliderRow("Var.", "hae-action-variance", "range", "0", "100", "20", "hae-action-variance-value", "20%"));

    const actionGrid = node("div", { className: "hae-action-grid" });
    actionGrid.appendChild(actionToggle("hae-action-scroll", "Scroll", "55%"));
    actionGrid.appendChild(actionToggle("hae-action-move", "Mouse", "25%"));
    actionGrid.appendChild(actionToggle("hae-action-click", "Click", "15%"));
    actionGrid.appendChild(actionToggle("hae-action-refresh", "Refresh", "5%"));

    const statusGrid = node("div", { className: "hae-status-grid" });
    statusGrid.appendChild(statusRow([
      node("span", { className: "hae-status-label", text: "Status" }),
      node("strong", { className: "hae-status-value", id: "hae-status", text: "IDLE" }),
      node("span", { className: "hae-status-label", text: "Actions" }),
      node("strong", { className: "hae-status-value hae-status-value-neutral", id: "hae-actions-count", text: "0" }),
    ]));
    statusGrid.appendChild(statusRow([
      node("span", { className: "hae-status-label", text: "Next" }),
      node("strong", { className: "hae-status-value hae-status-value-accent", id: "hae-next-action", text: "-" }),
      node("span", { className: "hae-status-label", text: "Elapsed" }),
      node("strong", { className: "hae-status-value hae-status-value-neutral", id: "hae-time", text: "0s" }),
    ]));
    statusGrid.appendChild(statusRow([
      node("span", { className: "hae-status-label", text: "Remaining" }),
      node("strong", { className: "hae-status-value hae-status-value-warning hae-status-value-neutral", id: "hae-countdown", text: "-" }),
    ]));

    body.appendChild(progress);
    body.appendChild(actions);
    body.appendChild(node("label", { className: "hae-label", htmlFor: "hae-minutes", text: "Duration" }));
    body.appendChild(durationRow);
    body.appendChild(node("label", { className: "hae-label", htmlFor: "hae-min-delay", text: "Interval (seconds)" }));
    body.appendChild(intervalStack);
    body.appendChild(node("label", { className: "hae-label", htmlFor: "hae-action-variance", text: "Action variance" }));
    body.appendChild(varianceStack);
    body.appendChild(node("label", { className: "hae-label", text: "Actions" }));
    body.appendChild(actionGrid);
    body.appendChild(statusGrid);

    target.appendChild(header);
    target.appendChild(body);
  }

  function sliderRow(labelText, inputId, inputType, min, max, value, valueId, valueText) {
    const row = node("div", { className: "hae-slider-row" });
    row.appendChild(node("span", { className: "hae-slider-label", text: labelText }));
    row.appendChild(node("input", { id: inputId, type: inputType, min, max, value }));
    row.appendChild(node("span", { className: "hae-slider-value", id: valueId, text: valueText }));
    return row;
  }

  function actionToggle(inputId, name, weight) {
    const label = node("label", { className: "hae-action-toggle", htmlFor: inputId });
    label.appendChild(node("input", { id: inputId, type: "checkbox", checked: true }));
    label.appendChild(node("span", { className: "hae-action-name", text: name }));
    label.appendChild(node("span", { className: "hae-action-weight", text: weight }));
    return label;
  }

  function statusRow(children) {
    const row = node("div", { className: "hae-status-row" });
    children.forEach((child) => row.appendChild(child));
    return row;
  }

  function node(tagName, options = {}) {
    const element = document.createElement(tagName);

    if (options.id) element.id = options.id;
    if (options.className) element.className = options.className;
    if (options.text != null) element.textContent = String(options.text);
    if (options.type) element.setAttribute("type", options.type);
    if (options.title) element.setAttribute("title", options.title);
    if (options.ariaLabel) element.setAttribute("aria-label", options.ariaLabel);
    if (options.htmlFor) element.setAttribute("for", options.htmlFor);
    if (options.inputMode) element.setAttribute("inputmode", options.inputMode);
    if (options.pattern) element.setAttribute("pattern", options.pattern);
    if (options.autocomplete) element.setAttribute("autocomplete", options.autocomplete);
    if (options.spellcheck) element.setAttribute("spellcheck", options.spellcheck);
    if (options.min != null) element.setAttribute("min", String(options.min));
    if (options.max != null) element.setAttribute("max", String(options.max));
    if (options.value != null) element.setAttribute("value", String(options.value));
    if (options.checked != null) element.checked = Boolean(options.checked);

    return element;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        all: initial;
      }

      #${LAUNCHER_ID} {
        position: fixed;
        left: 16px;
        bottom: 16px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        border: 1px solid rgba(15, 23, 42, 0.14);
        border-top: 3px solid #0f766e;
        border-radius: 12px;
        background: rgba(248, 250, 252, 0.98);
        color: #0f172a;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
        font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        cursor: grab;
        user-select: none;
        touch-action: none;
        backdrop-filter: blur(10px);
      }

      #${LAUNCHER_ID}:hover {
        background: #ffffff;
        color: #0f766e;
      }

      #${LAUNCHER_ID}:active {
        cursor: grabbing;
      }

      #${CURSOR_ID} {
        position: fixed;
        left: 0;
        top: 0;
        width: 13px;
        height: 13px;
        background: radial-gradient(circle at 30% 30%, #d2fbe5 0%, #63d39a 34%, #0f8f61 100%);
        border-radius: 999px;
        box-shadow: 0 0 18px rgba(99, 211, 154, 0.7);
        z-index: 2147483646;
        pointer-events: none;
        transform: translate(-9999px, -9999px);
        transition: transform 0.58s cubic-bezier(.22, .61, .36, 1);
        display: none;
      }

      #${PANEL_ID} {
        position: fixed;
        top: 70px;
        right: 32px;
        width: 354px;
        box-sizing: border-box;
        padding: 14px 16px 16px;
        border-radius: 14px;
        background: rgba(248, 250, 252, 0.98);
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.14);
        border-top: 4px solid #0f766e;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.35;
        z-index: 2147483647;
        user-select: none;
        backdrop-filter: blur(10px);
      }

      #${PANEL_ID}.hae-focus {
        box-shadow: 0 0 0 2px rgba(99, 211, 154, 0.18), 0 16px 40px rgba(15, 23, 42, 0.18);
      }

      #${PANEL_ID} * {
        box-sizing: border-box;
        font-family: inherit;
      }

      #${PANEL_ID} button,
      #${PANEL_ID} input {
        all: revert;
        font-family: inherit;
      }

      #${PANEL_ID} button {
        cursor: pointer;
      }

      #${PANEL_ID} button:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      #${PANEL_ID} .hae-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: start;
        margin-bottom: 12px;
      }

      #${PANEL_ID} .hae-header-controls {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
      }

      #${PANEL_ID} .hae-header-copy {
        min-width: 0;
      }

      #${PANEL_ID} .hae-title-row {
        display: flex;
        align-items: baseline;
        gap: 10px;
        min-width: 0;
      }

      #${PANEL_ID} .hae-title-text {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0;
        min-width: 0;
        color: #0f172a;
      }

      #${PANEL_ID} .hae-version {
        color: #475569;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      #${PANEL_ID} .hae-subtitle {
        margin-top: 2px;
        color: #64748b;
        font-size: 11px;
        min-height: 16px;
      }

      #${PANEL_ID}.hae-collapsed {
        width: 44px;
        min-width: 44px;
        height: 44px;
        min-height: 44px;
        padding: 0;
        border-radius: 999px;
        overflow: hidden;
      }

      #${PANEL_ID}.hae-collapsed .hae-header {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        margin-bottom: 0;
      }

      #${PANEL_ID}.hae-collapsed .hae-header-copy,
      #${PANEL_ID}.hae-collapsed .hae-close,
      #${PANEL_ID}.hae-collapsed .hae-version,
      #${PANEL_ID}.hae-collapsed .hae-subtitle,
      #${PANEL_ID}.hae-collapsed .hae-body {
        display: none;
      }

      #${PANEL_ID}.hae-collapsed .hae-header-controls {
        width: 100%;
        justify-content: center;
      }

      #${PANEL_ID}.hae-collapsed .hae-icon-button {
        width: 32px;
        height: 32px;
        font-size: 20px;
      }

      #${PANEL_ID} .hae-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #64748b;
        font-size: 18px;
        line-height: 1;
      }

      #${PANEL_ID} .hae-icon-button:hover {
        background: rgba(15, 23, 42, 0.06);
        color: #0f172a;
      }

      #${PANEL_ID} .hae-progress {
        height: 4px;
        margin-bottom: 12px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }

      #${PANEL_ID} .hae-progress-bar {
        width: 0;
        height: 100%;
        background: linear-gradient(90deg, #63d39a, #35b3ff);
        box-shadow: 0 0 12px rgba(99, 211, 154, 0.35);
        transition: width 0.25s ease;
      }

      #${PANEL_ID} .hae-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 10px;
      }

      #${PANEL_ID} .hae-button {
        border: 0;
        border-radius: 10px;
        padding: 10px 0;
        font-size: 12px;
        font-weight: 700;
        color: #ffffff;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      #${PANEL_ID} .hae-button-start {
        background: linear-gradient(180deg, #2563eb, #1d4ed8);
      }

      #${PANEL_ID} .hae-button-pause {
        background: linear-gradient(180deg, #0f766e, #115e59);
      }

      #${PANEL_ID} .hae-button-stop {
        background: linear-gradient(180deg, #dc2626, #b91c1c);
      }

      #${PANEL_ID} .hae-label {
        display: block;
        margin-bottom: 7px;
        color: #334155;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      #${PANEL_ID} .hae-duration-row {
        display: grid;
        grid-template-columns: 112px repeat(3, 62px);
        gap: 8px;
        align-items: center;
        margin-bottom: 14px;
      }

      #${PANEL_ID} .hae-number-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 112px;
        min-width: 112px;
        flex-wrap: nowrap;
      }

      #${PANEL_ID} #hae-minutes {
        width: 72px;
        min-width: 72px;
        max-width: 72px;
        flex: 0 0 72px;
        box-sizing: border-box;
        min-height: 38px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: #ffffff;
        color: #0f172a;
        -webkit-text-fill-color: #0f172a;
        opacity: 1;
        text-align: center;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
        caret-color: #0f766e;
      }

      #${PANEL_ID} #hae-minutes::placeholder {
        color: #94a3b8;
      }

      #${PANEL_ID} .hae-number-suffix {
        color: #64748b;
        font-size: 11px;
      }

      #${PANEL_ID} .hae-chip {
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 10px;
        padding: 8px 0;
        min-width: 62px;
        background: #f8fafc;
        color: #334155;
        font-size: 11px;
      }

      #${PANEL_ID} .hae-slider-stack {
        display: grid;
        gap: 8px;
        margin-bottom: 12px;
      }

      #${PANEL_ID} .hae-slider-row {
        display: grid;
        grid-template-columns: 30px 1fr 34px;
        align-items: center;
        gap: 8px;
      }

      #${PANEL_ID} .hae-slider-label {
        color: #64748b;
        font-size: 11px;
      }

      #${PANEL_ID} .hae-slider-value {
        color: #0f766e;
        font-size: 12px;
        font-weight: 700;
        text-align: right;
      }

      #${PANEL_ID} input[type="range"] {
        width: 100%;
        accent-color: #2563eb;
      }

      #${PANEL_ID} .hae-action-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 14px;
      }

      #${PANEL_ID} .hae-action-toggle {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: #ffffff;
        color: #334155;
        font-size: 11px;
      }

      #${PANEL_ID} .hae-action-toggle input {
        margin: 0;
        accent-color: #0f766e;
      }

      #${PANEL_ID} .hae-action-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${PANEL_ID} .hae-action-weight {
        color: #0f766e;
        font-size: 11px;
        font-weight: 700;
      }

      #${PANEL_ID} .hae-status-grid {
        display: grid;
        gap: 8px;
      }

      #${PANEL_ID} .hae-status-row {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        gap: 8px;
        align-items: baseline;
      }

      #${PANEL_ID} .hae-status-row:last-child {
        grid-template-columns: auto 1fr;
        align-items: center;
      }

      #${PANEL_ID} .hae-status-label {
        color: #64748b;
        font-size: 11px;
      }

      #${PANEL_ID} .hae-status-value {
        color: #0f172a;
        font-size: 12px;
        font-weight: 700;
      }

      #${PANEL_ID} .hae-status-value-neutral {
        text-align: right;
      }

      #${PANEL_ID} .hae-status-value-accent {
        color: #2563eb;
      }

      #${PANEL_ID} .hae-status-value-warning {
        color: #d97706;
        font-size: 16px;
      }

      #${PANEL_ID} .hae-status-row:last-child .hae-status-value {
        justify-self: end;
        text-align: right;
      }
    `;

    document.documentElement.appendChild(style);
  }

  function getStorageValue(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function setStorageValue(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  function deleteStorageValue(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  async function loadSavedSession() {
    return getStorageValue(SESSION_KEY, null);
  }

  function persistSessionSync() {
    setStorageValue(SESSION_KEY, buildSessionSnapshot());
  }

  async function persistSession() {
    persistSessionSync();
  }

  async function clearSavedSession() {
    deleteStorageValue(SESSION_KEY);
  }

  function buildSessionSnapshot() {
    return {
      panelOpen,
      statusMode,
      sessionTotalMs,
      accumulatedElapsedMs,
      currentRunStartedAt,
      actionCount,
      nextActionAt,
      nextActionName,
      minDelaySeconds,
      maxDelaySeconds,
      actionVariancePercent,
      panelCollapsed,
      panelExpandedPosition,
      panelCollapsedPosition,
      launcherPosition,
      enabledActions: { ...enabledActions },
      minutesValue: minutesInput.value,
      panelPosition,
    };
  }

  function hydrateSession(session) {
    const now = Date.now();

    panelOpen = session.panelOpen !== false;
    minDelaySeconds = clamp(Number(session.minDelaySeconds ?? minDelaySeconds), 1, 60);
    maxDelaySeconds = clamp(Number(session.maxDelaySeconds ?? maxDelaySeconds), 1, 180);
    actionVariancePercent = clamp(Number(session.actionVariancePercent ?? actionVariancePercent), 0, 100);
    panelCollapsed = false;
    actionCount = Number(session.actionCount ?? 0);
    nextActionAt = Number(session.nextActionAt ?? 0);
    nextActionName = session.nextActionName ?? "-";
    enabledActions = normalizeEnabledActions(session.enabledActions);
    const legacyPanelPosition = session.panelPosition ?? null;
    panelExpandedPosition = session.panelExpandedPosition ?? legacyPanelPosition;
    panelCollapsedPosition = session.panelCollapsedPosition ?? legacyPanelPosition;
    panelPosition = panelCollapsed ? panelCollapsedPosition : panelExpandedPosition;
    launcherPosition = session.launcherPosition ?? null;

    if (session.minutesValue) {
      minutesInput.value = String(session.minutesValue);
    }

    if (session.statusMode) {
      statusMode = session.statusMode;
      sessionTotalMs = Number(session.sessionTotalMs ?? sessionTotalMs);
      accumulatedElapsedMs = Number(session.accumulatedElapsedMs ?? 0);
      currentRunStartedAt = Number(session.currentRunStartedAt ?? 0);

      if (statusMode === STATUS.REFRESHING) {
        statusMode = STATUS.RUNNING;
      }
    } else {
      statusMode = STATUS.IDLE;
      accumulatedElapsedMs = 0;
      currentRunStartedAt = 0;
    }

    minDelaySlider.value = String(minDelaySeconds);
    maxDelaySlider.value = String(maxDelaySeconds);
    actionVarianceSlider.value = String(actionVariancePercent);
    syncActionToggles();
    void setPanelCollapsed(panelCollapsed, { persist: false });

    if (statusMode === STATUS.RUNNING && currentRunStartedAt === 0) {
      currentRunStartedAt = now;
    }

    if (statusMode === STATUS.RUNNING && getRemainingMs(now) <= 0) {
      accumulatedElapsedMs = sessionTotalMs;
      currentRunStartedAt = 0;
      nextActionAt = 0;
      nextActionName = "-";
      statusMode = STATUS.FINISHED;
    }

    setStatus(statusMode, { persist: false });

    if (panelPosition) {
      applyPanelPosition(panelPosition);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function ensureTabId() {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const current = String(window.name || "");
      const match = current.match(new RegExp(`(?:^|\\|)${TAB_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([A-Za-z0-9_-]+)`));
      if (match) {
        return match[1];
      }

      window.name = current ? `${current}|${TAB_MARKER}${id}` : `${TAB_MARKER}${id}`;
    } catch {
      return id;
    }

    return id;
  }

  function createDefaultActionState() {
    return {
      scroll: true,
      move: true,
      click: true,
      refresh: true,
    };
  }

  function normalizeEnabledActions(candidate) {
    const normalized = createDefaultActionState();

    for (const actionName of Object.keys(normalized)) {
      if (candidate && Object.prototype.hasOwnProperty.call(candidate, actionName)) {
        normalized[actionName] = Boolean(candidate[actionName]);
      }
    }

    if (!Object.values(normalized).some(Boolean)) {
      normalized.scroll = true;
    }

    return normalized;
  }

  function hasRunningState() {
    return statusMode === STATUS.RUNNING || statusMode === STATUS.PAUSED || statusMode === STATUS.REFRESHING;
  }

  async function requestWakeLock() {
    if (statusMode !== STATUS.RUNNING || !("wakeLock" in navigator) || document.visibilityState !== "visible") {
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
        if (statusMode === STATUS.RUNNING) {
          void requestWakeLock();
        }
      });
    } catch (error) {
      console.debug("Human Activity userscript could not acquire wake lock.", error);
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) {
      return;
    }

    try {
      await wakeLock.release();
    } catch (error) {
      console.debug("Human Activity userscript wake lock release failed.", error);
    } finally {
      wakeLock = null;
    }
  }

  function jitter(value) {
    return value + (Math.random() - 0.5) * value * 0.3;
  }

  function randomCenterPoint() {
    return {
      x: window.innerWidth * (0.3 + Math.random() * 0.4),
      y: window.innerHeight * (0.25 + Math.random() * 0.5),
    };
  }

  function moveCursor(x, y) {
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  }

  function showCursorForMove(x, y) {
    stopCursorAnimation();
    cursor.style.display = "block";
    moveCursor(x, y);

    cursorTimer = window.setTimeout(() => {
      cursor.style.display = "none";
      cursorTimer = null;
    }, 900);
  }

  function stopCursorAnimation() {
    cursor.style.display = "none";
    if (cursorTimer) {
      window.clearTimeout(cursorTimer);
      cursorTimer = null;
    }
  }

  function randomDelayMs() {
    return (minDelaySeconds + Math.random() * (maxDelaySeconds - minDelaySeconds)) * 1000;
  }

  function chooseScrollDirection() {
    const currentY = window.scrollY;
    const maxY = Math.max(document.body.scrollHeight - window.innerHeight, 0);

    if (currentY < 100) {
      return 1;
    }

    if (currentY > maxY - 100) {
      return -1;
    }

    return Math.random() > 0.5 ? 1 : -1;
  }

  function runReadingScroll() {
    const steps = 3 + Math.floor(Math.random() * 4);
    let completed = 0;
    const direction = chooseScrollDirection();

    function step() {
      if (completed >= steps) {
        return;
      }

      window.scrollBy({
        top: jitter((120 + Math.random() * 180) * direction),
        behavior: "smooth",
      });

      completed += 1;
      window.setTimeout(step, 500 + Math.random() * 900);
    }

    step();
  }

  function runMouseMove() {
    const point = randomCenterPoint();
    const x = jitter(point.x);
    const y = jitter(point.y);
    showCursorForMove(x, y);

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window,
      })
    );
  }

  function runSafeClick() {
    const point = randomCenterPoint();
    moveCursor(point.x, point.y);

    const element = document.elementFromPoint(point.x, point.y);
    if (!element || isControllerElement(element)) {
      return;
    }

    const interactiveSelector = "a, button, input, textarea, select, label, [role='button'], [role='link']";

    if (element.closest(interactiveSelector) || element.isContentEditable || typeof element.onclick === "function") {
      return;
    }

    for (const eventName of ["mousemove", "mousedown", "mouseup", "click"]) {
      element.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          view: window,
        })
      );
    }
  }

  async function runRefreshAction() {
    setStatus(STATUS.REFRESHING);
    persistSessionSync();
    window.location.reload();
  }

  function isControllerElement(element) {
    return Boolean(element.closest("[data-human-activity-root='true']"));
  }

  function pickAction() {
    const baseWeights = Object.entries(ACTION_WEIGHTS).filter(([actionName]) => enabledActions[actionName]);
    if (baseWeights.length === 0) {
      return "scroll";
    }

    const varianceFactor = actionVariancePercent / 100;
    const adjustedEntries = baseWeights.map(([name, weight]) => {
      const variance = (Math.random() * 2 - 1) * varianceFactor;
      return [name, Math.max(0.01, weight * (1 + variance))];
    });

    const totalWeight = adjustedEntries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = Math.random() * totalWeight;

    for (const [name, weight] of adjustedEntries) {
      if (roll < weight) {
        return name;
      }

      roll -= weight;
    }

    return adjustedEntries[adjustedEntries.length - 1][0];
  }

  function handleMinutesTyping() {
    const digitsOnly = minutesInput.value.replace(/[^\d]/g, "");
    minutesInput.value = digitsOnly;
  }

  async function handleMinutesChange() {
    const requestedMinutes = Number.parseFloat(minutesInput.value);
    const normalizedMinutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : 60;
    minutesInput.value = String(normalizedMinutes);

    if (statusMode !== STATUS.RUNNING && statusMode !== STATUS.PAUSED) {
      sessionTotalMs = normalizedMinutes * 60 * 1000;
    }

    updateUiState();
    await persistSession();
  }

  async function addTime(minutes) {
    const deltaMs = minutes * 60 * 1000;

    if (statusMode === STATUS.RUNNING || statusMode === STATUS.PAUSED) {
      sessionTotalMs += deltaMs;
      minutesInput.value = String(Math.max(Math.round(sessionTotalMs / 60000), 1));
      updateUiState();
      await persistSession();
      return;
    }

    const current = Number.parseInt(minutesInput.value || "0", 10);
    const nextMinutes = Math.max(current + minutes, 1);
    minutesInput.value = String(nextMinutes);
    sessionTotalMs = nextMinutes * 60 * 1000;
    updateUiState();
    await persistSession();
  }

  async function syncDelayRange({ persist = true } = {}) {
    minDelaySeconds = Number.parseInt(minDelaySlider.value, 10);
    maxDelaySeconds = Number.parseInt(maxDelaySlider.value, 10);

    if (minDelaySeconds > maxDelaySeconds) {
      maxDelaySeconds = minDelaySeconds;
      maxDelaySlider.value = String(maxDelaySeconds);
    }

    if (maxDelaySeconds < minDelaySeconds) {
      minDelaySeconds = maxDelaySeconds;
      minDelaySlider.value = String(minDelaySeconds);
    }

    updateUiState();

    if (persist) {
      await persistSession();
    }
  }

  async function handleActionVarianceChange() {
    actionVariancePercent = Number.parseInt(actionVarianceSlider.value, 10);
    actionVarianceValue.textContent = formatPercent(actionVariancePercent);
    await persistSession();
  }

  async function handleActionToggle(actionName) {
    enabledActions[actionName] = Boolean(actionToggleInputs[actionName]?.checked);

    if (!Object.values(enabledActions).some(Boolean)) {
      enabledActions[actionName] = true;
      actionToggleInputs[actionName].checked = true;
      noteText = "At least one action must stay enabled.";
    }

    if (nextActionName !== "-" && !enabledActions[nextActionName]) {
      nextActionName = pickAction();
      nextActionValue.textContent = formatActionName(nextActionName);
    }

    updateUiState();
    await persistSession();
  }

  async function performAction(actionName) {
    if (actionName === "scroll") {
      runReadingScroll();
    } else if (actionName === "move") {
      runMouseMove();
    } else if (actionName === "refresh") {
      actionCount += 1;
      actionsValue.textContent = String(actionCount);
      await persistSession();
      await runRefreshAction();
      return { reloading: true };
    } else {
      runSafeClick();
    }

    actionCount += 1;
    actionsValue.textContent = String(actionCount);
    await persistSession();
    return { reloading: false };
  }

  function scheduleNextAction({ freshCycle = false } = {}) {
    if (statusMode !== STATUS.RUNNING) {
      return;
    }

    if (getRemainingMs() <= 0) {
      void stopSession(STATUS.FINISHED);
      return;
    }

    const delay = freshCycle ? randomDelayMs() : randomDelayMs();
    nextActionAt = Date.now() + delay;
    nextActionName = pickAction();
    nextActionValue.textContent = formatActionName(nextActionName);
    void persistSession();

    if (loopTimer) {
      window.clearTimeout(loopTimer);
    }

    loopTimer = window.setTimeout(async () => {
      if (statusMode !== STATUS.RUNNING) {
        return;
      }

      if (getRemainingMs() <= 0) {
        await stopSession(STATUS.FINISHED);
        return;
      }

      const result = await performAction(nextActionName);
      if (result?.reloading) {
        return;
      }

      scheduleNextAction();
    }, delay);
  }

  function startStatsLoop() {
    stopStatsLoop();
    statsTimer = window.setInterval(updateStats, 250);
  }

  function stopStatsLoop() {
    if (statsTimer) {
      window.clearInterval(statsTimer);
      statsTimer = null;
    }
  }

  function updateStats() {
    const now = Date.now();
    const elapsedMs = getElapsedMs(now);
    const remainingMs = getRemainingMs(now);
    const progress = sessionTotalMs > 0 ? Math.min(100, (elapsedMs / sessionTotalMs) * 100) : 0;

    timeValue.textContent = formatDuration(Math.floor(elapsedMs / 1000));
    countdownValue.textContent =
      statusMode === STATUS.RUNNING || statusMode === STATUS.PAUSED || statusMode === STATUS.FINISHED
        ? formatDuration(Math.ceil(remainingMs / 1000))
        : "-";
    progressBar.style.width = `${progress}%`;

    if (statusMode === STATUS.RUNNING && remainingMs <= 0) {
      void stopSession(STATUS.FINISHED);
    }
  }

  function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
  }

  function formatSeconds(value) {
    return `${value}s`;
  }

  function formatPercent(value) {
    return `${value}%`;
  }

  async function handleStartClick() {
    if (statusMode === STATUS.PAUSED) {
      await resumeSession();
      return;
    }

    if (statusMode === STATUS.RUNNING) {
      return;
    }

    await startSession();
  }

  async function startSession() {
    const requestedMinutes = Number.parseFloat(minutesInput.value);
    const normalizedMinutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0 ? requestedMinutes : 60;

    minutesInput.value = String(normalizedMinutes);
    sessionTotalMs = normalizedMinutes * 60 * 1000;
    accumulatedElapsedMs = 0;
    currentRunStartedAt = Date.now();
    actionCount = 0;
    nextActionAt = 0;
    nextActionName = "-";
    panelOpen = true;

    setStatus(STATUS.RUNNING);
    updateUiState();
    void requestWakeLock();
    startStatsLoop();
    scheduleNextAction({ freshCycle: true });
    await persistSession();
  }

  async function resumeSession() {
    if (statusMode !== STATUS.PAUSED) {
      return;
    }

    currentRunStartedAt = Date.now();
    setStatus(STATUS.RUNNING);
    updateUiState();
    void requestWakeLock();
    startStatsLoop();
    scheduleNextAction({ freshCycle: true });
    await persistSession();
  }

  async function pauseSession() {
    if (statusMode !== STATUS.RUNNING) {
      return;
    }

    accumulatedElapsedMs = getElapsedMs();
    currentRunStartedAt = 0;
    nextActionAt = 0;
    nextActionName = "-";
    setStatus(STATUS.PAUSED);

    if (loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }

    stopStatsLoop();
    stopCursorAnimation();
    await releaseWakeLock();
    updateUiState();
    await persistSession();
  }

  async function stopSession(nextStatus = STATUS.STOPPED) {
    if (statusMode === STATUS.RUNNING) {
      accumulatedElapsedMs = getElapsedMs();
    }

    currentRunStartedAt = 0;
    nextActionAt = 0;
    nextActionName = "-";

    if (nextStatus === STATUS.FINISHED) {
      accumulatedElapsedMs = sessionTotalMs;
    }

    setStatus(nextStatus);

    if (loopTimer) {
      window.clearTimeout(loopTimer);
      loopTimer = null;
    }

    stopStatsLoop();
    stopCursorAnimation();
    await releaseWakeLock();
    updateUiState();
    await persistSession();
  }

  function setStatus(nextStatus, { persist = true } = {}) {
    statusMode = nextStatus;
    statusValue.textContent = nextStatus;
    panel.dataset.status = nextStatus.toLowerCase();

    if (nextStatus === STATUS.RUNNING) {
      noteText = "Running.";
    } else if (nextStatus === STATUS.PAUSED) {
      noteText = "Paused.";
    } else if (nextStatus === STATUS.FINISHED) {
      noteText = "Finished.";
    } else if (nextStatus === STATUS.REFRESHING) {
      noteText = "Refreshing.";
    } else if (nextStatus === STATUS.STOPPED) {
      noteText = "Stopped.";
    } else {
      noteText = "Ready.";
    }

    if (persist) {
      persistSessionSync();
    }
  }

  function updateUiState() {
    statusValue.textContent = statusMode;
    nextActionValue.textContent = formatActionName(nextActionName);
    actionsValue.textContent = String(actionCount);
    minDelayValue.textContent = formatSeconds(minDelaySeconds);
    maxDelayValue.textContent = formatSeconds(maxDelaySeconds);
    actionVarianceValue.textContent = formatPercent(actionVariancePercent);
    syncActionToggles();
    noteValue.textContent = noteText;
    versionValue.textContent = `v${VERSION}`;

    startButton.textContent = statusMode === STATUS.PAUSED ? "▶ Resume" : "▶ Start";
    startButton.disabled = statusMode === STATUS.RUNNING;
    pauseButton.disabled = statusMode !== STATUS.RUNNING;
    stopButton.disabled = [STATUS.IDLE, STATUS.STOPPED, STATUS.FINISHED].includes(statusMode);

    updateStats();
  }

  function syncActionToggles() {
    for (const [actionName, input] of Object.entries(actionToggleInputs)) {
      input.checked = enabledActions[actionName];
      input.title = `${ACTION_LABELS[actionName]} (${formatPercent(Math.round(ACTION_WEIGHTS[actionName] * 100))})`;
    }
  }

  function getElapsedMs(now = Date.now()) {
    return accumulatedElapsedMs + (statusMode === STATUS.RUNNING && currentRunStartedAt ? now - currentRunStartedAt : 0);
  }

  function getRemainingMs(now = Date.now()) {
    return Math.max(0, sessionTotalMs - getElapsedMs(now));
  }

  function applyPanelPosition(position) {
    const left = Number.parseFloat(position?.left);
    const top = Number.parseFloat(position?.top);

    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return;
    }

    panel.style.right = "auto";
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    clampPanelToViewport();
  }

  function clampPanelToViewport() {
    if (panel.style.display === "none") {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const width = rect.width || 354;
    const height = rect.height || 420;
    const maxLeft = Math.max(12, window.innerWidth - width - 12);
    const maxTop = Math.max(12, window.innerHeight - height - 12);
    let left = rect.left;
    let top = rect.top;

    if (!Number.isFinite(left) || rect.right < 12 || rect.left > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 24);
    }

    if (!Number.isFinite(top) || rect.bottom < 12 || rect.top > window.innerHeight - 12) {
      top = 20;
    }

    left = clamp(left, 12, maxLeft);
    top = clamp(top, 12, maxTop);

    panel.style.right = "auto";
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panelPosition = {
      left: panel.style.left,
      top: panel.style.top,
    };
    if (panelCollapsed) {
      panelCollapsedPosition = { ...panelPosition };
    } else {
      panelExpandedPosition = { ...panelPosition };
    }
  }

  function applyLauncherPosition(position) {
    const left = Number.parseFloat(position?.left);
    const top = Number.parseFloat(position?.top);

    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return;
    }

    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    launcher.style.left = `${left}px`;
    launcher.style.top = `${top}px`;
    clampLauncherToViewport();
  }

  function clampLauncherToViewport() {
    const rect = launcher.getBoundingClientRect();
    const width = rect.width || 42;
    const height = rect.height || 42;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    let left = rect.left;
    let top = rect.top;

    if (!Number.isFinite(left) || rect.right < 8 || rect.left > window.innerWidth - 8) {
      left = 16;
    }

    if (!Number.isFinite(top) || rect.bottom < 8 || rect.top > window.innerHeight - 8) {
      top = window.innerHeight - height - 16;
    }

    left = clamp(left, 8, maxLeft);
    top = clamp(top, 8, maxTop);

    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    launcher.style.left = `${Math.round(left)}px`;
    launcher.style.top = `${Math.round(top)}px`;
    launcherPosition = {
      left: launcher.style.left,
      top: launcher.style.top,
    };
  }

  function handleDragStart(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
  }

  function handleLauncherDragStart(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    isLauncherDragging = true;
    launcherDragMoved = false;
    const rect = launcher.getBoundingClientRect();
    launcherDragOffsetX = event.clientX - rect.left;
    launcherDragOffsetY = event.clientY - rect.top;
  }

  function handleDragMove(event) {
    if (isDragging) {
      panel.style.right = "auto";
      panel.style.left = `${event.clientX - dragOffsetX}px`;
      panel.style.top = `${event.clientY - dragOffsetY}px`;
      return;
    }

    if (isLauncherDragging) {
      const left = clamp(
        event.clientX - launcherDragOffsetX,
        8,
        Math.max(8, window.innerWidth - launcher.offsetWidth - 8)
      );
      const top = clamp(
        event.clientY - launcherDragOffsetY,
        8,
        Math.max(8, window.innerHeight - launcher.offsetHeight - 8)
      );

      launcherDragMoved = true;
      launcher.style.right = "auto";
      launcher.style.bottom = "auto";
      launcher.style.left = `${left}px`;
      launcher.style.top = `${top}px`;
    }
  }

  async function handleDragEnd() {
    let changed = false;

    if (isDragging) {
      isDragging = false;
      clampPanelToViewport();
      panelPosition = {
        left: panel.style.left || null,
        top: panel.style.top || null,
      };
      changed = true;
    }

    if (isLauncherDragging) {
      isLauncherDragging = false;
      clampLauncherToViewport();
      changed = true;

      window.setTimeout(() => {
        launcherDragMoved = false;
      }, 0);
    }

    if (changed) {
      await persistSession();
    }
  }

  async function handleVisibilityChange() {
    if (document.visibilityState === "visible" && statusMode === STATUS.RUNNING && !wakeLock) {
      await requestWakeLock();
    }
  }

  function handlePageUnload() {
    persistSessionSync();
  }

  function handleLauncherClick() {
    if (launcherDragMoved) {
      return;
    }

    void showPanel();
  }

  function focusPanel() {
    panel.style.display = "";
    panelOpen = true;
    clampPanelToViewport();
    panel.classList.add("hae-focus");

    if (focusPulseTimer) {
      window.clearTimeout(focusPulseTimer);
    }

    focusPulseTimer = window.setTimeout(() => {
      panel.classList.remove("hae-focus");
      focusPulseTimer = null;
    }, 1200);
  }

  async function showPanel() {
    panelOpen = true;
    panel.style.display = "";
    setPanelCollapsed(false, { persist: false });
    clampPanelToViewport();
    focusPanel();
    await persistSession();
  }

  async function hidePanel() {
    panelOpen = false;
    panelCollapsed = false;
    panelExpandedPosition = null;
    panelCollapsedPosition = null;
    panel.classList.remove("hae-collapsed");
    if (panelBody) {
      panelBody.hidden = false;
    }
    panel.style.display = "none";
    await persistSession();
  }

  async function togglePanelCollapse() {
    await setPanelCollapsed(!panelCollapsed);
  }

  async function setPanelCollapsed(nextCollapsed, { persist = true } = {}) {
    panelCollapsed = Boolean(nextCollapsed);
    panel.classList.toggle("hae-collapsed", panelCollapsed);

    if (panelBody) {
      panelBody.hidden = panelCollapsed;
    }

    if (panelCollapsed) {
      if (panelCollapsedPosition) {
        applyPanelPosition(panelCollapsedPosition);
      } else {
        panel.style.right = "16px";
        panel.style.left = "auto";
        clampPanelToViewport();
      }
    } else if (panelExpandedPosition) {
      applyPanelPosition(panelExpandedPosition);
    } else {
      clampPanelToViewport();
    }

    if (persist) {
      await persistSession();
    }
  }

  async function destroy() {
    panelOpen = false;
    await stopSession(STATUS.IDLE);
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    dragbar.removeEventListener("mousedown", handleDragStart);
    launcher.removeEventListener("click", handleLauncherClick);
    launcher.removeEventListener("mousedown", handleLauncherDragStart);
    await clearSavedSession();
    root.remove();
    delete window.__humanActivityUserscript;
  }

  function formatActionName(actionName) {
    if (actionName === "-") {
      return actionName;
    }

    return ACTION_LABELS[actionName]?.toLowerCase() ?? actionName;
  }
})();
