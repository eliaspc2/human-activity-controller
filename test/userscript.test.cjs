const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowser, runUserscript, event } = require("./browser-harness.cjs");

const ids = {
  root: "human-activity-userscript-root",
  panel: "human-activity-userscript-panel",
  launcher: "human-activity-userscript-launcher",
  style: "human-activity-userscript-style",
};

test("starts hidden behind the HA launcher even when persisted state says open", async () => {
  const browser = await runUserscript(createBrowser({ storedSession: { panelOpen: true } }));
  assert.equal(browser.document.getElementById(ids.panel).style.display, "none");
  assert.equal(browser.document.getElementById(ids.launcher).textContent, "HA");
});

test("normalizes persisted weights and reset restores the standard mix", async () => {
  const browser = await runUserscript(createBrowser({ storedSession: {
    actionWeights: { scroll: 122.6, move: "24.4", click: -3, refresh: "invalid" },
  } }));
  const input = (name) => browser.document.getElementById(`hae-action-${name}-weight`);
  assert.deepEqual(Object.fromEntries(["scroll", "move", "click", "refresh"].map((name) => [name, input(name).value])), {
    scroll: "100", move: "24", click: "0", refresh: "5",
  });

  input("scroll").value = "10";
  input("scroll").dispatchEvent(event("change"));
  await Promise.resolve();
  browser.document.getElementById("hae-reset-weights").dispatchEvent(event("click"));
  await Promise.resolve();
  assert.deepEqual(Object.fromEntries(["scroll", "move", "click", "refresh"].map((name) => [name, input(name).value])), {
    scroll: "55", move: "25", click: "15", refresh: "5",
  });
});

test("ignores malformed stored state and still mounts a usable controller", async () => {
  const browser = await runUserscript(createBrowser({ storedRaw: "{not valid json" }));
  assert.equal(browser.document.getElementById(ids.panel).style.display, "none");
  assert.equal(browser.document.getElementById("hae-status").textContent, "IDLE");
  assert.equal(browser.document.getElementById("hae-action-scroll-weight").value, "55");
});

test("sanitizes structurally corrupt saved fields before exposing the controls", async () => {
  const browser = await runUserscript(createBrowser({ storedSession: {
    statusMode: "UNKNOWN", sessionTotalMs: -1, accumulatedElapsedMs: "Infinity", currentRunStartedAt: -10,
    actionCount: -4, nextActionAt: "not-a-time", nextActionName: "unknown-action",
    minDelaySeconds: "Infinity", maxDelaySeconds: -20, actionVariancePercent: 101,
    actionWeights: [], enabledActions: { scroll: false, move: false, click: false, refresh: false },
    minutesValue: -2, panelPosition: "not-a-position", launcherPosition: ["not-a-position"],
  } }));
  assert.equal(browser.document.getElementById("hae-status").textContent, "IDLE");
  assert.equal(browser.document.getElementById("hae-minutes").value, "60");
  assert.equal(browser.document.getElementById("hae-min-delay").value, "5");
  assert.equal(browser.document.getElementById("hae-action-scroll").checked, true);
  assert.equal(browser.document.getElementById("hae-action-scroll-weight").value, "55");
});

test("a running session expires while its panel remains hidden", async () => {
  const browser = await runUserscript(createBrowser());
  browser.document.getElementById("hae-minutes").value = "1";
  browser.document.getElementById("hae-min-delay").value = "60";
  browser.document.getElementById("hae-max-delay").value = "60";
  browser.document.getElementById("hae-min-delay").dispatchEvent(event("input"));
  browser.document.getElementById("hae-start").dispatchEvent(event("click"));
  await Promise.resolve();
  assert.equal(browser.document.getElementById(ids.panel).style.display, "none");
  await browser.timers.advance(60000);
  browser.document.getElementById(ids.launcher).dispatchEvent(event("click"));
  await Promise.resolve();
  assert.equal(browser.document.getElementById("hae-status").textContent, "FINISHED");
});

test("releases a wake lock that resolves after pause", async () => {
  let resolveRequest;
  let released = 0;
  const sentinel = { addEventListener() {}, async release() { released += 1; } };
  const browser = await runUserscript(createBrowser({ navigator: { wakeLock: {
    request: () => new Promise((resolve) => { resolveRequest = resolve; }),
  } } }));
  browser.document.getElementById("hae-start").dispatchEvent(event("click"));
  await Promise.resolve();
  browser.document.getElementById("hae-pause").dispatchEvent(event("click"));
  await Promise.resolve();
  resolveRequest(sentinel);
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
  assert.equal(released, 1);
});

async function startScrollOnly(browser) {
  for (const name of ["move", "click", "refresh"]) {
    const toggle = browser.document.getElementById(`hae-action-${name}`);
    toggle.checked = false;
    toggle.dispatchEvent(event("change"));
    await Promise.resolve();
  }
  browser.document.getElementById("hae-min-delay").value = "1";
  browser.document.getElementById("hae-max-delay").value = "1";
  browser.document.getElementById("hae-min-delay").dispatchEvent(event("input"));
  browser.document.getElementById("hae-start").dispatchEvent(event("click"));
  await Promise.resolve();
  await browser.timers.advance(1000);
}

for (const action of ["pause", "stop"]) {
  test(`${action} cancels every pending reading-scroll step`, async () => {
    const browser = await runUserscript(createBrowser());
    await startScrollOnly(browser);
    assert.equal(browser.window.scrollCalls.length, 1, "the first scroll occurs before cancellation");
    browser.document.getElementById(`hae-${action}`).dispatchEvent(event("click"));
    await Promise.resolve();
    await browser.timers.advance(10000);
    assert.equal(browser.window.scrollCalls.length, 1);
  });
}

test("duplicate injection focuses the existing controller and destroy removes injected UI", async () => {
  const browser = createBrowser();
  await runUserscript(browser);
  const firstApi = browser.window.__humanActivityUserscript;
  await runUserscript(browser);
  assert.equal(browser.document.querySelectorAll(`#${ids.root}`).length, 1);
  assert.equal(browser.document.querySelectorAll(`#${ids.style}`).length, 1);
  assert.equal(browser.window.__humanActivityUserscript, firstApi);
  assert.equal(browser.document.getElementById(ids.panel).style.display, "");

  await firstApi.destroy();
  assert.equal(browser.document.getElementById(ids.root), null);
  assert.equal(browser.document.getElementById(ids.style), null);
  assert.equal(browser.window.__humanActivityUserscript, undefined);
});
