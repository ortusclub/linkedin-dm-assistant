"""Render the Ortus Club DM Assistant toolbar icon at 16/32/48/128 px.

Same Editorial Luxury system as QuickConnect — italic Newsreader glyph on a
near-black rounded square with a gold pip on the larger sizes — but with a
'D' instead of 'O' so the two extensions are visually distinguishable in the
Chrome toolbar."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FONT = HERE / "Newsreader-Italic.ttf"
GLYPH = "D"

INK = (22, 20, 15, 255)        # #16140F
PAPER = (253, 251, 247, 255)   # #FDFBF7
GOLD = (201, 144, 70, 255)     # #C99046

# size: (canvas px, corner radius px, font size px, pip radius px (0 = omit))
SIZES = {
    16:  (16,  3,  12, 0),
    32:  (32,  6,  24, 0),
    48:  (48,  9,  36, 4),
    128: (128, 22, 88, 6),
}

def render(size_px, radius, font_size, pip_r):
    img = Image.new("RGBA", (size_px, size_px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, size_px, size_px), radius=radius, fill=INK)

    font = ImageFont.truetype(str(FONT), font_size)
    bbox = draw.textbbox((0, 0), GLYPH, font=font)
    glyph_w = bbox[2] - bbox[0]
    glyph_h = bbox[3] - bbox[1]
    x = (size_px - glyph_w) / 2 - bbox[0]
    y = (size_px - glyph_h) / 2 - bbox[1] - max(1, size_px * 0.04)
    draw.text((x, y), GLYPH, fill=PAPER, font=font)

    if pip_r > 0:
        cx = size_px - pip_r - max(2, size_px * 0.08)
        cy = size_px - pip_r - max(2, size_px * 0.08)
        draw.ellipse((cx - pip_r, cy - pip_r, cx + pip_r, cy + pip_r), fill=GOLD)
    return img

def main():
    for n, (size_px, radius, font_size, pip_r) in SIZES.items():
        img = render(size_px, radius, font_size, pip_r)
        out = ROOT / f"ortus-club-dm-{n}.png"
        img.save(out, "PNG", optimize=True)
        print(f"wrote {out} ({size_px}x{size_px})")

if __name__ == "__main__":
    main()
