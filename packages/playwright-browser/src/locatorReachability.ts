import { injectedScriptFor } from "./injected";
import { resolveLocatorElements } from "./locator";

type Rect = { left: number; right: number; top: number; bottom: number };
type Scroll = { element: Element; x: number; y: number };

/**
 * Observe a single root in the current layout without scrolling or input.
 * Scroll reachability describes existing layout, not content a scroll handler
 * might create. It is deliberately separate from click actionability.
 */
export async function probeLocatorReachability(
  locator: unknown
): Promise<boolean> {
  const elements = resolveLocatorElements(locator);
  const element = elements.length === 1 ? elements[0] : undefined;
  if (!element?.isConnected) return false;
  if (!injectedScriptFor(element).elementState(element, "visible").matches)
    return false;

  const document = element.ownerDocument;
  const view = document.defaultView;
  if (!view) return false;
  for (let node: Element | null = element; node; node = parentElement(node))
    if (node.hasAttribute("inert")) return false;
  const modal = [...document.querySelectorAll(":modal")].at(-1);
  if (modal && !contains(modal, element) && !contains(element, modal))
    return false;

  const { ancestors, fixedToViewport } = layoutAncestors(element);
  const htmlStyle = view.getComputedStyle(document.documentElement);
  const bodyStyle = document.body && view.getComputedStyle(document.body);
  const viewport: Rect = {
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth,
    bottom: document.documentElement.clientHeight,
  };

  for (const bounds of element.getClientRects()) {
    let rect: Rect | undefined = {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
    };
    const scrolls: Scroll[] = [];
    for (const ancestor of ancestors) {
      if (ancestor === document.documentElement) break;
      // Body overflow propagates to the viewport when the root has visible overflow.
      if (
        ancestor === document.body &&
        htmlStyle.overflowX === "visible" &&
        htmlStyle.overflowY === "visible"
      )
        continue;
      const style = view.getComputedStyle(ancestor);
      const box = ancestor.getBoundingClientRect();
      const width = (ancestor as HTMLElement).offsetWidth || box.width;
      const height = (ancestor as HTMLElement).offsetHeight || box.height;
      const scaleX = width ? box.width / width : 1;
      const scaleY = height ? box.height / height : 1;
      const port = {
        left: box.left + ancestor.clientLeft * scaleX,
        top: box.top + ancestor.clientTop * scaleY,
        right: box.left + (ancestor.clientLeft + ancestor.clientWidth) * scaleX,
        bottom: box.top + (ancestor.clientTop + ancestor.clientHeight) * scaleY,
      };
      const scroll = projectIntoPort(
        rect,
        port,
        ancestor,
        style.overflowX,
        style.overflowY,
        scaleX,
        scaleY
      );
      scrolls.push(scroll);
      rect = clip(
        rect,
        port,
        style.overflowX !== "visible",
        style.overflowY !== "visible"
      );
      if (!rect) break;
    }
    if (!rect) continue;

    const scroller = document.scrollingElement;
    if (scroller && !fixedToViewport) {
      const overflowX =
        htmlStyle.overflowX === "visible"
          ? (bodyStyle?.overflowX ?? "visible")
          : htmlStyle.overflowX;
      const overflowY =
        htmlStyle.overflowY === "visible"
          ? (bodyStyle?.overflowY ?? "visible")
          : htmlStyle.overflowY;
      scrolls.push(
        projectIntoPort(
          rect,
          viewport,
          scroller,
          overflowX === "visible" ? "auto" : overflowX,
          overflowY === "visible" ? "auto" : overflowY,
          1,
          1
        )
      );
    }
    rect = clip(rect, viewport, true, true);
    if (rect && hasUnobstructedPoint(element, rect, scrolls)) return true;
  }
  return false;
}

function parentElement(element: Element): Element | null {
  return (
    element.assignedSlot ??
    element.parentElement ??
    (element.getRootNode() as ShadowRoot).host ??
    null
  );
}

function contains(ancestor: Element, element: Element): boolean {
  for (let node: Element | null = element; node; node = parentElement(node))
    if (node === ancestor) return true;
  return false;
}

function establishesContainingBlock(style: CSSStyleDeclaration): boolean {
  return (
    style.transform !== "none" ||
    style.perspective !== "none" ||
    style.filter !== "none" ||
    /layout|paint|strict|content/.test(style.contain) ||
    /transform|perspective|filter/.test(style.willChange)
  );
}

function layoutAncestors(element: Element) {
  const view = element.ownerDocument.defaultView!;
  const ancestors: Element[] = [];
  let current = element;
  while (true) {
    const position = view.getComputedStyle(current).position;
    let parent = parentElement(current);
    if (position === "fixed" || position === "absolute") {
      while (parent && parent !== element.ownerDocument.documentElement) {
        const style = view.getComputedStyle(parent);
        if (
          establishesContainingBlock(style) ||
          (position === "absolute" && style.position !== "static")
        )
          break;
        parent = parentElement(parent);
      }
      if (
        position === "fixed" &&
        (!parent || !establishesContainingBlock(view.getComputedStyle(parent)))
      )
        return { ancestors, fixedToViewport: true };
    }
    if (!parent) return { ancestors, fixedToViewport: false };
    ancestors.push(parent);
    current = parent;
  }
}

function projectIntoPort(
  rect: Rect,
  port: Rect,
  element: Element,
  overflowX: string,
  overflowY: string,
  scaleX: number,
  scaleY: number
): Scroll {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  const reverseX =
    style.direction === "rtl" || style.writingMode === "vertical-rl";
  const x = scrollDelta(
    rect.left,
    rect.right,
    port.left,
    port.right,
    element.scrollLeft,
    Math.max(0, element.scrollWidth - element.clientWidth),
    /^(auto|scroll|overlay)$/.test(overflowX),
    scaleX,
    reverseX
  );
  const y = scrollDelta(
    rect.top,
    rect.bottom,
    port.top,
    port.bottom,
    element.scrollTop,
    Math.max(0, element.scrollHeight - element.clientHeight),
    /^(auto|scroll|overlay)$/.test(overflowY),
    scaleY,
    false
  );
  rect.left += x;
  rect.right += x;
  rect.top += y;
  rect.bottom += y;
  return { element, x, y };
}

function scrollDelta(
  start: number,
  end: number,
  portStart: number,
  portEnd: number,
  current: number,
  maximum: number,
  scrollable: boolean,
  scale: number,
  reverse: boolean
): number {
  if (
    !scrollable ||
    maximum === 0 ||
    scale <= 0 ||
    (end > portStart && start < portEnd)
  )
    return 0;
  const desired =
    current + ((start + end) / 2 - (portStart + portEnd) / 2) / scale;
  const next = Math.max(
    reverse ? -maximum : 0,
    Math.min(reverse ? 0 : maximum, desired)
  );
  return (current - next) * scale;
}

function clip(
  rect: Rect,
  port: Rect,
  x: boolean,
  y: boolean
): Rect | undefined {
  const result = {
    left: x ? Math.max(rect.left, port.left) : rect.left,
    right: x ? Math.min(rect.right, port.right) : rect.right,
    top: y ? Math.max(rect.top, port.top) : rect.top,
    bottom: y ? Math.min(rect.bottom, port.bottom) : rect.bottom,
  };
  return result.right > result.left && result.bottom > result.top
    ? result
    : undefined;
}

function hitElements(
  root: Document | ShadowRoot,
  x: number,
  y: number
): Element[] {
  return root
    .elementsFromPoint(x, y)
    .flatMap((element) =>
      element.getRootNode() === root && element.shadowRoot
        ? [...hitElements(element.shadowRoot, x, y), element]
        : [element]
    );
}

function hasUnobstructedPoint(
  element: Element,
  rect: Rect,
  scrolls: readonly Scroll[]
): boolean {
  // ponytail: bounded hit sampling, not pixel-perfect occlusion. Extend the
  // samples or use a browser paint-query API if narrow exposed regions matter.
  for (const horizontal of [0.05, 0.5, 0.95]) {
    for (const vertical of [0.05, 0.5, 0.95]) {
      const x = rect.left + (rect.right - rect.left) * horizontal;
      const y = rect.top + (rect.bottom - rect.top) * vertical;
      for (const hit of hitElements(element.ownerDocument, x, y)) {
        if (contains(element, hit) || contains(hit, element)) return true;
        const { ancestors, fixedToViewport } = layoutAncestors(hit);
        let left = 0;
        let top = 0;
        for (const scroll of scrolls) {
          if (scroll.element === hit || !ancestors.includes(scroll.element))
            continue;
          if (
            fixedToViewport &&
            scroll.element === element.ownerDocument.scrollingElement
          )
            continue;
          left += scroll.x;
          top += scroll.y;
        }
        const bounds = hit.getBoundingClientRect();
        if (
          x >= bounds.left + left &&
          x < bounds.right + left &&
          y >= bounds.top + top &&
          y < bounds.bottom + top
        )
          break;
      }
    }
  }
  return false;
}
