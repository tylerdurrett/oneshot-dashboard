import { describe, expect, it } from 'vitest';
import { squarify, MIN_WIDTH, MIN_HEIGHT } from '../_lib/treemap';
import type { TreemapItem } from '../_lib/treemap';

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('squarify — edge cases', () => {
  it('returns [] for empty items', () => {
    expect(squarify([], 800, 600)).toEqual([]);
  });

  it('returns [] for zero-width container', () => {
    expect(squarify([{ id: 'a', value: 1 }], 0, 600)).toEqual([]);
  });

  it('returns [] for zero-height container', () => {
    expect(squarify([{ id: 'a', value: 1 }], 800, 0)).toEqual([]);
  });

  it('returns [] for negative dimensions', () => {
    expect(squarify([{ id: 'a', value: 1 }], -100, 600)).toEqual([]);
    expect(squarify([{ id: 'a', value: 1 }], 800, -100)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Single item
// ---------------------------------------------------------------------------

describe('squarify — single item', () => {
  it('fills the entire container', () => {
    const result = squarify([{ id: 'a', value: 1 }], 800, 600);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'a', x: 0, y: 0, width: 800, height: 600 });
  });

  it('enforces minimum dimensions for small containers', () => {
    const result = squarify([{ id: 'a', value: 1 }], 50, 30);
    expect(result).toHaveLength(1);
    expect(result[0]!.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(result[0]!.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
  });
});

// ---------------------------------------------------------------------------
// Two items
// ---------------------------------------------------------------------------

describe('squarify — two items', () => {
  it('splits two equal items 50/50 along the longer axis', () => {
    const items: TreemapItem[] = [
      { id: 'a', value: 50 },
      { id: 'b', value: 50 },
    ];
    const result = squarify(items, 800, 400);

    // Wider container → horizontal split
    expect(result).toHaveLength(2);
    const rectA = result.find((r) => r.id === 'a')!;
    const rectB = result.find((r) => r.id === 'b')!;
    expect(rectA.width).toBeCloseTo(400, 0);
    expect(rectB.width).toBeCloseTo(400, 0);
    expect(rectA.height).toBe(400);
    expect(rectB.height).toBe(400);
  });

  it('splits two equal items vertically when taller than wide', () => {
    const items: TreemapItem[] = [
      { id: 'a', value: 50 },
      { id: 'b', value: 50 },
    ];
    const result = squarify(items, 400, 800);

    // Taller container → vertical split
    expect(result).toHaveLength(2);
    const rectA = result.find((r) => r.id === 'a')!;
    const rectB = result.find((r) => r.id === 'b')!;
    expect(rectA.height).toBeCloseTo(400, 0);
    expect(rectB.height).toBeCloseTo(400, 0);
    expect(rectA.width).toBe(400);
    expect(rectB.width).toBe(400);
  });

  it('splits two unequal items proportionally', () => {
    const items: TreemapItem[] = [
      { id: 'big', value: 75 },
      { id: 'small', value: 25 },
    ];
    const result = squarify(items, 800, 400);

    expect(result).toHaveLength(2);
    const big = result.find((r) => r.id === 'big')!;
    const small = result.find((r) => r.id === 'small')!;
    // 75% of 800 = 600, 25% of 800 = 200
    expect(big.width).toBeCloseTo(600, 0);
    expect(small.width).toBeCloseTo(200, 0);
  });
});

// ---------------------------------------------------------------------------
// Multiple items
// ---------------------------------------------------------------------------

describe('squarify — multiple items', () => {
  it('lays out four weighted items in a 400x300 container', () => {
    const items: TreemapItem[] = [
      { id: 'A', value: 100 },
      { id: 'B', value: 60 },
      { id: 'C', value: 30 },
      { id: 'D', value: 10 },
    ];
    const result = squarify(items, 400, 300);

    expect(result).toHaveLength(4);

    // Every rectangle should have positive dimensions
    for (const rect of result) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }

    // Largest item should have the largest area
    const areas = result.map((r) => ({ id: r.id, area: r.width * r.height }));
    const areaA = areas.find((a) => a.id === 'A')!.area;
    const areaD = areas.find((a) => a.id === 'D')!.area;
    expect(areaA).toBeGreaterThan(areaD);
  });

  it('produces rectangles with total area ≈ container area', () => {
    // Use a large container so MIN_WIDTH/MIN_HEIGHT enforcement doesn't
    // inflate the total area beyond the container bounds.
    const items: TreemapItem[] = [
      { id: 'A', value: 100 },
      { id: 'B', value: 60 },
      { id: 'C', value: 30 },
      { id: 'D', value: 10 },
    ];
    const containerW = 1200;
    const containerH = 900;
    const result = squarify(items, containerW, containerH);

    const totalArea = result.reduce((sum, r) => sum + r.width * r.height, 0);
    const containerArea = containerW * containerH;

    // Allow 1% tolerance for rounding
    expect(totalArea).toBeCloseTo(containerArea, -1);
  });

  it('all rectangles have positive width and height', () => {
    const items: TreemapItem[] = [
      { id: '1', value: 50 },
      { id: '2', value: 30 },
      { id: '3', value: 15 },
      { id: '4', value: 5 },
    ];
    const result = squarify(items, 600, 400);

    for (const rect of result) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('handles 10 items without errors', () => {
    const items: TreemapItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      value: 10 + i * 5,
    }));
    const result = squarify(items, 1200, 800);

    expect(result).toHaveLength(10);
    for (const rect of result) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('handles 100 items without stack overflow', () => {
    const items: TreemapItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: `item-${i}`,
      value: Math.max(1, 100 - i),
    }));
    const result = squarify(items, 1920, 1080);

    expect(result).toHaveLength(100);
    for (const rect of result) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Zero-value fallback (equal grid)
// ---------------------------------------------------------------------------

describe('squarify — zero-value items', () => {
  it('produces equal-sized cells when all values are 0', () => {
    const items: TreemapItem[] = [
      { id: 'a', value: 0 },
      { id: 'b', value: 0 },
      { id: 'c', value: 0 },
      { id: 'd', value: 0 },
    ];
    const result = squarify(items, 800, 600);

    expect(result).toHaveLength(4);

    // All cells should have the same dimensions
    const widths = result.map((r) => r.width);
    const heights = result.map((r) => r.height);
    expect(new Set(widths.map((w) => Math.round(w)))).toHaveProperty('size', 1);
    expect(new Set(heights.map((h) => Math.round(h)))).toHaveProperty('size', 1);

    // Total area should equal container area
    const totalArea = result.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(totalArea).toBeCloseTo(800 * 600, -1);
  });

  it('produces a grid layout for 3 zero-value items', () => {
    const items: TreemapItem[] = [
      { id: 'a', value: 0 },
      { id: 'b', value: 0 },
      { id: 'c', value: 0 },
    ];
    const result = squarify(items, 600, 400);

    expect(result).toHaveLength(3);
    for (const rect of result) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });
});
