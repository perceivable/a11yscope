#!/usr/bin/env python3
"""Generate the account profile photo.

Different constraints from the extension icon, so it gets its own file rather
than a resize:

  · It is cropped to a circle, so nothing may sit in the corners — the
    magnifier handle has to be pulled in from where it lives on the toolbar
    icon.
  · It renders at about 32px in an email client, next to replies to bug
    reports. It has to survive that, which means solid ground and high
    contrast rather than the dark gradient the promo tiles use.

So: brand blue ground, white reticle, the same pink centre as the on-page
highlight. Legible at 32px, still correct at 512.
"""

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 512
SUPERSAMPLE = 2

GROUND = (18, 72, 158, 255)   # #12489e — the product's accent
MARK = (255, 255, 255, 255)
DOT = (233, 78, 133, 255)     # the highlight pink


def draw_avatar() -> Image.Image:
    canvas = SIZE * SUPERSAMPLE
    image = Image.new("RGBA", (canvas, canvas), GROUND)
    draw = ImageDraw.Draw(image)

    unit = canvas / 32.0
    # Everything is pulled toward the middle: a circular crop removes the
    # corners, and the handle is the first thing to go.
    cx, cy = canvas * 0.455, canvas * 0.455
    ring_r = unit * 8.2
    stroke = unit * 2.1

    draw.ellipse(
        (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
        outline=MARK,
        width=int(stroke),
    )

    dot_r = unit * 3.1
    draw.ellipse((cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=DOT)

    # Handle at the conventional 45 degrees, stopped well short of the corner.
    start = ring_r + stroke * 0.3
    end = ring_r * 1.92
    offset = start / (2 ** 0.5)
    tip = end / (2 ** 0.5)
    draw.line(
        [(cx + offset, cy + offset), (cx + tip, cy + tip)],
        fill=MARK,
        width=int(stroke * 1.25),
    )
    cap = stroke * 0.62
    draw.ellipse((cx + tip - cap, cy + tip - cap, cx + tip + cap, cy + tip + cap), fill=MARK)

    return image.resize((SIZE, SIZE), Image.LANCZOS)


def circle_preview(source: Image.Image) -> Image.Image:
    """What it looks like after the platform crops it. Checked, not assumed."""
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, source.width - 1, source.height - 1), fill=255)
    out = Image.new("RGBA", source.size, (0, 0, 0, 0))
    out.paste(source, (0, 0), mask)
    return out


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "store" / "screenshots"
    out_dir.mkdir(parents=True, exist_ok=True)

    avatar = draw_avatar()
    path = out_dir / "avatar.png"
    avatar.save(path, optimize=True)
    print(f"{path.name}  {avatar.width}x{avatar.height}  {path.stat().st_size / 1024:.0f} KB")

    preview = circle_preview(avatar)
    preview_path = out_dir / "avatar-circle-preview.png"
    preview.save(preview_path, optimize=True)
    print(f"{preview_path.name}  (원형 크롭 확인용)")

    small = avatar.resize((32, 32), Image.LANCZOS).resize((128, 128), Image.NEAREST)
    small_path = out_dir / "avatar-32px-check.png"
    small.save(small_path, optimize=True)
    print(f"{small_path.name}  (32px 축소 후 확대 — 이메일에서 보일 크기)")


if __name__ == "__main__":
    main()
