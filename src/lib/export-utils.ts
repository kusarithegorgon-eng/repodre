import { toPng } from "html-to-image";

const PIXEL_RATIO = 3;

/**
 * Export a DOM element (the canvas viewport) as a high-resolution PNG.
 * Detects the current theme background color from CSS variables.
 * Wraps in try/catch and shows loading state via callback.
 */
export async function exportCanvasAsImage(
  element: HTMLElement,
  filename: string,
  onLoading?: (loading: boolean) => void,
): Promise<void> {
  onLoading?.(true);
  try {
    // Detect theme background from CSS variable
    const styles = getComputedStyle(document.documentElement);
    const bgColor = styles.getPropertyValue("--bg").trim() ||
      styles.getPropertyValue("--background").trim() ||
      styles.getPropertyValue("--surface").trim() ||
      "#ffffff";

    // Remove selection indicators for clean capture
    const selectionEls = element.querySelectorAll("[data-selection-box], [data-hover-indicator]");
    const hiddenEls: { el: HTMLElement; prev: string }[] = [];
    selectionEls.forEach((node) => {
      const h = node as HTMLElement;
      hiddenEls.push({ el: h, prev: h.style.opacity });
      h.style.opacity = "0";
    });

    const dataUrl = await toPng(element, {
      backgroundColor: bgColor,
      pixelRatio: PIXEL_RATIO,
      cacheBust: true,
      filter: (node) => {
        // Skip elements marked as no-export
        if (node instanceof HTMLElement && node.dataset.noExport === "true") return false;
        return true;
      },
    });

    // Restore visibility
    hiddenEls.forEach(({ el, prev }) => { el.style.opacity = prev; });

    // Trigger download
    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error("Canvas export failed:", err);
    throw new Error(
      err instanceof Error && err.message.includes("large")
        ? "Canvas is too large to export. Try zooming out first."
        : "Failed to export canvas as image. Please try again."
    );
  } finally {
    onLoading?.(false);
  }
}
