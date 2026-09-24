#!/usr/bin/env python3
"""Generate the extension's PNG icons.

Drawn in code rather than shipped as binaries so the mark can be adjusted
without a design tool, and so nothing opaque ends up in the repository.

The mark: a magnifier whose lens is a scope reticle — concentric ring, iris and
centre dot. It stays legible at 16px, where a more literal eye turns to mush.
"""

from PIL import Image, ImageDraw

# Rendered at 8x then downsampled, which is cheaper than antialiasing by hand.
SUPERSAMPLE = 8
SIZES = (16, 32, 48, 128)

INK = (26, 86, 196, 255)       # matches --accent in the panel
INK_DEEP = (14, 52, 124, 255)
EYE = (255, 255, 255, 255)
PUPIL = (216, 27, 96, 255)     # matches the highlight colour


def draw_icon(size: int) -> Image.Image:
    canvas = size * SUPERSAMPLE
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    unit = canvas / 32.0

    # Lens ring.
    ring_box = (unit * 3.0, unit * 3.0, unit * 23.0, unit * 23.0)
    draw.ellipse(ring_box, fill=EYE, outline=INK, width=int(unit * 3.0))

    # Iris ring.
    iris_box = (unit * 9.6, unit * 9.2, unit * 16.8, unit * 16.4)
    draw.ellipse(iris_box, fill=INK)

    # Centre dot, in the same pink used to highlight findings on the page.
    pupil_box = (unit * 11.4, unit * 11.0, unit * 15.0, unit * 14.6)
    draw.ellipse(pupil_box, fill=PUPIL)

    # Handle, thick enough to survive the 16px downsample.
    draw.line(
        [(unit * 20.6, unit * 20.6), (unit * 28.4, unit * 28.4)],
        fill=INK_DEEP,
        width=int(unit * 4.2),
    )
    draw.ellipse(
        (unit * 26.4, unit * 26.4, unit * 30.2, unit * 30.2),
        fill=INK_DEEP,
    )

    return image.resize((size, size), Image.LANCZOS)


def store_icon() -> Image.Image:
    """The Chrome Web Store listing icon.

    Same mark, different framing. The store requires a 128x128 PNG whose
    artwork occupies the central 96x96 with 16px of transparent padding on
    every side — uploading a full-bleed 128x128 is rejected. The toolbar icons
    keep the full canvas, because at 16px every pixel of the mark is needed.
    """
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.paste(draw_icon(96), (16, 16))
    return canvas


def main() -> None:
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    out_dir = root / "icons"
    out_dir.mkdir(exist_ok=True)
    for size in SIZES:
        path = out_dir / f"icon{size}.png"
        draw_icon(size).save(path, optimize=True)
        print(f"{path.name}  {path.stat().st_size:>5} bytes")

    store_dir = root / "store" / "screenshots"
    store_dir.mkdir(parents=True, exist_ok=True)
    store_path = store_dir / "store-icon.png"
    store_icon().save(store_path, optimize=True)
    print(f"{store_path.name}  {store_path.stat().st_size:>5} bytes  (96x96 artwork, 16px padding)")


if __name__ == "__main__":
    main()
