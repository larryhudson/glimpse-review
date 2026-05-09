export function closestElement(node: Node | null): Element | null {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
  return node.parentElement;
}

export function selectionContextElement(range: Range): Element | null {
  return closestElement(range.startContainer);
}

export function elementReference(element: Element | null) {
  if (!element) return null;
  return {
    outerHTML: element.outerHTML,
  };
}

export function shellRectForRange(frame: HTMLIFrameElement, range: Range): DOMRect | null {
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  const frameRect = frame.getBoundingClientRect();
  return new DOMRect(
    frameRect.left + rect.left,
    frameRect.top + rect.top,
    rect.width,
    rect.height
  );
}

export function shellRectForElement(frame: HTMLIFrameElement, element: Element): DOMRect {
  const rect = element.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  return new DOMRect(
    frameRect.left + rect.left,
    frameRect.top + rect.top,
    rect.width,
    rect.height
  );
}
