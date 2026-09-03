// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../build/playwright-injected.d.ts" />

import type { Page } from "@playwright/test";
import { InjectedScript } from "virtual:ayme-playwright-injected";

export type CaptureAriaSnapshotResult = {
  distilledText: string;
  fullText: string;
  refsByElement: Map<Element, string>;
};

// ── ARIA capture ────────────────────────────────────────────────────

const injectedScripts = new WeakMap<Window, InjectedScript>();

export function ariaSnapshot(root: Element) {
  return injectedScriptFor(root).ariaSnapshot(root, { mode: "ai" });
}

export function captureAriaSnapshot(root: Element): CaptureAriaSnapshotResult {
  return injectedScriptFor(root).captureAriaSnapshot(root);
}

function injectedScriptFor(root: Element) {
  const browserWindow = root.ownerDocument.defaultView;
  if (!browserWindow)
    throw new Error("Cannot capture ARIA state without a browser Window.");

  let injectedScript = injectedScripts.get(browserWindow);
  if (!injectedScript) {
    injectedScript = new InjectedScript(browserWindow, {
      browserName: "chromium",
      customEngines: [],
      frameSeq: 0,
      isUnderTest: false,
      isUtilityWorld: false,
      sdkLanguage: "javascript",
      shouldPrependErrorPrefix: false,
      stableRafCount: 0,
      testIdAttributeName: "data-testid",
    });
    injectedScripts.set(browserWindow, injectedScript);
  }
  return injectedScript;
}

// ── Page factory ────────────────────────────────────────────────────

export type TraceEntry = {
  operation: "click" | "fill" | "waitFor";
  locator: string;
  state?: "visible" | "hidden";
  value?: string;
};

export type BrowserInteractionPacing = {
  beforeActionMs?: number;
  clickCue?: boolean;
  typingIntervalMs?: number;
};

type CreatePageOptions = {
  browserWindow?: Window;
  onTrace?: (entry: TraceEntry) => void;
  pacing?: BrowserInteractionPacing;
};

export function createPage(options: CreatePageOptions = {}): Page {
  return PageImpl.fromWindow(
    options.browserWindow ?? window,
    options.onTrace,
    options.pacing
  ) as unknown as Page;
}

// ── Runtime implementation ──────────────────────────────────────────

class LocatorImpl {
  constructor(
    private readonly ownerPage: PageImpl,
    private readonly resolver: () => Element[],
    private readonly label: string,
    private readonly onTrace?: (entry: TraceEntry) => void
  ) {}

  page() {
    return this.ownerPage;
  }

  getByRole(role: string, options: { name?: string } = {}) {
    return new LocatorImpl(
      this.ownerPage,
      () => findByRole(this.resolveElements(), role, options),
      `${this.label}.getByRole(${JSON.stringify(role)}, ${JSON.stringify(options)})`,
      this.onTrace
    );
  }

  locator(selector: string) {
    return new LocatorImpl(
      this.ownerPage,
      () =>
        this.resolveElements().flatMap((root) =>
          Array.from(root.querySelectorAll(selector))
        ),
      `${this.label}.locator(${JSON.stringify(selector)})`,
      this.onTrace
    );
  }

  filter(options: {
    hasText?: string | RegExp;
    hasNotText?: string | RegExp;
    has?: LocatorImpl;
    hasNot?: LocatorImpl;
  }) {
    return new LocatorImpl(
      this.ownerPage,
      () =>
        this.resolveElements().filter((element) => {
          if (
            options.hasText !== undefined &&
            !matchesText(element, options.hasText)
          )
            return false;
          if (
            options.hasNotText !== undefined &&
            matchesText(element, options.hasNotText)
          )
            return false;
          if (
            options.has !== undefined &&
            !options.has
              .resolveElements()
              .some((candidate) => element.contains(candidate))
          ) {
            return false;
          }
          if (
            options.hasNot !== undefined &&
            options.hasNot
              .resolveElements()
              .some((candidate) => element.contains(candidate))
          ) {
            return false;
          }
          return true;
        }),
      `${this.label}.filter(...)`,
      this.onTrace
    );
  }

  nth(index: number) {
    return new LocatorImpl(
      this.ownerPage,
      () => {
        const elements = this.resolveElements();
        const element = elements[index];
        return element ? [element] : [];
      },
      `${this.label}.nth(${index})`,
      this.onTrace
    );
  }

  async all() {
    return this.resolveElements().map(
      (element, index) =>
        new LocatorImpl(
          this.ownerPage,
          () => (element.isConnected ? [element] : []),
          `${this.label}.all()[${index}]`,
          this.onTrace
        )
    );
  }

  async count() {
    return this.resolveElements().length;
  }

  async fill(value: string) {
    this.record({ operation: "fill", locator: this.label, value });
    await this.ownerPage.waitBeforeAction();
    const element = this.requireSingleElement();
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.focus();
      await this.fillInputElement(element, value);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.focus();
      await this.fillContentEditableElement(element, value);
      return;
    }
    throw new Error(
      `fill() is only supported for input, textarea, or contenteditable elements (${this.label})`
    );
  }

  async click() {
    this.record({ operation: "click", locator: this.label });
    await this.ownerPage.waitBeforeClick(this.requireSingleElement());
    const element = this.requireSingleElement();
    if (element instanceof HTMLElement) {
      element.click();
      return;
    }
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  }

  async press(key: string) {
    await this.ownerPage.waitBeforeAction();
    const element = this.requireSingleElement();
    dispatchKeyboardEvent(element, "keydown", key);
    dispatchKeyboardEvent(element, "keypress", key);
    dispatchKeyboardEvent(element, "keyup", key);

    if (key === "Enter" && element instanceof HTMLInputElement)
      element.form?.requestSubmit();
  }

  async waitFor(options: { state: "visible" | "hidden"; timeout?: number }) {
    const timeout = options.timeout ?? 1_000;
    this.record({
      operation: "waitFor",
      locator: this.label,
      state: options.state,
    });

    if (this.isInState(options.state)) return;

    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + timeout;
      let timeoutHandle: number | undefined;
      const observer = new MutationObserver(() => check());

      const finish = (error?: Error) => {
        observer.disconnect();
        if (timeoutHandle !== undefined)
          this.ownerPage.window.clearTimeout(timeoutHandle);
        if (error) reject(error);
        else resolve();
      };

      const check = () => {
        if (this.isInState(options.state)) {
          finish();
          return;
        }
        if (Date.now() >= deadline) {
          finish(
            new Error(
              `Timed out waiting for ${this.label} to become ${options.state}.`
            )
          );
          return;
        }
        timeoutHandle = this.ownerPage.window.setTimeout(check, 10);
      };

      observer.observe(this.ownerPage.document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      timeoutHandle = this.ownerPage.window.setTimeout(check, 0);
    });
  }

  resolveElements() {
    return this.resolver().filter(isElement);
  }

  private isInState(state: "visible" | "hidden") {
    const elements = this.resolveElements();
    return state === "visible"
      ? elements.some(isVisible)
      : elements.every((element) => !isVisible(element));
  }

  private requireSingleElement() {
    const elements = this.resolveElements();
    const first = elements[0];
    if (!first) throw new Error(`No elements found for locator ${this.label}`);
    if (elements.length > 1)
      throw new Error(
        `Expected one element for locator ${this.label}, found ${elements.length}`
      );
    return first;
  }

  private record(entry: TraceEntry) {
    this.onTrace?.(entry);
  }

  private async fillInputElement(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ) {
    if (!this.ownerPage.shouldTypeCharacterByCharacter()) {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of value) {
      element.value += character;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.ownerPage.waitBetweenTypedCharacters();
    }
  }

  private async fillContentEditableElement(
    element: HTMLElement,
    value: string
  ) {
    if (!this.ownerPage.shouldTypeCharacterByCharacter()) {
      element.textContent = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    element.textContent = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    for (const character of value) {
      element.textContent += character;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await this.ownerPage.waitBetweenTypedCharacters();
    }
  }
}

class PageImpl {
  readonly document: Document;
  readonly window: Window;

  constructor(
    browserWindow: Window,
    private readonly onTrace?: (entry: TraceEntry) => void,
    private readonly pacing: BrowserInteractionPacing = {}
  ) {
    this.window = browserWindow;
    this.document = browserWindow.document;
  }

  static fromWindow(
    browserWindow: Window = window,
    onTrace?: (entry: TraceEntry) => void,
    pacing?: BrowserInteractionPacing
  ) {
    return new PageImpl(browserWindow, onTrace, pacing);
  }

  async waitBeforeAction() {
    await this.wait(this.pacing.beforeActionMs);
  }

  async waitBeforeClick(element: Element) {
    const duration = this.pacing.beforeActionMs ?? 0;
    const cueDuration = this.pacing.clickCue ? Math.min(duration, 160) : 0;

    await this.wait(duration - cueDuration);
    if (!cueDuration) return;

    const cue = this.createClickCue(element, cueDuration);
    try {
      await this.wait(cueDuration);
    } finally {
      cue?.remove();
    }
  }

  shouldTypeCharacterByCharacter() {
    return (this.pacing.typingIntervalMs ?? 0) > 0;
  }

  async waitBetweenTypedCharacters() {
    await this.wait(this.pacing.typingIntervalMs);
  }

  getByRole(role: string, options: { name?: string } = {}) {
    return new LocatorImpl(
      this,
      () => findByRole([this.document.documentElement], role, options),
      `page.getByRole(${JSON.stringify(role)}, ${JSON.stringify(options)})`,
      this.onTrace
    );
  }

  locator(selector: string) {
    return new LocatorImpl(
      this,
      () => Array.from(this.document.querySelectorAll(selector)),
      `page.locator(${JSON.stringify(selector)})`,
      this.onTrace
    );
  }

  private async wait(durationMs: number | undefined) {
    if (!durationMs || durationMs <= 0) return;
    await new Promise<void>((resolve) =>
      this.window.setTimeout(resolve, durationMs)
    );
  }

  private createClickCue(element: Element, duration: number) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return undefined;

    const cue = this.document.createElement("div");
    cue.setAttribute("aria-hidden", "true");
    cue.style.background = "rgb(77 126 219 / 18%)";
    cue.style.border = "2px solid rgb(77 126 219 / 80%)";
    cue.style.borderRadius = "999px";
    cue.style.height = "2rem";
    cue.style.left = `${bounds.left + bounds.width / 2}px`;
    cue.style.pointerEvents = "none";
    cue.style.position = "fixed";
    cue.style.top = `${bounds.top + bounds.height / 2}px`;
    cue.style.transform = "translate(-50%, -50%)";
    cue.style.width = "2rem";
    cue.style.zIndex = "2147483647";
    this.document.body.append(cue);

    const reducedMotion = this.window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    cue.animate(
      reducedMotion
        ? [{ opacity: 0.9 }, { opacity: 0 }]
        : [
            { opacity: 0.9, transform: "translate(-50%, -50%) scale(0.95)" },
            { opacity: 0, transform: "translate(-50%, -50%) scale(1.35)" },
          ],
      {
        duration,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        fill: "forwards",
      }
    );
    return cue;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function findByRole(
  roots: readonly Element[],
  role: string,
  options: { name?: string }
) {
  const candidates = roots.flatMap((root) => [
    root,
    ...Array.from(root.querySelectorAll("*")),
  ]);
  return candidates.filter((element) => {
    if (roleFor(element) !== role) return false;
    return (
      options.name === undefined ||
      accessibleName(element) === normalizeText(options.name)
    );
  });
}

function roleFor(element: Element): string | undefined {
  const explicitRole = element.getAttribute("role")?.trim().split(/\s+/, 1)[0];
  if (explicitRole) return explicitRole;

  const tagName = element.tagName.toLowerCase();
  if (tagName === "button") return "button";
  if (tagName === "textarea") return "textbox";
  if (/^h[1-6]$/.test(tagName)) return "heading";
  if (tagName === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (["button", "image", "reset", "submit"].includes(type)) return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "search") return "searchbox";
    if (!["hidden", "file", "range", "color"].includes(type)) return "textbox";
  }
  if (element.getAttribute("contenteditable") === "true") return "textbox";
  return undefined;
}

function accessibleName(element: Element) {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return normalizeText(ariaLabel);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (normalizeText(text)) return normalizeText(text);
  }

  const associatedLabel = labelFor(element);
  if (associatedLabel) return normalizeText(associatedLabel.textContent ?? "");

  return normalizeText(element.textContent ?? "");
}

function labelFor(element: Element) {
  const wrappingLabel = element.closest("label");
  if (wrappingLabel) return wrappingLabel;
  if (!element.id) return undefined;
  return Array.from(element.ownerDocument.querySelectorAll("label")).find(
    (label) => label.htmlFor === element.id
  );
}

function isVisible(element: Element) {
  if (!element.isConnected || element.getAttribute("aria-hidden") === "true")
    return false;
  if (element instanceof HTMLElement && element.hidden) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  return true;
}

function matchesText(element: Element, pattern: string | RegExp) {
  const text = element.textContent ?? "";
  return typeof pattern === "string"
    ? text.includes(pattern)
    : pattern.test(text);
}

function dispatchKeyboardEvent(
  target: Element,
  type: "keydown" | "keypress" | "keyup",
  key: string
) {
  target.dispatchEvent(
    new KeyboardEvent(type, { key, bubbles: true, cancelable: true })
  );
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isElement(value: unknown): value is Element {
  return value instanceof Element;
}
