"""web/public/favicon.svg 와 같은 도형을 Pillow 로 그려 PNG·ICO 아이콘을 만든다.

    python3 scripts/make_icons.py        # Pillow 필요 (pip install pillow)

디자인을 바꾸면 favicon.svg 와 이 파일의 도형 값을 함께 고친다.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "public"
SS = 4  # 슈퍼샘플링 배율(가장자리를 부드럽게)
C1, C2 = (79, 141, 255), (29, 78, 216)


def gradient(size: int) -> Image.Image:
    """viewBox 32 기준 (4,2)->(28,30) 대각 그라데이션."""
    s = size / 32
    x1, y1, x2, y2 = 4 * s, 2 * s, 28 * s, 30 * s
    dx, dy = x2 - x1, y2 - y1
    denom = dx * dx + dy * dy
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / denom))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(C1, C2))
    return img


def render(size: int, rounded: bool = True) -> Image.Image:
    big = size * SS
    s = big / 32
    bg = gradient(big)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=9 * s if rounded else 0, fill=255)
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    canvas.paste(bg, (0, 0), mask)

    shadow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([(16 - 9.2) * s, (16.8 - 9.2) * s, (16 + 9.2) * s, (16.8 + 9.2) * s], fill=(11, 42, 143, 46))
    canvas = Image.alpha_composite(canvas, shadow)

    d = ImageDraw.Draw(canvas)
    d.ellipse([(16 - 9.2) * s, (16 - 9.2) * s, (16 + 9.2) * s, (16 + 9.2) * s], fill=(255, 255, 255, 255))
    pts = [(11.8 * s, 16.4 * s), (14.8 * s, 19.4 * s), (20.4 * s, 13.0 * s)]
    w = round(2.8 * s)
    d.line(pts, fill=C2 + (255,), width=w, joint="curve")
    for x, y in (pts[0], pts[-1]):  # 둥근 끝처리
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=C2 + (255,))
    d.ellipse([(24.6 - 2.2) * s, (7.4 - 2.2) * s, (24.6 + 2.2) * s, (7.4 + 2.2) * s], fill=(251, 191, 36, 255))
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    for name, size, rounded in [
        ("icon-512.png", 512, True),
        ("icon-192.png", 192, True),
        ("apple-touch-icon.png", 180, False),  # iOS 가 직접 모서리를 둥글게 처리
        ("favicon-32.png", 32, True),
    ]:
        render(size, rounded).save(OUT / name, optimize=True)
    ico = [render(s) for s in (16, 32, 48)]
    ico[-1].save(OUT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:-1])
    print("완료:", ", ".join(sorted(p.name for p in OUT.glob("*") if p.suffix in {".png", ".ico", ".svg"})))


if __name__ == "__main__":
    main()
