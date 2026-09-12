import type { Locator, Page } from "@playwright/test";
import { isPlaywrightLiteLocator } from "@ayme-dev/playwright-lite/internal";

export type TraceEntry = {
  operation:
    "click" | "fill" | "press" | "pressSequentially" | "waitFor" | "expect";
  locator: string;
  value?: string;
  state?: string;
};

type DemoFeedbackOptions = {
  beforeActionMs?: number;
  clickCue?: boolean;
  onTrace: (entry: TraceEntry) => void;
};

// Private demo decoration. The underlying Page and its locator brands stay intact.
export function withDemoFeedback(
  page: Page,
  options: DemoFeedbackOptions
): Page {
  const wrappers = new WeakMap<object, object>();

  function wrapResult(result: unknown): unknown {
    if (result === page) return wrap(page);
    if (isPlaywrightLiteLocator(result)) return wrap(result as Locator);
    if (Array.isArray(result)) return result.map(wrapResult);
    if (result instanceof Promise) return result.then(wrapResult);
    return result;
  }

  function wrap<T extends Page | Locator>(target: T): T {
    const existing = wrappers.get(target);
    if (existing) return existing as T;

    const proxy = new Proxy(target, {
      get(target, property) {
        const member: unknown = Reflect.get(target, property, target);
        if (typeof member !== "function") return member;

        return (...args: unknown[]) => {
          const operation = traceOperation(property);
          if (!isPlaywrightLiteLocator(target) || !operation)
            return wrapResult(member.apply(target, args));

          const locator = target as Locator;
          options.onTrace({
            operation,
            locator: locator.toString(),
            ...(typeof args[0] === "string" && operation !== "expect"
              ? { value: args[0] }
              : {}),
            ...(operation === "waitFor"
              ? {
                  state:
                    (args[0] as { state?: string } | undefined)?.state ??
                    "visible",
                }
              : {}),
          });

          return (async () => {
            // Demo waits are outside the delegated Playwright action's timeout.
            if (operation !== "waitFor" && operation !== "expect") {
              if (options.beforeActionMs)
                await new Promise((resolve) =>
                  setTimeout(resolve, options.beforeActionMs)
                );
              if (operation === "click" && options.clickCue)
                await showClickCue(locator);
            }
            return wrapResult(member.apply(target, args));
          })();
        };
      },
    });
    wrappers.set(target, proxy);
    return proxy;
  }

  return wrap(page);
}

// ponytail: only instrument locator operations used by the demo; extend as needed.
function traceOperation(
  property: string | symbol
): TraceEntry["operation"] | undefined {
  switch (property) {
    case "click":
    case "fill":
    case "press":
    case "pressSequentially":
    case "waitFor":
      return property;
    case "_expect":
      return "expect";
  }
}

async function showClickCue(locator: Locator) {
  // Advisory cue: click() performs its own fresh resolution and actionability checks.
  await locator.evaluate(async (element) => {
    const document = element.ownerDocument;
    const window = document.defaultView;
    const bounds = element.getBoundingClientRect();
    if (!window || !bounds.width || !bounds.height) return;

    const cue = document.createElement("div");
    cue.dataset.demoClickCue = "";
    cue.setAttribute("aria-hidden", "true");
    Object.assign(cue.style, {
      background: "rgb(77 126 219 / 18%)",
      border: "2px solid rgb(77 126 219 / 80%)",
      borderRadius: "999px",
      height: "2rem",
      left: `${bounds.left + bounds.width / 2}px`,
      pointerEvents: "none",
      position: "fixed",
      top: `${bounds.top + bounds.height / 2}px`,
      transform: "translate(-50%, -50%)",
      width: "2rem",
      zIndex: "2147483647",
    });
    document.body.append(cue);
    try {
      const reducedMotion = window.matchMedia(
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
          duration: 160,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
          fill: "forwards",
        }
      );
      await new Promise((resolve) => window.setTimeout(resolve, 160));
    } finally {
      cue.remove();
    }
  });
}
