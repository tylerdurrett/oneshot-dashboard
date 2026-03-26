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

export interface TreemapConstraints {
  minWidth?: number;
  minHeight?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum width (px) a bucket rectangle can be assigned. */
export const MIN_WIDTH = 140;

/** Minimum height (px) a bucket rectangle can be assigned. */
export const MIN_HEIGHT = 96;

// ---------------------------------------------------------------------------
// Constraint helpers
// ---------------------------------------------------------------------------

function normalizeConstraints(
  constraints: TreemapConstraints = {},
): Required<TreemapConstraints> {
  return {
    minWidth: Math.max(1, constraints.minWidth ?? MIN_WIDTH),
    minHeight: Math.max(1, constraints.minHeight ?? MIN_HEIGHT),
  };
}

/**
 * Buckets on narrow screens need stronger visibility guarantees than desktop.
 * Small phones stack tiny buckets full-width; slightly larger phones allow
 * roughly two columns; larger screens fall back to the default minimums.
 */
export function getResponsiveTreemapConstraints(
  containerWidth: number,
): Required<TreemapConstraints> {
  if (containerWidth <= 360) {
    return { minWidth: Math.max(1, containerWidth), minHeight: MIN_HEIGHT };
  }

  if (containerWidth <= 520) {
    return {
      minWidth: Math.max(160, containerWidth / 2),
      minHeight: MIN_HEIGHT,
    };
  }

  return { minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT };
}

function chooseSplitAxis(
  width: number,
  height: number,
  constraints: Required<TreemapConstraints>,
): 'columns' | 'rows' {
  const canSplitColumns = width >= constraints.minWidth * 2;
  const canSplitRows = height >= constraints.minHeight * 2;

  if (canSplitColumns && canSplitRows) {
    return width >= height ? 'columns' : 'rows';
  }

  if (canSplitRows) return 'rows';
  if (canSplitColumns) return 'columns';

  return width >= height ? 'columns' : 'rows';
}

function splitLength(
  totalLength: number,
  ratio: number,
  minSegment: number,
): [number, number] {
  if (totalLength < minSegment * 2) {
    const first = totalLength * ratio;
    return [first, totalLength - first];
  }

  const first = Math.min(
    totalLength - minSegment,
    Math.max(minSegment, totalLength * ratio),
  );

  return [first, totalLength - first];
}

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
  constraints: Required<TreemapConstraints>,
  out: TreemapRect[],
): void {
  const first = items[0]!;
  const second = items[1]!;
  const ratio = totalValue > 0 ? first.value / totalValue : 0.5;
  const axis = chooseSplitAxis(width, height, constraints);

  if (axis === 'columns') {
    const [leftW, rightW] = splitLength(width, ratio, constraints.minWidth);
    out.push(
      { id: first.id, x, y, width: leftW, height },
      { id: second.id, x: x + leftW, y, width: rightW, height },
    );
    return;
  }

  const [topH, bottomH] = splitLength(height, ratio, constraints.minHeight);
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
  constraints: Required<TreemapConstraints>,
  out: TreemapRect[],
): void {
  if (items.length === 0) return;

  if (items.length === 1) {
    const item = items[0]!;
    out.push({
      id: item.id,
      x,
      y,
      width,
      height,
    });
    return;
  }

  if (items.length === 2) {
    layoutTwo(items, x, y, width, height, totalValue, constraints, out);
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
  const axis = chooseSplitAxis(width, height, constraints);

  if (axis === 'columns') {
    const [leftW, rightW] = splitLength(width, splitRatio, constraints.minWidth);
    layoutRect(groupA, x, y, leftW, height, groupAValue, constraints, out);
    layoutRect(groupB, x + leftW, y, rightW, height, groupBValue, constraints, out);
    return;
  }

  const [topH, bottomH] = splitLength(height, splitRatio, constraints.minHeight);
  layoutRect(groupA, x, y, width, topH, groupAValue, constraints, out);
  layoutRect(groupB, x, y + topH, width, bottomH, groupBValue, constraints, out);
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
  constraints: Required<TreemapConstraints>,
): TreemapRect[] {
  const maxCols = Math.max(1, Math.floor(width / constraints.minWidth));
  let cols = Math.min(Math.ceil(Math.sqrt(items.length)), maxCols);

  while (cols > 1) {
    const rows = Math.ceil(items.length / cols);
    if (height / rows >= constraints.minHeight) break;
    cols -= 1;
  }

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
  constraints?: TreemapConstraints,
): TreemapRect[] {
  if (items.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return [];
  }

  const normalizedConstraints = normalizeConstraints(constraints);

  // Sort descending by value so the largest items get the most square regions
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, it) => s + it.value, 0);

  const out: TreemapRect[] = [];

  if (totalValue === 0) {
    return equalGrid(
      sorted,
      0,
      0,
      containerWidth,
      containerHeight,
      normalizedConstraints,
    );
  }

  layoutRect(
    sorted,
    0,
    0,
    containerWidth,
    containerHeight,
    totalValue,
    normalizedConstraints,
    out,
  );
  return out;
}
