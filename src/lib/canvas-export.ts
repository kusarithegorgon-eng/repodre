/**
 * canvas-export — High-resolution visual export of the App Journey canvas.
 *
 * The canvas is a hybrid of HTML nodes (absolutely-positioned divs) and an SVG
 * edge layer. To produce a faithful raster/vector export we:
 *   1. Compute the tight bounding box from node data model coordinates
 *      (NOT getBoundingClientRect, which is distorted by zoom/pan transforms).
 *   2. Build a standalone SVG with a correct viewBox matching that bbox.
 *   3. For PNG: draw the SVG onto a <canvas> at the requested scale and
 *      trigger a download.
 *   4. For SVG: serialize the standalone SVG and download it directly.
 *
 * CSS custom properties (var(--…)) are resolved to computed values so the
 * exported image matches what the user sees on screen.
 */

import { NODE_W, NODE_H } from "./canvas-geometry";

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

function serializeNode(
  nodeEl: HTMLElement,
  offsetX: number,
  offsetY: number
): string {
  // Read the node's canvas-space position from its data attributes or style
  const left = parseFloat(nodeEl.style.left || "0");
  const top = parseFloat(nodeEl.style.top || "0");
  const w = nodeEl.offsetWidth || NODE_W;
  const h = nodeEl.offsetHeight || NODE_H;

  // Position in bbox-local coordinates
  const x = left - offsetX;
  const y = top - offsetY;

  const clone = nodeEl.cloneNode(true) as HTMLElement;
  clone.setAttribute("style", inlineComputedStyles(nodeEl));
  clone.style.position = "static";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.margin = "0";
  clone.style.width = `${w}px`;
  clone.style.height = `${h}px`;

  const fo = document.createElementNS(SVG_NS, "foreignObject");
  fo.setAttribute("x", String(x));
  fo.setAttribute("y", String(y));
  fo.setAttribute("width", String(w));
  fo.setAttribute("height", String(h));
  fo.appendChild(clone);

  return new XMLSerializer().serializeToString(fo);
}

function serializeSvgLayer(
  svg: SVGSVGElement,
  offsetX: number,
  offsetY: number
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("viewBox");
  clone.setAttribute("x", "0");
  clone.setAttribute("y", "0");
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

export async function exportCanvas(
  container: HTMLElement,
  format: ExportFormat,
  options: ExportOptions = {}
): Promise<void> {
  const scale = options.scale ?? 2;
  const filename = options.filename ?? `repodre-canvas-${Date.now()}`;
  const background = options.background ?? "#ffffff";

  // The inner transformed div is the first child
  const inner = container.querySelector(":scope > div") as HTMLElement | null;
  if (!inner) {
    throw new Error("Canvas content not found");
  }

  const svgEl = inner.querySelector("svg");
  const nodeEls = Array.from(inner.querySelectorAll<HTMLElement>("[style*='position: absolute']"));

  // Build a list of canvas-space node positions from the DOM elements
  const nodePositions: { x: number; y: number; w: number; h: number }[] = [];
  for (const el of nodeEls) {
    const left = parseFloat(el.style.left || "0");
    const top = parseFloat(el.style.top || "0");
    const w = el.offsetWidth || NODE_W;
    const h = el.offsetHeight || NODE_H;
    nodePositions.push({ x: left, y: top, w, h });
  }

  // Compute bounding box from canvas-space coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const np of nodePositions) {
    minX = Math.min(minX, np.x);
    minY = Math.min(minY, np.y);
    maxX = Math.max(maxX, np.x + np.w);
    maxY = Math.max(maxY, np.y + np.h);
  }

  // Also account for SVG edge paths using getBBox (in SVG user space)
  if (svgEl) {
    const paths = svgEl.querySelectorAll("path, line, rect, circle, ellipse, polygon, polyline");
    paths.forEach((p) => {
      try {
        const bbox = (p as SVGGraphicsElement).getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
      } catch {
        // getBBox can fail for non-rendered elements
      }
    });
  }

  if (!isFinite(minX) || !isFinite(minY)) {
    minX = 0; minY = 0; maxX = 800; maxY = 600;
  }

  const padding = 48;
  const bboxX = minX - padding;
  const bboxY = minY - padding;
  const bboxW = maxX - minX + padding * 2;
  const bboxH = maxY - minY + padding * 2;

  // Build the standalone SVG with correct viewBox
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("width", String(bboxW));
  svg.setAttribute("height", String(bboxH));
  svg.setAttribute("viewBox", `0 0 ${bboxW} ${bboxH}`);

  // Background rect
  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", String(bboxW));
  bg.setAttribute("height", String(bboxH));
  bg.setAttribute("fill", background);
  svg.appendChild(bg);

  // Edge layer
  if (svgEl) {
    const edgeSvg = serializeSvgLayer(svgEl, bboxX, bboxY);
    const parser = new DOMParser();
    const doc = parser.parseFromString(edgeSvg, "image/svg+xml");
    const imported = svg.ownerDocument!.importNode(doc.documentElement, true);
    svg.appendChild(imported);
  }

  // Node layer (foreignObject for each node)
  for (let i = 0; i < nodeEls.length; i++) {
    const foStr = serializeNode(nodeEls[i], bboxX, bboxY);
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
    canvas.width = Math.ceil(bboxW * scale);
    canvas.height = Math.ceil(bboxH * scale);
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
