#!/usr/bin/env python3
"""Compose Chrome Web Store screenshots from the raw captures.

The store wants exactly 1280x800. The captures are taken at 2x and cropped
rather than scaled to fit, so text stays pixel-sharp after the single
downsample at the end.

Layout: a caption band across the top, then the page being scanned on the left
with the results panel beside it — the same arrangement a user sees, which is
the point of the screenshot.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_W, OUT_H = 1280, 800
BAND_H = 76
SCALE = 2  # captures were taken at deviceScaleFactor: 2

BAND_BG = (15, 17, 21)
BAND_FG = (255, 255, 255)
BAND_SUB = (150, 162, 178)
SEAM = (208, 213, 219)

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "store" / "screenshots"

PANELS = [
    ("panel.png", "Every issue, with the WCAG criterion it comes from",
     "31 automated checks - contrast, labels, headings, ARIA, target size"),
    ("panel-footer.png", "Honest about what automation cannot tell you",
     "Findings it cannot decide are flagged for review, never guessed"),
]


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONT_DIR / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def compose(page: Image.Image, panel: Image.Image, title: str, subtitle: str) -> Image.Image:
    content_h = (OUT_H - BAND_H) * SCALE
    page_c = page.crop((0, 0, page.width, min(content_h, page.height)))
    panel_c = panel.crop((0, 0, panel.width, min(content_h, panel.height)))

    strip = Image.new("RGB", (page_c.width + panel_c.width, content_h), (255, 255, 255))
    strip.paste(page_c, (0, 0))
    strip.paste(panel_c, (page_c.width, 0))

    # Seam between the page and the panel, so the two read as separate surfaces.
    seam = ImageDraw.Draw(strip)
    seam.rectangle(
        [page_c.width - SCALE, 0, page_c.width - 1, content_h],
        fill=SEAM,
    )

    strip = strip.resize((OUT_W, OUT_H - BAND_H), Image.LANCZOS)

    canvas = Image.new("RGB", (OUT_W, OUT_H), BAND_BG)
    canvas.paste(strip, (0, BAND_H))

    draw = ImageDraw.Draw(canvas)
    draw.text((40, 18), title, font=load_font("DejaVuSans-Bold.ttf", 22), fill=BAND_FG)
    draw.text((40, 47), subtitle, font=load_font("DejaVuSans.ttf", 14), fill=BAND_SUB)

    return canvas


def main() -> None:
    page = Image.open(SHOTS / "page.png").convert("RGB")

    for index, (source, title, subtitle) in enumerate(PANELS, start=1):
        panel = Image.open(SHOTS / source).convert("RGB")
        out = SHOTS / f"store-{index}.png"
        compose(page, panel, title, subtitle).save(out, optimize=True)
        size_kb = out.stat().st_size / 1024
        print(f"{out.name}  {out_size(out)}  {size_kb:.0f} KB")


def out_size(path: Path) -> str:
    with Image.open(path) as image:
        return f"{image.width}x{image.height}"


if __name__ == "__main__":
    main()
