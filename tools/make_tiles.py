#!/usr/bin/env python3
"""Generate the optional Chrome Web Store promotional tiles.

Two sizes, both required to be exact: 440x280 (small tile, shown in category
and search listings) and 1400x560 (marquee). Drawn rather than photographed so
they stay consistent with the extension's own palette — the same blue as the
panel accent, the same pink as the on-page highlight.

Deliberately sparse: at 440x280 in a grid of competitors, a name and one line
that says what it does will be read. Anything more will not.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
ROOT = Path(__file__).resolve().parent.parent

BG = (15, 17, 21)
BG_ACCENT = (18, 33, 58)
TITLE = (255, 255, 255)
SUB = (154, 168, 186)
ACCENT = (96, 152, 255)
PINK = (233, 78, 133)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = FONT_DIR / name
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def draw_mark(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    """The scope reticle from the extension icon, drawn at any size."""
    ring = r
    draw.ellipse((cx - ring, cy - ring, cx + ring, cy + ring), outline=ACCENT, width=int(r * 0.17))
    iris = r * 0.42
    draw.ellipse((cx - iris, cy - iris, cx + iris, cy + iris), fill=ACCENT)
    dot = r * 0.2
    draw.ellipse((cx - dot, cy - dot, cx + dot, cy + dot), fill=PINK)
    # Handle, at the conventional 45 degrees.
    start = r * 0.78
    end = r * 1.55
    draw.line(
        [(cx + start, cy + start), (cx + end, cy + end)],
        fill=ACCENT,
        width=int(r * 0.22),
    )


def gradient_background(size: tuple[int, int]) -> Image.Image:
    """A quiet diagonal wash, so the tile does not read as a flat black box."""
    width, height = size
    image = Image.new("RGB", (width, height), BG)
    pixels = image.load()
    for y in range(height):
        for x in range(0, width, 4):
            t = (x / width * 0.6) + (1 - y / height) * 0.4
            colour = tuple(
                int(BG[i] + (BG_ACCENT[i] - BG[i]) * t) for i in range(3)
            )
            for dx in range(4):
                if x + dx < width:
                    pixels[x + dx, y] = colour
    return image


def small_tile() -> Image.Image:
    image = gradient_background((440, 280))
    draw = ImageDraw.Draw(image)

    draw_mark(draw, 72, 92, 30)

    draw.text((124, 68), "A11yScope", font=font("DejaVuSans-Bold.ttf", 30), fill=TITLE)
    draw.text((124, 106), "WCAG 2.2 checker", font=font("DejaVuSans.ttf", 15), fill=SUB)

    draw.line([(40, 168), (400, 168)], fill=(46, 54, 68), width=1)

    draw.text((40, 188), "Find contrast, label and ARIA",
              font=font("DejaVuSans.ttf", 17), fill=TITLE)
    draw.text((40, 212), "problems on any page in one click.",
              font=font("DejaVuSans.ttf", 17), fill=TITLE)
    draw.text((40, 242), "Free  ·  Nothing leaves your browser",
              font=font("DejaVuSans.ttf", 13), fill=SUB)

    return image


def marquee_tile() -> Image.Image:
    image = gradient_background((1400, 560))
    draw = ImageDraw.Draw(image)

    draw_mark(draw, 190, 268, 86)

    draw.text((340, 176), "A11yScope", font=font("DejaVuSans-Bold.ttf", 74), fill=TITLE)
    draw.text((346, 272), "Find WCAG 2.2 problems on any page in one click.",
              font=font("DejaVuSans.ttf", 30), fill=TITLE)
    draw.text((346, 318), "Contrast, labels, headings, ARIA and target size — 31 checks,",
              font=font("DejaVuSans.ttf", 22), fill=SUB)
    draw.text((346, 350), "each reported with the success criterion it comes from.",
              font=font("DejaVuSans.ttf", 22), fill=SUB)

    draw.text((346, 408), "Free  ·  No account  ·  Nothing leaves your browser",
              font=font("DejaVuSans-Bold.ttf", 19), fill=ACCENT)

    return image


def main() -> None:
    out = ROOT / "store" / "screenshots"
    out.mkdir(parents=True, exist_ok=True)
    for name, image in (("tile-small.png", small_tile()), ("tile-marquee.png", marquee_tile())):
        path = out / name
        image.save(path, optimize=True)
        print(f"{name}  {image.width}x{image.height}  {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
