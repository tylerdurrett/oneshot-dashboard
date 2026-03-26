// Squarified treemap layout algorithm.
// Converts a list of weighted items into positioned rectangles that fill
// a container, producing near-square aspect ratios for easy readability.
// All pure logic — no React or DOM dependencies.

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** An input item to be laid out in the treemap. */
export interface TreemapItem {
  id: string;
  /** Weight determining the item's proportional area. */
  value: number;
}

/** A positioned rectangle produced by the layout algorithm. */
export interface TreemapRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum width (px) a bucket rectangle can be assigned. */
export const MIN_WIDTH = 120;

/** Minimum height (px) a bucket rectangle can be assigned. */
export const MIN_HEIGHT = 80;

// ---------------------------------------------------------------------------
// Layout helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Lay out exactly two items by splitting along the longer axis,
 * proportional to their values.
 */
function layoutTwo(
  items: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  totalValue: number,
  out: TreemapRect[],
): void {
  const first = items[0]!;
  const second = items[1]!;
  const ratio = totalValue > 0 ? first.value / totalValue : 0.5;

  if (width >= height) {
    const leftW = Math.max(width * ratio, MIN_WIDTH);
    const rightW = Math.max(width - leftW, MIN_WIDTH);
    out.push(
      { id: first.id, x, y, width: leftW, height },
      { id: second.id, x: x + leftW, y, width: rightW, height },
    );
    return;
  }

  const topH = Math.max(height * ratio, MIN_HEIGHT);
  const bottomH = Math.max(height - topH, MIN_HEIGHT);
  out.push(
    { id: first.id, x, y, width, height: topH },
    { id: second.id, x, y: y + topH, width, height: bottomH },
  );
}

/**
 * Recursive core of the treemap layout.
 * Splits the item list into two groups using a binary split that minimizes
 * a cost function balancing area ratio and item count ratio.
 */
function layoutRect(
  items: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  totalValue: number,
  out: TreemapRect[],
): void {
  if (items.length === 0) return;

  if (items.length === 1) {
    const item = items[0]!;
    out.push({
      id: item.id,
      x,
      y,
      width: Math.max(width, MIN_WIDTH),
      height: Math.max(height, MIN_HEIGHT),
    });
    return;
  }

  if (items.length === 2) {
    layoutTwo(items, x, y, width, height, totalValue, out);
    return;
  }

  // Find the split point that best balances area ratio and item count ratio
  let bestCost = Infinity;
  let bestSplit = 1;
  let bestSplitSum = 0;
  let runningSum = 0;

  for (let i = 1; i < items.length; i++) {
    runningSum += items[i - 1]!.value;
    const areaRatio = totalValue > 0 ? runningSum / totalValue : i / items.length;
    const itemRatio = i / items.length;
    const cost =
      Math.abs(areaRatio - 0.5) + Math.abs(itemRatio - 0.5) * 0.3;

    if (cost < bestCost) {
      bestCost = cost;
      bestSplit = i;
      bestSplitSum = runningSum;
    }
  }

  const groupA = items.slice(0, bestSplit);
  const groupB = items.slice(bestSplit);
  const groupAValue = bestSplitSum;
  const groupBValue = totalValue - groupAValue;
  const splitRatio = totalValue > 0 ? groupAValue / totalValue : 0.5;

  if (width >= height) {
    const leftW = width * splitRatio;
    layoutRect(groupA, x, y, leftW, height, groupAValue, out);
    layoutRect(groupB, x + leftW, y, width - leftW, height, groupBValue, out);
  } else {
    const topH = height * splitRatio;
    layoutRect(groupA, x, y, width, topH, groupAValue, out);
    layoutRect(groupB, x, y + topH, width, height - topH, groupBValue, out);
  }
}

/**
 * Equal-sized grid fallback for when all items have zero value.
 * Arranges items in a grid with `ceil(sqrt(n))` columns.
 */
function equalGrid(
  items: TreemapItem[],
  x: number,
  y: number,
  width: number,
  height: number,
): TreemapRect[] {
  const cols = Math.ceil(Math.sqrt(items.length));
  const rows = Math.ceil(items.length / cols);
  const cellW = width / cols;
  const cellH = height / rows;

  return items.map((item, i) => ({
    id: item.id,
    x: x + (i % cols) * cellW,
    y: y + Math.floor(i / cols) * cellH,
    width: cellW,
    height: cellH,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a squarified treemap layout for the given items within a container.
 *
 * Items are sized proportionally to their `value`. When all values are 0,
 * items are arranged in an equal-sized grid. Returns `[]` for empty input
 * or zero-dimension containers.
 *
 * @param items - Items to lay out, each with an `id` and numeric `value`.
 * @param containerWidth - Width of the container in pixels.
 * @param containerHeight - Height of the container in pixels.
 * @returns An array of positioned rectangles.
 */
export function squarify(
  items: TreemapItem[],
  containerWidth: number,
  containerHeight: number,
): TreemapRect[] {
  if (items.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return [];
  }

  // Sort descending by value so the largest items get the most square regions
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, it) => s + it.value, 0);

  const out: TreemapRect[] = [];

  if (totalValue === 0) {
    return equalGrid(sorted, 0, 0, containerWidth, containerHeight);
  }

  layoutRect(sorted, 0, 0, containerWidth, containerHeight, totalValue, out);
  return out;
}
