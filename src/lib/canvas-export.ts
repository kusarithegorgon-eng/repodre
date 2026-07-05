/**
 * canvas-export — High-resolution visual export of the App Journey canvas.
 *
 * The canvas is a hybrid of HTML nodes (absolutely-positioned divs) and an SVG
 * edge layer. To produce a faithful raster/vector export we:
 *   1. Measure the bounding box of all rendered content.
 *   2. Build a standalone SVG that embeds the edge layer plus foreignObject
 *      snapshots of each node's HTML.
 *   3. For PNG: draw the SVG onto a <canvas> at the requested scale and
 *      trigger a download.
 *   4. For SVG: serialize the standalone SVG and download it directly.
 *
 * CSS custom properties (var(--…)) are resolved to computed values so the
 * exported image matches what the user sees on screen.
 */

export type ExportFormat = "png" | "svg";

export interface ExportOptions {
  /** Pixel scale multiplier (2 = 2x density). */
  scale?: number;
  /** Filename without extension. */
  filename?: string;
  /** Background color. Defaults to white. */
  background?: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function resolveVar(value: string, element: HTMLElement): string {
  if (!value || !value.includes("var(")) return value;
  // Resolve var(--x) → computed value via a temporary probe element
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;`;
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  // If the var resolved to a color, use it; otherwise return original
  return resolved && resolved !== "rgba(0, 0, 0, 0)" ? resolved : value;
}

function inlineComputedStyles(element: HTMLElement): string {
  const computed = getComputedStyle(element);
  const styleProps = [
    "position", "left", "top", "width", "height",
    "background", "background-color", "border", "border-color", "border-radius",
    "color", "font-size", "font-weight", "font-family", "text-align",
    "padding", "margin", "display", "flex-direction", "align-items",
    "justify-content", "gap", "box-sizing", "opacity", "transform",
    "box-shadow", "clip-path",
  ];
  return styleProps
    .map((prop) => `${prop}: ${computed.getPropertyValue(prop)};`)
    .join("");
}

function serializeNode(node: HTMLElement, offsetX: number, offsetY: number): string {
  const rect = node.getBoundingClientRect();
  const x = rect.left - offsetX;
  const y = rect.top - offsetY;
  const w = rect.width;
  const h = rect.height;

  // Clone the node and inline its computed styles
  const clone = node.cloneNode(true) as HTMLElement;
  clone.setAttribute("style", inlineComputedStyles(node));
  clone.style.position = "static";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.margin = "0";

  // Wrap in a foreignObject positioned at the node's coordinates
  const fo = document.createElementNS(SVG_NS, "foreignObject");
  fo.setAttribute("x", String(x));
  fo.setAttribute("y", String(y));
  fo.setAttribute("width", String(w));
  fo.setAttribute("height", String(h));
  fo.appendChild(clone);

  return new XMLSerializer().serializeToString(fo);
}

function serializeSvgLayer(svg: SVGSVGElement, offsetX: number, offsetY: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Make the clone cover the full canvas coordinate space
  clone.setAttribute("x", "0");
  clone.setAttribute("y", "0");
  clone.removeAttribute("viewBox");
  clone.style.position = "absolute";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.overflow = "visible";

  // Shift all path data by the offset so coordinates are relative to the bbox
  clone.querySelectorAll("path, line, rect, circle, ellipse, polygon, polyline, text, g").forEach((el) => {
    const transform = el.getAttribute("transform");
    el.setAttribute(
      "transform",
      `translate(${-offsetX}, ${-offsetY})${transform ? " " + transform : ""}`
    );
  });

  return new XMLSerializer().serializeToString(clone);
}

function computeBoundingBox(
  canvasContainer: HTMLElement
): { x: number; y: number; width: number; height: number } {
  const containerRect = canvasContainer.getBoundingClientRect();

  // The inner transformed div is the first child
  const inner = canvasContainer.querySelector(":scope > div") as HTMLElement | null;
  if (!inner) {
    return { x: 0, y: 0, width: containerRect.width, height: containerRect.height };
  }

  // Collect all node elements (direct children of the inner div that are positioned)
  const nodeEls = Array.from(inner.querySelectorAll<HTMLElement>("[style*='position: absolute']"));
  const svgEl = inner.querySelector("svg");

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Account for nodes
  for (const el of nodeEls) {
    const r = el.getBoundingClientRect();
    const left = r.left - containerRect.left;
    const top = r.top - containerRect.top;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + r.width);
    maxY = Math.max(maxY, top + r.height);
  }

  // Account for SVG edge paths
  if (svgEl) {
    const paths = svgEl.querySelectorAll("path, line, rect, circle, ellipse, polygon, polyline");
    paths.forEach((p) => {
      try {
        const bbox = (p as SVGGraphicsElement).getBBox();
        const svgRect = svgEl.getBoundingClientRect();
        const left = svgRect.left - containerRect.left + bbox.x;
        const top = svgRect.top - containerRect.top + bbox.y;
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + bbox.width);
        maxY = Math.max(maxY, top + bbox.height);
      } catch {
        // getBBox can fail for non-rendered elements
      }
    });
  }

  if (!isFinite(minX) || !isFinite(minY)) {
    return { x: 0, y: 0, width: containerRect.width, height: containerRect.height };
  }

  const padding = 40;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export async function exportCanvas(
  container: HTMLElement,
  format: ExportFormat,
  options: ExportOptions = {}
): Promise<void> {
  const scale = options.scale ?? 2;
  const filename = options.filename ?? `repodre-canvas-${Date.now()}`;
  const background = options.background ?? "#ffffff";

  const bbox = computeBoundingBox(container);
  const inner = container.querySelector(":scope > div") as HTMLElement | null;
  if (!inner) {
    throw new Error("Canvas content not found");
  }

  const svgEl = inner.querySelector("svg");
  const nodeEls = Array.from(inner.querySelectorAll<HTMLElement>("[style*='position: absolute']"));

  // Build the standalone SVG
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("width", String(bbox.width));
  svg.setAttribute("height", String(bbox.height));
  svg.setAttribute("viewBox", `0 0 ${bbox.width} ${bbox.height}`);

  // Background rect
  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(bbox.width));
  bg.setAttribute("height", String(bbox.height));
  bg.setAttribute("fill", background);
  svg.appendChild(bg);

  // Edge layer
  if (svgEl) {
    const edgeSvg = serializeSvgLayer(svgEl, bbox.x, bbox.y);
    const parser = new DOMParser();
    const doc = parser.parseFromString(edgeSvg, "image/svg+xml");
    const imported = svg.ownerDocument!.importNode(doc.documentElement, true);
    svg.appendChild(imported);
  }

  // Node layer (foreignObject for each node)
  for (const node of nodeEls) {
    const foStr = serializeNode(node, bbox.x, bbox.y);
    const parser = new DOMParser();
    const doc = parser.parseFromString(foStr, "image/svg+xml");
    const imported = svg.ownerDocument!.importNode(doc.documentElement, true);
    svg.appendChild(imported);
  }

  const svgString = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    if (format === "svg") {
      downloadBlob(svgBlob, `${filename}.svg`);
      return;
    }

    // PNG: render SVG onto canvas
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG for rasterization"));
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(bbox.width * scale);
    canvas.height = Math.ceil(bbox.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}.png`);
    }, "image/png");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
