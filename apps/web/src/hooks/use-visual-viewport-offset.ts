import { useEffect, useState } from 'react';

const PADDING = 16; // px margin above/below the dialog when keyboard is open

export interface KeyboardLayoutStyle {
  /** Anchor the dialog to the top of the visual viewport (+ padding). */
  top: string;
  /** Keep horizontal centering but remove the vertical -50% offset.
   *  Tailwind v4 uses the CSS `translate` property (not `transform`),
   *  so we must override `translate` to avoid stacking. */
  translate: string;
  /** Cap height so the dialog + footer fits within the visible area. */
  maxHeight: string;
  /** Allow scrolling when content exceeds the capped height. */
  overflowY: 'auto';
}

/**
 * Returns a style object that keeps a fixed-position dialog fully visible
 * when the on-screen keyboard is open (iOS PWA), or `undefined` when no
 * adjustment is needed.
 *
 * Spread the result onto the dialog element:
 *   `style={keyboardStyle ?? undefined}`
 *
 * When active it:
 * - Anchors the dialog to the top of the visual viewport (with padding)
 * - Caps max-height so it fits within the visible area
 * - Makes the dialog scrollable if its content is taller than the space
 * - Overrides `translateY(-50%)` so top-anchoring works correctly
 */
export function useVisualViewportOffset(): KeyboardLayoutStyle | undefined {
  const [style, setStyle] = useState<KeyboardLayoutStyle | undefined>(undefined);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // When the keyboard is open the visual viewport is significantly shorter
      // than the full window. The 0.85 threshold avoids false positives from
      // minor browser-chrome changes (e.g. Safari URL bar collapsing).
      if (vv.height < window.innerHeight * 0.85) {
        const top = vv.offsetTop + PADDING;
        const maxHeight = vv.height - PADDING * 2;
        setStyle({
          top: `${top}px`,
          translate: '-50% 0',
          maxHeight: `${maxHeight}px`,
          overflowY: 'auto',
        });
      } else {
        setStyle(undefined);
      }
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    // Run once in case the keyboard is already open when the hook mounts.
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return style;
}
