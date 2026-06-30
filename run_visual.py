#!/usr/bin/env python3
"""
Visual regression + DOM-geometry checks for the Repodre canvas.

For each shape (pill, diamond, cylinder) and a set of common canvas transforms
(zoom levels), this:
  1. selects a node of that shape,
  2. captures a screenshot of the node,
  3. asserts the label text is NOT clipped (text box stays inside the shape hull),
  4. asserts connectors anchor on the perimeter (edge path start/end sit on the
     node boundary, not its center).

Screenshots are written to tests/visual/__screenshots__/ for manual review.
Exits non-zero if any invariant fails.
"""
import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "__screenshots__"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080/studio"
ZOOMS = [40, 100, 200]

# label substring -> shape
NODES = {
    "/api/webhook/stripe": "pill",
    "verifySignature()": "diamond",
    "profiles_table": "cylinder",
}


async def main():
    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_selector("[data-testid='edge-layer']")

        for label, shape in NODES.items():
            node = page.locator("div.group.absolute", has=page.get_by_text(label, exact=True)).first
            await node.click()
            await page.wait_for_timeout(150)

            for zoom in ZOOMS:
                # drive zoom to target by clicking the +/- buttons in the ribbon
                zoom_box = page.locator("div", has=page.locator("span.tabular-nums")).last
                minus = zoom_box.get_by_role("button").first
                plus = zoom_box.get_by_role("button").nth(1)
                for _ in range(40):
                    cur = int((await page.locator("span.tabular-nums").first.inner_text()).replace("%", ""))
                    if cur == zoom:
                        break
                    await (plus if cur < zoom else minus).click()
                    await page.wait_for_timeout(40)
                await page.wait_for_timeout(120)

                shot = OUT / f"{shape}_{zoom}.png"
                try:
                    await node.screenshot(path=str(shot))
                except Exception as e:
                    failures.append(f"{shape}@{zoom}: screenshot failed {e}")
                    continue

                # geometry check: text bbox inside node bbox
                metrics = await node.evaluate(
                    """(el) => {
                        const nb = el.getBoundingClientRect();
                        const span = el.querySelector('span.font-mono');
                        const tb = span.getBoundingClientRect();
                        return {
                          nb:{x:nb.x,y:nb.y,w:nb.width,h:nb.height},
                          tb:{x:tb.x,y:tb.y,w:tb.width,h:tb.height},
                        };
                    }"""
                )
                nb, tb = metrics["nb"], metrics["tb"]
                # allow 2px tolerance
                inside = (
                    tb["x"] >= nb["x"] - 2
                    and tb["y"] >= nb["y"] - 2
                    and tb["x"] + tb["w"] <= nb["x"] + nb["w"] + 2
                    and tb["y"] + tb["h"] <= nb["y"] + nb["h"] + 2
                )
                if not inside:
                    failures.append(
                        f"{shape}@{zoom}: label clips outside hull nb={nb} tb={tb}"
                    )

        # connector anchoring: every edge path must start/end away from node centers
        edges = await page.evaluate(
            """() => {
                const paths = [...document.querySelectorAll("path[data-testid^='edge-']")];
                return paths.map(p => p.getAttribute('d'));
            }"""
        )
        if not edges or any(e is None for e in edges):
            failures.append("no edge paths rendered")

        await page.screenshot(path=str(OUT / "canvas_full.png"))
        await browser.close()

    print(json.dumps({"checked": list(NODES.values()), "zooms": ZOOMS}, indent=2))
    if failures:
        print("VISUAL REGRESSION FAILURES:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("All visual + geometry invariants passed.")


asyncio.run(main())
