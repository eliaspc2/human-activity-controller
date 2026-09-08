const fs = require("node:fs");
const vm = require("node:vm");

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }
  dispatchEvent(event) {
    event.target ||= this;
    for (const listener of [...(this.listeners.get(event.type) || [])]) listener.call(this, event);
    return true;
  }
}

class ClassList {
  constructor(element) { this.element = element; this.items = new Set(); }
  add(...names) { names.forEach((name) => this.items.add(name)); }
  remove(...names) { names.forEach((name) => this.items.delete(name)); }
  toggle(name, force) {
    const next = force === undefined ? !this.items.has(name) : Boolean(force);
    if (next) this.add(name); else this.remove(name);
    return next;
  }
  contains(name) { return this.items.has(name); }
  toString() { return [...this.items].join(" "); }
}

class Element extends EventTarget {
  constructor(tagName, document) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.classList = new ClassList(this);
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.scrollHeight = 4000;
  }
  get id() { return this._id || ""; }
  set id(value) { this._id = String(value); }
  get className() { return this.classList.toString(); }
  set className(value) { this.classList.items = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._textContent || ""; }
  set textContent(value) { this._textContent = String(value); }
  get lastChild() { return this.children.at(-1) || null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((item) => item !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") this.id = value;
    if (name === "class") this.className = value;
    if (name === "value") this.value = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) { return findAll(this, selector)[0] || null; }
  querySelectorAll(selector) { return findAll(this, selector); }
  closest(selector) {
    for (let current = this; current; current = current.parentNode) if (matches(current, selector)) return current;
    return null;
  }
  getBoundingClientRect() { return { left: 16, top: 16, right: 370, bottom: 450, width: 354, height: 434 }; }
}

function matches(element, selector) {
  if (selector.startsWith("#")) return element.id === selector.slice(1);
  if (selector.startsWith(".")) return element.classList.contains(selector.slice(1));
  if (selector.startsWith("[data-human-activity-root")) return element.dataset.humanActivityRoot === "true";
  return element.tagName.toLowerCase() === selector.toLowerCase();
}
function findAll(root, selector) {
  if (selector.includes(",") || selector.includes("[type=") || selector.includes("[src")) return [];
  const result = [];
  const visit = (element) => {
    for (const child of element.children) {
      if (matches(child, selector)) result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

class Document extends EventTarget {
  constructor() {
    super();
    this.documentElement = new Element("html", this);
    this.body = new Element("body", this);
    this.documentElement.appendChild(this.body);
    this.contentType = "text/html";
    this.visibilityState = "visible";
  }
  createElement(tagName) { return new Element(tagName, this); }
  getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  elementFromPoint() { return this.body; }
}

class Timers {
  constructor() { this.now = 1000; this.nextId = 1; this.tasks = new Map(); }
  set(callback, delay, interval = false) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, at: this.now + Number(delay || 0), delay: Number(delay || 0), interval });
    return id;
  }
  clear(id) { this.tasks.delete(id); }
  async advance(milliseconds) {
    const end = this.now + milliseconds;
    while (true) {
      const due = [...this.tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, task] = due;
      this.now = task.at;
      if (task.interval) task.at += task.delay; else this.tasks.delete(id);
      await task.callback();
      await Promise.resolve();
    }
    this.now = end;
  }
}

class Storage {
  constructor(initial) { this.values = new Map(Object.entries(initial || {})); }
  getItem(key) { return this.values.get(key) ?? this.values.get("__session__") ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); this.values.delete("__session__"); }
}

class MouseEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }

function createBrowser({ storedSession, storedRaw, random = () => 0.25, navigator = {} } = {}) {
  const document = new Document();
  const timers = new Timers();
  const storage = new Storage(storedRaw === undefined ? { __session__: JSON.stringify(storedSession) } : { __session__: storedRaw });
  const window = new EventTarget();
  Object.assign(window, {
    document, localStorage: storage, innerWidth: 1280, innerHeight: 800, scrollY: 0, name: "",
    location: { href: "https://ava.tecnisign.pt/course", reload() { window.reloads += 1; } }, reloads: 0,
    scrollCalls: [], scrollBy(value) { window.scrollCalls.push(value); },
    setTimeout: (callback, delay) => timers.set(callback, delay), clearTimeout: (id) => timers.clear(id),
    setInterval: (callback, delay) => timers.set(callback, delay, true), clearInterval: (id) => timers.clear(id),
  });
  window.top = window;
  const context = { window, document, localStorage: storage, location: window.location, navigator, MouseEvent,
    Date: { now: () => timers.now }, Math: Object.assign(Object.create(Math), { random }), console, Promise, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout };
  context.globalThis = context;
  return { context: vm.createContext(context), document, window, timers, storage };
}

async function runUserscript(browser) {
  const source = fs.readFileSync(require("node:path").join(__dirname, "..", "human-activity-controller.user.js"), "utf8");
  new vm.Script(source, { filename: "human-activity-controller.user.js" }).runInContext(browser.context);
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  return browser;
}

function event(type) { return { type }; }

module.exports = { createBrowser, runUserscript, event };
