import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SwipeView, computeSnapIndex } from '../index';

// jsdom doesn't provide ResizeObserver — stub it for component rendering tests.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// computeSnapIndex — pure function tests
// ---------------------------------------------------------------------------

describe('computeSnapIndex', () => {
  it('snaps to next page on fast left flick', () => {
    // Negative velocity = swiping left = next page
    expect(computeSnapIndex(0.2, -500, 0, 3)).toBe(1);
  });

  it('snaps to previous page on fast right flick', () => {
    // Positive velocity = swiping right = previous page
    expect(computeSnapIndex(1.8, 500, 2, 3)).toBe(1);
  });

  it('snaps to nearest page on slow drag past halfway', () => {
    expect(computeSnapIndex(1.6, 0, 1, 3)).toBe(2);
  });

  it('snaps back on slow drag that did not cross halfway', () => {
    expect(computeSnapIndex(0.3, 0, 0, 3)).toBe(0);
  });

  it('clamps to first page (never goes negative)', () => {
    expect(computeSnapIndex(-0.1, 500, 0, 3)).toBe(0);
  });

  it('clamps to last page (never exceeds pageCount - 1)', () => {
    expect(computeSnapIndex(2.1, -500, 2, 3)).toBe(2);
  });

  it('handles single page (always returns 0)', () => {
    expect(computeSnapIndex(0, -500, 0, 1)).toBe(0);
    expect(computeSnapIndex(0, 500, 0, 1)).toBe(0);
  });

  it('velocity threshold edge case — exactly at threshold snaps to nearest', () => {
    // velocity === 300 is NOT above threshold, so should snap to nearest
    expect(computeSnapIndex(0.4, -300, 0, 3)).toBe(0);
    expect(computeSnapIndex(0.6, -300, 0, 3)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SwipeView component — render tests
// ---------------------------------------------------------------------------

describe('SwipeView', () => {
  it('renders all children simultaneously', () => {
    render(
      <SwipeView activeIndex={0} onIndexChange={vi.fn()} pageCount={3}>
        <div>Page A</div>
        <div>Page B</div>
        <div>Page C</div>
      </SwipeView>,
    );

    expect(screen.getByText('Page A')).toBeDefined();
    expect(screen.getByText('Page B')).toBeDefined();
    expect(screen.getByText('Page C')).toBeDefined();
  });

  it('wraps each child in a swipe-view-page slot', () => {
    const { container } = render(
      <SwipeView activeIndex={0} onIndexChange={vi.fn()} pageCount={2}>
        <div>First</div>
        <div>Second</div>
      </SwipeView>,
    );

    const pages = container.querySelectorAll('[data-slot="swipe-view-page"]');
    expect(pages).toHaveLength(2);
  });

  it('renders outer container with swipe-view data-slot', () => {
    const { container } = render(
      <SwipeView activeIndex={0} onIndexChange={vi.fn()} pageCount={1}>
        <div>Only</div>
      </SwipeView>,
    );

    const el = container.querySelector('[data-slot="swipe-view"]');
    expect(el).not.toBeNull();
  });

  it('does not crash when disabled', () => {
    render(
      <SwipeView activeIndex={0} onIndexChange={vi.fn()} pageCount={2} disabled>
        <div>A</div>
        <div>B</div>
      </SwipeView>,
    );

    expect(screen.getByText('A')).toBeDefined();
    expect(screen.getByText('B')).toBeDefined();
  });

  it('applies custom className to the container', () => {
    const { container } = render(
      <SwipeView
        activeIndex={0}
        onIndexChange={vi.fn()}
        pageCount={1}
        className="my-custom-class"
      >
        <div>Content</div>
      </SwipeView>,
    );

    const el = container.querySelector('[data-slot="swipe-view"]');
    expect(el?.classList.contains('my-custom-class')).toBe(true);
  });

  it('exports SwipeView from the package barrel', () => {
    expect(SwipeView).toBeDefined();
    expect(computeSnapIndex).toBeDefined();
  });
});
