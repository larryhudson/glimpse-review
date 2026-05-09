import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  autoUpdate,
  arrow,
  computePosition,
  flip,
  offset,
  shift,
} from '@floating-ui/dom';
import {
  closestElement,
  elementReference,
  selectionContextElement,
  shellRectForElement,
  shellRectForRange,
} from './positioning.js';

declare const __DEV_SAMPLE_PATH__: string;

declare global {
  interface Window {
    glimpse: {
      send(payload: unknown): void;
    };
    __glimpseReview?: {
      setContent(html: string): void;
      updateContent(html: string): void;
      highlight(selector: string): void;
      annotate(selector: string, text: string): void;
    };
  }
}

type AnnotationState = {
  selector: string;
  text: string;
  element: { outerHTML: string } | null;
  replies: string[];
  rect: DOMRect;
};

type SelectionState = {
  text: string;
  element: { outerHTML: string } | null;
  range: Range;
  rect: DOMRect;
};

type FloatingPos = {
  x: number;
  y: number;
  placement?: string;
  arrowX?: number;
  arrowY?: number;
};

// In srcdoc iframes, href="#section" can resolve against the shell URL and
// navigate the iframe to a nested review shell instead of scrolling in place.
const HASH_LINK_HELPER = `<script>
(() => {
  function fragmentTarget(rawHash) {
    const rawId = rawHash.slice(1);
    if (!rawId) return document.documentElement;

    let id = rawId;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = rawId;
    }

    const target = document.getElementById(id);
    if (target) return target;

    const escapedId = CSS.escape(id);
    return document.querySelector('a[name="' + escapedId + '"], [name="' + escapedId + '"]');
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('#')) return;

    const destination = fragmentTarget(href);
    if (!destination) return;

    event.preventDefault();
    destination.scrollIntoView({ block: 'start' });
  }, true);
})();
</script>`;

const DEBUG_REVIEW_SHELL = true;

function debugLog(label: string, data?: unknown) {
  if (!DEBUG_REVIEW_SHELL) return;
  if (data === undefined) {
    console.log(`[review-shell] ${label}`);
  } else {
    console.log(`[review-shell] ${label}`, data);
  }
}

function subscribeFramePositionUpdates(frame: HTMLIFrameElement, update: () => void) {
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  let frameId: number | null = null;

  const scheduleUpdate = () => {
    if (frameId != null) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      update();
    });
  };

  win?.addEventListener('scroll', scheduleUpdate, { passive: true });
  win?.addEventListener('resize', scheduleUpdate);
  doc?.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true });

  return () => {
    if (frameId != null) {
      window.cancelAnimationFrame(frameId);
    }
    win?.removeEventListener('scroll', scheduleUpdate);
    win?.removeEventListener('resize', scheduleUpdate);
    doc?.removeEventListener('scroll', scheduleUpdate, true);
  };
}

function formDataToObject(form: HTMLFormElement) {
  const data = new FormData(form);
  const result: Record<string, FormDataEntryValue | FormDataEntryValue[] | boolean> = {};

  for (const [key, value] of data.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const current = result[key] as FormDataEntryValue | FormDataEntryValue[];
      result[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      result[key] = value;
    }
  }

  for (const checkbox of form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name]')) {
    if (!checkbox.checked && !Object.prototype.hasOwnProperty.call(result, checkbox.name)) {
      result[checkbox.name] = false;
    }
  }

  return result;
}

function contentWithReviewHelpers(html: string): string {
  if (!html) return html;
  if (html.includes('data-glimpse-review-hash-link-helper')) return html;

  const helper = HASH_LINK_HELPER.replace('<script>', '<script data-glimpse-review-hash-link-helper>');
  const match = html.match(/<\/body\s*>/gi);
  if (match) {
    const last = match[match.length - 1];
    const idx = html.lastIndexOf(last);
    return `${html.slice(0, idx)}${helper}${html.slice(idx)}`;
  }

  return `${html}${helper}`;
}

function App() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const annotationRef = useRef<HTMLDivElement>(null);
  const annotationArrowRef = useRef<HTMLSpanElement>(null);
  const selectionButtonRef = useRef<HTMLButtonElement>(null);
  const selectionFormRef = useRef<HTMLDivElement>(null);

  const [contentHtml, setContentHtml] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pendingHtml, setPendingHtml] = useState<string | null>(null);
  const [commentsHidden, setCommentsHidden] = useState(false);
  const [refreshVisible, setRefreshVisible] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const [activeSelector, setActiveSelector] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationState | null>(null);
  const [annotationPos, setAnnotationPos] = useState<FloatingPos | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [selectionButtonPos, setSelectionButtonPos] = useState<FloatingPos | null>(null);
  const [selectionFormPos, setSelectionFormPos] = useState<FloatingPos | null>(null);
  const [selectionCommentOpen, setSelectionCommentOpen] = useState(false);
  const frameCleanupRef = useRef<(() => void) | null>(null);
  const selectionEventCountRef = useRef(0);
  const selectionButtonPositionCountRef = useRef(0);
  const selectionFormPositionCountRef = useRef(0);
  const annotationPositionCountRef = useRef(0);

  const commitContent = (html: string) => {
    debugLog('commitContent', { length: html.length });
    setContentHtml(html);
    setDirty(false);
    setPendingHtml(null);
    setRefreshVisible(false);
    setSelection(null);
    setSelectionCommentOpen(false);
    setSelectionButtonPos(null);
    setSelectionFormPos(null);
  };

  useEffect(() => {
    debugLog('boot');
    if (!window.glimpse && import.meta.env.DEV) {
      window.glimpse = {
        send: (payload: unknown) => console.log('[glimpse]', payload),
      };
    }

    window.glimpse.send({ type: 'review-ready' });

    if (import.meta.env.DEV) {
      fetch(__DEV_SAMPLE_PATH__)
        .then((response) => response.text())
        .then((html) => commitContent(html))
        .catch((error) => console.error('Failed to load dev review page', error));
    }
  }, []);

  useEffect(() => {
    debugLog('__glimpseReview registered', { dirty, annotation: annotation?.selector });
    window.__glimpseReview = {
      setContent: (html) => {
        commitContent(html);
      },
      updateContent: (html) => {
        if (dirty) {
          setPendingHtml(html);
          setRefreshVisible(true);
          return;
        }
        commitContent(html);
      },
      highlight: (selector) => {
        debugLog('api.highlight', { selector });
        setActiveSelector(selector);
        setSelection(null);
        setSelectionCommentOpen(false);
      },
      annotate: (selector, text) => {
        debugLog('api.annotate', { selector, text });
        const frame = frameRef.current;
        const target = frame?.contentDocument?.querySelector(selector);
        if (!frame || !target) return;
        setActiveSelector(selector);
        setSelection(null);
        setSelectionCommentOpen(false);
        setCommentsHidden(false);
        setAnnotation({
          selector,
          text,
          element: elementReference(target),
          replies: [],
          rect: shellRectForElement(frame, target),
        });
      },
    };

    return () => {
      delete window.__glimpseReview;
    };
  }, [dirty, annotation?.selector]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const onLoad = () => {
      debugLog('iframe load');
      setFrameVersion((n) => n + 1);
      frameCleanupRef.current?.();
      const doc = frame.contentDocument;
      if (!doc) return;

      const onSubmit = (event: Event) => {
        const target = event.target as Element | null;
        const form = event.target instanceof HTMLFormElement ? event.target : target?.closest('form');
        if (!form) return;
        event.preventDefault();
        window.glimpse.send({
          type: 'form-submit',
          form: form.id || form.name || null,
          data: formDataToObject(form),
        });
      };

      const markDirty = (event: Event) => {
        if (event.target instanceof Element && event.target.closest('form')) {
          setDirty(true);
        }
      };

      const onSelectionChange = () => {
        selectionEventCountRef.current += 1;
        const selectionObj = doc.getSelection();
        const text = selectionObj?.toString().trim() ?? '';
        debugLog('selectionchange', {
          count: selectionEventCountRef.current,
          text,
          rangeCount: selectionObj?.rangeCount ?? 0,
        });
        setSelectionCommentOpen(false);
        setSelectionButtonPos(null);
        setSelectionFormPos(null);

        if (!selectionObj || selectionObj.rangeCount === 0 || !text) {
          setSelection(null);
          return;
        }

        const range = selectionObj.getRangeAt(0).cloneRange();
        const rect = shellRectForRange(frame, range);
        debugLog('selection rect', rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null);
        if (!rect) {
          setSelection(null);
          return;
        }

        setSelection({
          text,
          element: elementReference(selectionContextElement(range)),
          range,
          rect,
        });
        debugLog('selection state set', { text });
      };

      const onPointerDown = () => {
        debugLog('iframe pointerdown');
        setSelectionCommentOpen(false);
      };

      doc.addEventListener('submit', onSubmit, true);
      doc.addEventListener('input', markDirty, true);
      doc.addEventListener('change', markDirty, true);
      doc.addEventListener('selectionchange', onSelectionChange);
      doc.addEventListener('pointerdown', onPointerDown);

      frameCleanupRef.current = () => {
        doc.removeEventListener('submit', onSubmit, true);
        doc.removeEventListener('input', markDirty, true);
        doc.removeEventListener('change', markDirty, true);
        doc.removeEventListener('selectionchange', onSelectionChange);
        doc.removeEventListener('pointerdown', onPointerDown);
      };
    };

    if (frame.contentDocument?.readyState === 'complete') {
      onLoad();
    }

    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      frameCleanupRef.current?.();
      frameCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !annotation || commentsHidden) {
      debugLog('annotation positioning skipped', {
        hasFrame: Boolean(frame),
        hasAnnotation: Boolean(annotation),
        commentsHidden,
      });
      setAnnotationPos(null);
      return;
    }

    const target = frame.contentDocument?.querySelector(annotation.selector);
    if (!target) {
      setAnnotation(null);
      setAnnotationPos(null);
      return;
    }

    if (!annotationRef.current || !annotationArrowRef.current) {
      debugLog('annotation refs missing', {
        hasAnnotation: Boolean(annotationRef.current),
        hasArrow: Boolean(annotationArrowRef.current),
      });
      return;
    }

    const update = () => {
      annotationPositionCountRef.current += 1;
      debugLog('annotation position update', {
        count: annotationPositionCountRef.current,
        selector: annotation.selector,
      });
      const reference = {
        getBoundingClientRect() {
          return shellRectForElement(frame, target);
        },
        contextElement: frame,
      };

      computePosition(reference, annotationRef.current!, {
        placement: 'bottom-start',
        strategy: 'fixed',
        middleware: [
          offset(12),
          flip({ padding: 12 }),
          shift({ padding: 12 }),
          arrow({ element: annotationArrowRef.current!, padding: 12 }),
        ],
      }).then(({ x, y, placement, middlewareData }) => {
        debugLog('annotation positioned', { x, y, placement });
        const { x: arrowX, y: arrowY } = middlewareData.arrow ?? {};
        setAnnotationPos({
          x,
          y,
          placement,
          arrowX,
          arrowY,
        });
      });
    };

    const cleanupAutoUpdate = autoUpdate(
      {
        getBoundingClientRect() {
          return shellRectForElement(frame, target);
        },
        contextElement: frame,
      },
      annotationRef.current,
      update,
      {
        ancestorScroll: true,
        ancestorResize: true,
        elementResize: true,
        layoutShift: true,
      }
    );
    const cleanupFrameUpdates = subscribeFramePositionUpdates(frame, update);

    update();
    return () => {
      cleanupAutoUpdate();
      cleanupFrameUpdates();
    };
  }, [annotation, commentsHidden, frameVersion]);

  useEffect(() => {
    if (!selection || selectionCommentOpen) {
      debugLog('selection button positioning skipped', {
        hasSelection: Boolean(selection),
        selectionCommentOpen,
      });
      setSelectionButtonPos(null);
      return;
    }

    const frame = frameRef.current;
    if (!frame || !selectionButtonRef.current) {
      debugLog('selection button ref missing', {
        hasFrame: Boolean(frame),
        hasButton: Boolean(selectionButtonRef.current),
      });
      return;
    }

    const update = () => {
      selectionButtonPositionCountRef.current += 1;
      debugLog('selection button position update', {
        count: selectionButtonPositionCountRef.current,
        text: selection.text,
      });
      computePosition(
        {
          getBoundingClientRect() {
            return shellRectForRange(frame, selection.range) ?? new DOMRect(0, 0, 0, 0);
          },
          contextElement: frame,
        },
        selectionButtonRef.current!,
        {
          placement: 'top',
          strategy: 'fixed',
          middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
        }
      ).then(({ x, y }) => {
        debugLog('selection button positioned', { x, y });
        setSelectionButtonPos({ x, y });
      });
    };

    const cleanup = autoUpdate(
      {
        getBoundingClientRect() {
          return shellRectForRange(frame, selection.range) ?? new DOMRect(0, 0, 0, 0);
        },
        contextElement: frame,
      },
      selectionButtonRef.current!,
      update,
      {
        ancestorScroll: true,
        ancestorResize: true,
        elementResize: true,
        layoutShift: true,
      }
    );

    update();
    return cleanup;
  }, [selection, selectionCommentOpen, frameVersion]);

  useEffect(() => {
    if (!selection || !selectionCommentOpen || !selectionFormRef.current) {
      debugLog('selection form positioning skipped', {
        hasSelection: Boolean(selection),
        selectionCommentOpen,
        hasForm: Boolean(selectionFormRef.current),
      });
      setSelectionFormPos(null);
      return;
    }

    const frame = frameRef.current;
    if (!frame) {
      debugLog('selection form frame missing');
      return;
    }

    const update = () => {
      selectionFormPositionCountRef.current += 1;
      debugLog('selection form position update', {
        count: selectionFormPositionCountRef.current,
        text: selection.text,
      });
      computePosition(
        {
          getBoundingClientRect() {
            return shellRectForRange(frame, selection.range) ?? new DOMRect();
          },
          contextElement: frame,
        },
        selectionFormRef.current!,
        {
          placement: 'bottom-start',
          strategy: 'fixed',
          middleware: [offset(10), flip({ padding: 12 }), shift({ padding: 12 })],
        }
      ).then(({ x, y }) => {
        debugLog('selection form positioned', { x, y });
        setSelectionFormPos({ x, y });
      });
    };

    const cleanup = autoUpdate(
      {
        getBoundingClientRect() {
          return shellRectForRange(frame, selection.range) ?? new DOMRect(0, 0, 0, 0);
        },
        contextElement: frame,
      },
      selectionFormRef.current!,
      update,
      {
        ancestorScroll: true,
        ancestorResize: true,
        elementResize: true,
        layoutShift: true,
      }
    );

    update();
    return cleanup;
  }, [selection, selectionCommentOpen, frameVersion]);

  useEffect(() => {
    if (!activeSelector || annotation) return;

    const frame = frameRef.current;
    const target = frame?.contentDocument?.querySelector(activeSelector);
    if (!frame || !target) {
      setActiveSelector(null);
      return;
    }

    target.classList.add('glimpse-review-highlight');
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    debugLog('highlight applied', { activeSelector });
  }, [activeSelector, annotation, frameVersion]);

  const handleRefresh = () => {
    if (!pendingHtml) return;
    commitContent(pendingHtml);
  };

  return (
    <>
      <iframe
        ref={frameRef}
        id="glimpse-review-frame"
        title="Reviewed HTML"
        srcDoc={contentWithReviewHelpers(contentHtml)}
      />

      {refreshVisible && (
        <div className="glimpse-review-refresh" role="status" aria-live="polite">
          <span>File changed</span>
          <button type="button" onClick={handleRefresh}>
            Refresh
          </button>
        </div>
      )}

      {annotation && !commentsHidden && (
        <div
          ref={annotationRef}
          className="glimpse-review-annotation"
          role="note"
          data-placement={annotationPos?.placement}
          style={{
            left: `${annotationPos?.x ?? 0}px`,
            top: `${annotationPos?.y ?? 0}px`,
            opacity: annotationPos ? 1 : 0,
          }}
        >
          <span
            ref={annotationArrowRef}
            className="glimpse-review-annotation-arrow"
            aria-hidden="true"
            style={{
              left: annotationPos?.arrowX != null ? `${annotationPos.arrowX}px` : '',
              top: annotationPos?.arrowY != null ? `${annotationPos.arrowY}px` : '',
            }}
          />
          <p>{annotation.text}</p>
          {annotation.replies.length > 0 && (
            <ol className="glimpse-review-annotation-replies">
              {annotation.replies.map((reply, index) => (
                <li key={`${index}:${reply}`} className="glimpse-review-annotation-reply">
                  <strong>Reply {index + 1}</strong>
                  <span>{reply}</span>
                </li>
              ))}
            </ol>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const reply = new FormData(form).get('reply');
              if (typeof reply !== 'string' || !reply.trim()) return;
              window.glimpse.send({
                type: 'annotation-reply',
                selector: annotation.selector,
                annotation: annotation.text,
                reply,
                submittedAt: new Date().toISOString(),
              });
              form.reset();
              setAnnotation((current) =>
                current ? { ...current, replies: [...current.replies, reply] } : current
              );
            }}
          >
        <textarea name="reply" placeholder="Reply" />
          <button type="submit">Reply</button>
        </form>
        </div>
      )}

      {!commentsHidden && selection && !selectionCommentOpen && (
        <button
          ref={selectionButtonRef}
          className="glimpse-review-selection-button"
          type="button"
          style={{
            left: `${selectionButtonPos?.x ?? 0}px`,
            top: `${selectionButtonPos?.y ?? 0}px`,
            opacity: selectionButtonPos ? 1 : 0,
          }}
          onClick={() => setSelectionCommentOpen(true)}
        >
          Comment
        </button>
      )}

      {!commentsHidden && selection && selectionCommentOpen && (
        <aside
          ref={selectionFormRef}
          className="glimpse-review-selection-comment"
          role="dialog"
          style={{
            left: `${selectionFormPos?.x ?? 0}px`,
            top: `${selectionFormPos?.y ?? 0}px`,
            opacity: selectionFormPos ? 1 : 0,
          }}
        >
          <blockquote>{selection.text}</blockquote>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const comment = new FormData(form).get('comment');
              if (typeof comment !== 'string' || !comment.trim()) return;
              window.glimpse.send({
                type: 'selection-comment',
                selectedText: selection.text,
                comment,
                element: selection.element,
                submittedAt: new Date().toISOString(),
              });
              setSelectionCommentOpen(false);
            }}
          >
            <textarea name="comment" placeholder="Add a comment" />
            <footer>
              <button
                type="button"
                onClick={() => {
                  setSelectionCommentOpen(false);
                }}
              >
                Cancel
              </button>
              <button type="submit">Submit</button>
            </footer>
          </form>
        </aside>
      )}

      {annotation && (
        <button
          className="glimpse-review-comments-toggle"
          type="button"
          aria-pressed={commentsHidden}
          onClick={() => setCommentsHidden((value) => !value)}
        >
          {commentsHidden ? 'Show comments' : 'Hide comments'}
        </button>
      )}
    </>
  );
}

render(<App />, document.getElementById('app')!);
