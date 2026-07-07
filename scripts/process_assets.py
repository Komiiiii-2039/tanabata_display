#!/usr/bin/env python3
"""Generate transparent-PNG game assets from AI-generated JPEGs.

- Magenta-keyed bamboo, white-keyed tanzaku/decorations (flood fill from
  the border so interior whites survive), distance-keyed glowing lantern.
- Crops each result to its content bounding box.
- Copies sky/sparkle/video assets to clean names.
"""
import shutil
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / "public" / "assets"
RAW = Path(__file__).resolve().parent.parent / "raw_assets"


def flood_mask(img, is_bg):
    """255 = keep, 0 = background reachable from the border."""
    w, h = img.size
    px = img.load()
    mask = bytearray([255]) * (w * h)
    q = deque()

    def try_seed(x, y):
        if is_bg(px[x, y]):
            q.append((x, y))
            mask[y * w + x] = 0

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx] == 255:
                if is_bg(px[nx, ny]):
                    mask[ny * w + nx] = 0
                    q.append((nx, ny))
    return Image.frombytes("L", (w, h), bytes(mask))


def feather(mask):
    """Pull the mask in 1px, then soften, to avoid halo fringes."""
    return mask.filter(ImageFilter.MinFilter(3)).filter(
        ImageFilter.GaussianBlur(1.0)
    )


def crop_to_content(img, margin=6):
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    return img.crop((
        max(0, l - margin), max(0, t - margin),
        min(img.width, r + margin), min(img.height, b + margin),
    ))


def key_white(src, dst):
    img = Image.open(src).convert("RGB")

    def is_bg(p):
        r, g, b = p
        return min(r, g, b) > 175 and max(r, g, b) - min(r, g, b) < 30

    alpha = feather(flood_mask(img, is_bg))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    out = crop_to_content(out)
    out.save(dst, optimize=True)
    print(f"{dst.name}: {out.size}")


def key_magenta(src, dst):
    """Bamboo. Two problems, two stages:

    1. Dense leaves enclose pockets of magenta a border flood fill can't
       reach -> key globally on "magenta-ness" (how far both R and B rise
       above G — never true for the green/olive foliage) and un-mix the
       background color out of semi-transparent pixels.
    2. The source art paints a soft green wash *around* the bamboo which
       survives magenta keying and reads as fog on a starry sky -> fade
       alpha out with distance from pixels that are definitely bamboo
       (dark outlines / saturated greens), trimming the distant wash.
    """
    img = Image.open(src).convert("RGB")
    br, bg_, bb = img.getpixel((4, 4))
    w, h = img.size
    data = list(img.getdata())

    alphas = [0.0] * (w * h)
    colors = [(0, 0, 0)] * (w * h)
    for i, (r, g, b) in enumerate(data):
        # Pure bg scores high, foliage negative, contaminated leaf-edge
        # blends land in between and become semi-transparent + un-mixed.
        score = ((r - g) + (b - g)) / 2
        a = 1.0 - max(0.0, min(1.0, (score - 8) / 37))
        alphas[i] = a
        if a > 0.02:
            # p = a*F + (1-a)*B  ->  F = (p - (1-a)*B) / a
            k = 1.0 - a
            colors[i] = tuple(
                max(0, min(255, round((c - k * bc) / a)))
                for c, bc in ((r, br), (g, bg_), (b, bb))
            )

    # Multi-source BFS distance from "definitely bamboo" pixels.
    INF = 10 ** 9
    dist = [INF] * (w * h)
    q = deque()
    for i, (r, g, b) in enumerate(data):
        lum = 0.3 * r + 0.6 * g + 0.1 * b
        if alphas[i] > 0.6 and (lum < 95 or (g - r > 22 and g - b > 22 and g > 85)):
            dist[i] = 0
            q.append(i)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if dist[j] > dist[i] + 1:
                    dist[j] = dist[i] + 1
                    q.append(j)

    FADE_START, FADE_END = 9, 20
    out_px = []
    avals = []
    for i in range(w * h):
        fade = 1.0 - max(0.0, min(1.0, (dist[i] - FADE_START) / (FADE_END - FADE_START)))
        a = alphas[i] * fade
        if a <= 0.02:
            out_px.append((0, 0, 0, 0))
            avals.append(0)
        else:
            out_px.append((*colors[i], 255))
            avals.append(round(a * 255))
    out = Image.new("RGBA", img.size)
    out.putdata(out_px)
    alpha = Image.new("L", img.size)
    alpha.putdata(avals)
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.6)))
    out = crop_to_content(out)
    out.save(dst, optimize=True)
    print(f"{dst.name}: {out.size}")


def key_dark_glow(src, dst):
    """Lantern: graded flood fill so the glow fades out smoothly while the
    dark ink strokes inside the lantern stay opaque."""
    img = Image.open(src).convert("RGB")
    bg = img.getpixel((4, 4))

    def dist(p):
        return sum((a - b) ** 2 for a, b in zip(p, bg)) ** 0.5

    def is_bg(p):
        return dist(p) < 130

    mask = flood_mask(img, is_bg)
    px = img.load()
    m = mask.load()
    for y in range(img.height):
        for x in range(img.width):
            if m[x, y] == 0:
                m[x, y] = int(max(0.0, min(1.0, (dist(px[x, y]) - 15) / 115)) * 255)
    out = img.convert("RGBA")
    out.putalpha(mask.filter(ImageFilter.GaussianBlur(0.8)))
    out = crop_to_content(out)
    out.save(dst, optimize=True)
    print(f"{dst.name}: {out.size}")


def key_translucent_white(src, dst):
    """Amikazari: tissue paper — alpha from distance to white, so the net
    stays naturally translucent."""
    img = Image.open(src).convert("RGB")

    def alpha_of(p):
        r, g, b = p
        d = ((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2) ** 0.5
        return int(max(0.0, min(1.0, (d - 12) / 110)) * 255)

    alpha = Image.new("L", img.size)
    alpha.putdata([alpha_of(p) for p in img.getdata()])
    out = img.convert("RGBA")
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.6)))
    out = crop_to_content(out)
    out.save(dst, optimize=True)
    print(f"{dst.name}: {out.size}")


def main():
    # Raw generated files live in raw_assets/ once they've been parked
    # there; fall back to public/assets/ on the first run.
    src = {p.name: p for p in ASSETS.iterdir()}
    if RAW.is_dir():
        src.update({p.name: p for p in RAW.iterdir()})

    def find(prefix):
        return next(p for n, p in src.items() if n.startswith(prefix))

    key_magenta(find("Green_bamboo"), ASSETS / "bamboo.png")
    for color in ("Red", "Blue", "Green", "Yellow", "Orange"):
        key_white(find(f"{color}_tanzaku"), ASSETS / f"tanzaku_{color.lower()}.png")
    key_white(find("Tanabata_streamer"), ASSETS / "fukinagashi.png")
    key_white(find("Origami_paper_crane"), ASSETS / "crane.png")
    key_translucent_white(find("Tanabata_amikazari"), ASSETS / "amikazari.png")
    key_dark_glow(find("Japanese_paper_lantern"), ASSETS / "lantern.png")

    # Sparkle stays a JPEG (composited with mix-blend-mode: screen);
    # crop to a centered square around the star.
    sparkle = Image.open(find("Four-pointed_sparkle"))
    s = min(sparkle.size)
    x0 = (sparkle.width - s) // 2
    y0 = (sparkle.height - s) // 2
    sparkle.crop((x0, y0, x0 + s, y0 + s)).resize((512, 512)).save(
        ASSETS / "sparkle.jpg", quality=88
    )
    print("sparkle.jpg: (512, 512)")

    shutil.copy(find("Summer_night_sky"), ASSETS / "sky.jpg")
    shutil.copy(find("Milky_Way"), ASSETS / "milkyway.mp4")
    shutil.copy(find("Shooting_star"), ASSETS / "shooting_star.mp4")

    # Park the raw generated files outside public/ so they aren't deployed.
    RAW.mkdir(exist_ok=True)
    for name, p in src.items():
        if p.parent == ASSETS and (name[0].isupper() or name == "background.png"):
            shutil.move(str(p), RAW / name)
    print(f"raw files moved to {RAW}")


if __name__ == "__main__":
    main()
