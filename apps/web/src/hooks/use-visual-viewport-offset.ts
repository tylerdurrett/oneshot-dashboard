import { useEffect, useState } from 'react';

const PADDING = 16; // px margin above/below the dialog
const MOBILE_QUERY = '(max-width: 767.98px)';

export interface KeyboardLayoutStyle {
  /** Anchor the dialog to the top of the visual viewport (+ padding). */
  top: string;
  /** Keep horizontal centering but remove the vertical -50% offset.
   *  Tailwind v4 uses the CSS `translate` property (not `transform`),
   *  so we must override `translate` to avoid stacking. */
  translate: string;
  /** Cap height so the dialog fits within the visible area. */
  maxHeight: string;
  /** Allow scrolling when content exceeds the capped height. */
  overflowY: 'auto';
}

/**
 * On mobile, returns a style object that top-anchors a fixed-position dialog
 * and caps its height to the visible area. When the on-screen keyboard opens
 * (iOS PWA) the maxHeight shrinks automatically — but the dialog never jumps
 * because it was already top-anchored.
 *
 * On desktop returns `undefined` — the CSS `top:50%; translate:-50% -50%`
 * centering remains in effect.
 */
export function useVisualViewportOffset(): KeyboardLayoutStyle | undefined {
  const [style, setStyle] = useState<KeyboardLayoutStyle | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    if (!window.matchMedia(MOBILE_QUERY).matches) return undefined;
    // Initial mobile style before any viewport events
    return buildStyle(window.visualViewport);
  });

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);

    const update = () => {
      if (!mq.matches) {
        setStyle(undefined);
        return;
      }
      setStyle(buildStyle(window.visualViewport));
    };

    // React to mobile breakpoint changes (e.g. orientation change)
    const onBreakpoint = () => update();
    mq.addEventListener('change', onBreakpoint);

    // React to visual viewport changes (keyboard open/close)
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }

    // Run once on mount
    update();

    return () => {
      mq.removeEventListener('change', onBreakpoint);
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
    };
  }, []);

  return style;
}

function buildStyle(vv: VisualViewport | null): KeyboardLayoutStyle {
  const availableHeight = vv?.height ?? window.innerHeight;
  const offsetTop = vv?.offsetTop ?? 0;
  // env(safe-area-inset-top) accounts for the status bar / dynamic island
  // in iOS PWA standalone mode. Falls back to 0px on non-notched devices.
  const safeTop = 'env(safe-area-inset-top, 0px)';
  return {
    top: `calc(${offsetTop + PADDING}px + ${safeTop})`,
    translate: '-50% 0',
    maxHeight: `calc(${availableHeight - PADDING * 2}px - ${safeTop})`,
    overflowY: 'auto',
  };
}
