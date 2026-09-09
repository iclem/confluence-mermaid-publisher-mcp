// Minimal SVG geometry helpers: compute bounding boxes for the shape elements
// mermaid emits and sample edge paths into polylines. Used by the headless
// render shims (mermaid calls getBBox on the root group for the viewBox) and
// by geometry extraction for flowchart/state diagrams.

export interface SvgBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SvgPoint {
  x: number;
  y: number;
}

export type SvgPathSegment =
  | { type: "M"; to: SvgPoint }
  | { type: "L"; to: SvgPoint }
  | { type: "C"; c1: SvgPoint; c2: SvgPoint; to: SvgPoint }
  | { type: "A"; rx: number; ry: number; to: SvgPoint }
  | { type: "Z" };

const PATH_ARG_COUNT: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

const PATH_TOKEN_PATTERN = /[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** Parses an SVG path `d` attribute into absolute segments. S/Q/T curves are
 * converted to their control/end points (reflection control points resolved). */
export function parsePath(d: string): SvgPathSegment[] {
  const tokens = d.match(PATH_TOKEN_PATTERN) ?? [];
  const segments: SvgPathSegment[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevC2: SvgPoint | undefined;
  let prevQC: SvgPoint | undefined;
  let command = "";
  let index = 0;

  const readNumbers = (count: number): number[] | undefined => {
    if (index + count > tokens.length) {
      return undefined;
    }
    const values = tokens.slice(index, index + count).map(Number);
    index += count;
    return values.some((value) => Number.isNaN(value)) ? undefined : values;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      index += 1;
    }
    if (!command) {
      break;
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const argCount = PATH_ARG_COUNT[upper];
    if (argCount === undefined) {
      index += 1;
      continue;
    }
    if (upper === "Z") {
      segments.push({ type: "Z" });
      cx = startX;
      cy = startY;
      prevC2 = undefined;
      prevQC = undefined;
      continue;
    }
    const values = readNumbers(argCount);
    if (!values) {
      break;
    }
    const abs = (x: number, y: number): SvgPoint => (relative ? { x: cx + x, y: cy + y } : { x, y });

    if (upper === "H") {
      cx = relative ? cx + values[0] : values[0];
      segments.push({ type: "L", to: { x: cx, y: cy } });
      prevC2 = undefined;
      prevQC = undefined;
      continue;
    }
    if (upper === "V") {
      cy = relative ? cy + values[0] : values[0];
      segments.push({ type: "L", to: { x: cx, y: cy } });
      prevC2 = undefined;
      prevQC = undefined;
      continue;
    }
    if (upper === "A") {
      const to = abs(values[5], values[6]);
      segments.push({ type: "A", rx: Math.abs(values[0]), ry: Math.abs(values[1]), to });
      cx = to.x;
      cy = to.y;
      prevC2 = undefined;
      prevQC = undefined;
      continue;
    }
    if (upper === "C" || upper === "S") {
      const c1 = upper === "C" ? abs(values[0], values[1]) : prevC2
        ? { x: 2 * cx - prevC2.x, y: 2 * cy - prevC2.y }
        : { x: cx, y: cy };
      const c2 = upper === "C" ? abs(values[2], values[3]) : abs(values[0], values[1]);
      const to = upper === "C" ? abs(values[4], values[5]) : abs(values[2], values[3]);
      segments.push({ type: "C", c1, c2, to });
      cx = to.x;
      cy = to.y;
      prevC2 = c2;
      prevQC = undefined;
      continue;
    }
    if (upper === "Q" || upper === "T") {
      const c1 = upper === "Q" ? abs(values[0], values[1]) : prevQC
        ? { x: 2 * cx - prevQC.x, y: 2 * cy - prevQC.y }
        : { x: cx, y: cy };
      const to = upper === "Q" ? abs(values[2], values[3]) : abs(values[0], values[1]);
      // Approximate quadratic as cubic for uniform downstream handling
      const c2 = { x: to.x, y: to.y };
      segments.push({ type: "C", c1, c2, to });
      cx = to.x;
      cy = to.y;
      prevC2 = undefined;
      prevQC = c1;
      continue;
    }
    // M / L
    const to = abs(values[0], values[1]);
    if (upper === "M") {
      segments.push({ type: "M", to });
      startX = to.x;
      startY = to.y;
      // implicit lineto for subsequent coordinate pairs
      command = relative ? "l" : "L";
    } else {
      segments.push({ type: "L", to });
    }
    cx = to.x;
    cy = to.y;
    prevC2 = undefined;
    prevQC = undefined;
  }

  return segments;
}

export function unionBBoxes(boxes: Array<SvgBBox | undefined>): SvgBBox | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    if (!box) {
      continue;
    }
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (minX === Infinity) {
    return undefined;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function pathBBox(d: string): SvgBBox | undefined {
  const boxes: SvgBBox[] = [];
  let current: SvgPoint | undefined;
  for (const segment of parsePath(d)) {
    if (segment.type === "M" || segment.type === "L") {
      current = segment.to;
      boxes.push({ x: segment.to.x, y: segment.to.y, width: 0, height: 0 });
    } else if (segment.type === "C") {
      boxes.push({ x: segment.c1.x, y: segment.c1.y, width: 0, height: 0 });
      boxes.push({ x: segment.c2.x, y: segment.c2.y, width: 0, height: 0 });
      boxes.push({ x: segment.to.x, y: segment.to.y, width: 0, height: 0 });
      current = segment.to;
    } else if (segment.type === "A") {
      const from = current ?? segment.to;
      boxes.push({
        x: Math.min(from.x, segment.to.x) - segment.rx,
        y: Math.min(from.y, segment.to.y) - segment.ry,
        width: Math.abs(segment.to.x - from.x) + 2 * segment.rx,
        height: Math.abs(segment.to.y - from.y) + 2 * segment.ry,
      });
      current = segment.to;
    }
  }
  return unionBBoxes(boxes);
}

/** Samples a path into a polyline; cubic segments are approximated with a
 * fixed number of steps. Nearly-collinear points are dropped. */
export function samplePath(d: string, curveSteps = 4, collinearTolerance = 1.5): SvgPoint[] {
  const points: SvgPoint[] = [];
  let current: SvgPoint | undefined;
  let start: SvgPoint | undefined;

  const push = (point: SvgPoint): void => {
    points.push({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 });
  };

  for (const segment of parsePath(d)) {
    if (segment.type === "M") {
      push(segment.to);
      current = segment.to;
      start = segment.to;
      continue;
    }
    if (!current) {
      continue;
    }
    if (segment.type === "L") {
      push(segment.to);
      current = segment.to;
      continue;
    }
    if (segment.type === "Z") {
      if (start) {
        push(start);
      }
      continue;
    }
    if (segment.type === "A") {
      // Approximate arcs with their midpoint and endpoint
      push({ x: (current.x + segment.to.x) / 2, y: (current.y + segment.to.y) / 2 - segment.ry / 2 });
      push(segment.to);
      current = segment.to;
      continue;
    }
    const { c1, c2, to } = segment;
    for (let step = 1; step <= curveSteps; step += 1) {
      const t = step / curveSteps;
      const mt = 1 - t;
      push({
        x: mt * mt * mt * current.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * to.x,
        y: mt * mt * mt * current.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * to.y,
      });
    }
    current = to;
  }

  // Drop nearly-collinear interior points
  const simplified: SvgPoint[] = [];
  for (const point of points) {
    const count = simplified.length;
    if (count >= 2) {
      const prev = simplified[count - 1];
      const before = simplified[count - 2];
      const dx = prev.x - before.x;
      const dy = prev.y - before.y;
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        const distance = Math.abs((point.x - before.x) * dy - (point.y - before.y) * dx) / length;
        const along = (point.x - before.x) * dx + (point.y - before.y) * dy;
        if (distance < collinearTolerance && along >= 0 && along <= length * length) {
          simplified[count - 1] = point;
          continue;
        }
      }
    }
    simplified.push(point);
  }
  return simplified;
}

function parseTranslate(transform: string | null): SvgPoint {  if (!transform) {
    return { x: 0, y: 0 };
  }
  const match = /translate\(\s*(-?[\d.]+)(?:[ ,]\s*(-?[\d.]+))?\s*\)/.exec(transform);
  if (!match) {
    return { x: 0, y: 0 };
  }
  return { x: Number(match[1]), y: Number(match[2] ?? 0) };
}

function attr(el: Element, name: string): number {
  return Number(el.getAttribute(name) ?? 0);
}

/** Sums translate transforms from the element's ancestors up to the document
 * root (composite/cluster diagrams nest content under translated groups). */
export function ancestorOffset(el: Element): SvgPoint {
  let x = 0;
  let y = 0;
  let current = el.parentElement;
  while (current) {
    const offset = parseTranslate(current.getAttribute("transform"));
    x += offset.x;
    y += offset.y;
    current = current.parentElement;
  }
  return { x, y };
}

export type ElementTextMeasure = (el: Element) => SvgBBox | undefined;

/** Computes the bounding box of an SVG element (and its children), applying
 * translate transforms. Text elements are measured via the optional callback. */
export function elementBBox(el: Element, measureText?: ElementTextMeasure): SvgBBox | undefined {
  const tag = el.tagName.toLowerCase();
  const translate = parseTranslate(el.getAttribute("transform"));
  let own: SvgBBox | undefined;

  if (tag === "rect") {
    own = { x: attr(el, "x"), y: attr(el, "y"), width: attr(el, "width"), height: attr(el, "height") };
  } else if (tag === "circle") {
    const r = attr(el, "r");
    own = { x: attr(el, "cx") - r, y: attr(el, "cy") - r, width: 2 * r, height: 2 * r };
  } else if (tag === "ellipse") {
    const rx = attr(el, "rx");
    const ry = attr(el, "ry");
    own = { x: attr(el, "cx") - rx, y: attr(el, "cy") - ry, width: 2 * rx, height: 2 * ry };
  } else if (tag === "line") {
    const x1 = attr(el, "x1");
    const y1 = attr(el, "y1");
    const x2 = attr(el, "x2");
    const y2 = attr(el, "y2");
    own = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  } else if (tag === "polygon" || tag === "polyline") {
    const numbers = (el.getAttribute("points") ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const points: SvgBBox[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      points.push({ x: numbers[i], y: numbers[i + 1], width: 0, height: 0 });
    }
    own = unionBBoxes(points);
  } else if (tag === "path") {
    own = pathBBox(el.getAttribute("d") ?? "");
  } else if ((tag === "text" || tag === "tspan") && measureText) {
    own = measureText(el);
  }

  if (own) {
    own = { ...own, x: own.x + translate.x, y: own.y + translate.y };
  }

  const childBoxes: Array<SvgBBox | undefined> = [own];
  for (const child of Array.from(el.children)) {
    const childBox = elementBBox(child, measureText);
    if (childBox) {
      childBoxes.push({ ...childBox, x: childBox.x + translate.x, y: childBox.y + translate.y });
    }
  }
  return unionBBoxes(childBoxes);
}
