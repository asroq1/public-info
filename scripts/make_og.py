"""공유 미리보기(og:image) 이미지를 만든다. 카카오톡·슬랙·페이스북 등에서 링크를 붙일 때 보이는 이미지.

    /tmp/ogenv/bin/python scripts/make_og.py     # pillow, resvg-py 필요
    (python3 -m venv /tmp/ogenv && /tmp/ogenv/bin/pip install pillow resvg-py)

web/public/og/default.png 와 분야별 web/public/og/<slug>.png (1200x630) 를 만든다.
분야 아이콘·색·slug 는 web/src/fieldIcons.json 한 곳에서 읽는다.
글꼴은 macOS 의 Apple SD Gothic Neo 를 쓴다(이미지로 한 번 그려 저장하므로 글꼴 파일은 배포되지 않는다).
"""
import colorsys
import io
import json
from pathlib import Path

import resvg_py
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "og"
ICONS = json.loads((ROOT / "web" / "src" / "fieldIcons.json").read_text(encoding="utf-8"))
LOGO_SVG = (ROOT / "web" / "public" / "favicon.svg").read_text(encoding="utf-8")

W, H, S = 1200, 630, 2  # 2배로 그려서 줄이면 가장자리가 부드럽다
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
FACE = {"regular": 0, "medium": 2, "bold": 6}

INK, MUTED, BRAND, BRAND_SOFT, BG = (15, 23, 42), (100, 116, 139), (29, 78, 216), (232, 239, 254), (251, 252, 254)


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size * S, index=FACE[kind])


def hsl(h: float, s: float, l: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return round(r * 255), round(g * 255), round(b * 255)


def svg_png(svg: str, size: int) -> Image.Image:
    return Image.open(io.BytesIO(bytes(resvg_py.svg_to_bytes(svg_string=svg, width=size, height=size)))).convert("RGBA")


def icon_png(d: str, hue: int, size: int) -> Image.Image:
    r, g, b = hsl(hue, 62, 36)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="{d}" fill="none" '
           f'stroke="rgb({r},{g},{b})" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    return svg_png(svg, size)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_w: int) -> list[str]:
    """어절 단위로 줄바꿈한다."""
    lines, cur = [], ""
    for word in text.split(" "):
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_w * S or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + [cur]


def shadow(canvas: Image.Image, box, radius, color=(15, 23, 42, 60), blur=22, dy=14):
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(layer).rounded_rectangle([x0, y0 + dy * S, x1, y1 + dy * S], radius=radius, fill=color)
    return Image.alpha_composite(canvas, layer.filter(ImageFilter.GaussianBlur(blur * S)))


def render(title_lines: list[tuple[str, tuple]], sub: str, hue: int, icon: str | None, out: Path) -> None:
    canvas = Image.new("RGBA", (W * S, H * S), BG + (255,))
    d = ImageDraw.Draw(canvas)

    # 오른쪽 장식 패널
    px0, py0, px1, py1 = 724 * S, 72 * S, 1128 * S, 558 * S
    panel = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle([px0, py0, px1, py1], radius=52 * S, fill=hsl(hue, 100, 97) + (255,), outline=hsl(hue, 60, 90) + (255,), width=2 * S)
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([px0, py0, px1, py1], radius=52 * S, fill=255)
    deco = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(deco)
    dd.ellipse([(px1 - 190 * S), (py0 - 130 * S), (px1 + 150 * S), (py0 + 210 * S)], fill=hsl(hue, 90, 91) + (255,))
    dd.ellipse([(px0 - 150 * S), (py1 - 210 * S), (px0 + 190 * S), (py1 + 130 * S)], fill=hsl(hue, 90, 93) + (255,))
    clipped = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    clipped.paste(deco, (0, 0), mask)
    canvas = Image.alpha_composite(canvas, panel)
    canvas = Image.alpha_composite(canvas, clipped)

    # 패널 가운데 아이콘(분야) 또는 로고(기본)
    cx, cy = (px0 + px1) // 2, (py0 + py1) // 2
    if icon:
        box = (cx - 120 * S, cy - 120 * S, cx + 120 * S, cy + 120 * S)
        canvas = shadow(canvas, box, 60 * S, color=hsl(hue, 60, 40) + (70,))
        ImageDraw.Draw(canvas).rounded_rectangle(box, radius=60 * S, fill=(255, 255, 255, 255))
        ic = icon_png(icon, hue, 132 * S)
        canvas.alpha_composite(ic, (cx - 66 * S, cy - 66 * S))
    else:
        box = (cx - 120 * S, cy - 120 * S, cx + 120 * S, cy + 120 * S)
        canvas = shadow(canvas, box, 60 * S, color=(29, 78, 216, 90))
        canvas.alpha_composite(svg_png(LOGO_SVG, 240 * S), (cx - 120 * S, cy - 120 * S))

    d = ImageDraw.Draw(canvas)
    # 상단 브랜드
    canvas.alpha_composite(svg_png(LOGO_SVG, 52 * S), (72 * S, 62 * S))
    d.text((140 * S, 88 * S), "내 혜택 찾기", font=font("bold", 34), fill=INK, anchor="lm")

    # 제목
    y = 168 * S
    big = font("bold", 76)
    for text, color in title_lines:
        d.text((72 * S, y), text, font=big, fill=color, anchor="la")
        y += 98 * S

    # 설명(자동 줄바꿈)
    sub_font = font("regular", 30)
    y = max(y + 14 * S, 392 * S)
    for line in wrap(d, sub, sub_font, 590):
        d.text((72 * S, y), line, font=sub_font, fill=MUTED, anchor="la")
        y += 46 * S

    # 하단 배지
    label = "행정안전부 공공데이터 기반"
    chip_font = font("medium", 24)
    tw = d.textlength(label, font=chip_font)
    x0, y0 = 72 * S, 520 * S
    d.rounded_rectangle([x0, y0, x0 + tw + 44 * S, y0 + 52 * S], radius=26 * S, fill=BRAND_SOFT)
    d.text((x0 + 22 * S, y0 + 26 * S), label, font=chip_font, fill=BRAND, anchor="lm")

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").resize((W, H), Image.LANCZOS).save(out, optimize=True)


def main() -> None:
    render([("내가 받을 수 있는", INK), ("지원금, 한 번에", BRAND)],
           "나이·소득·지역·상황에 맞는 정부·지자체 지원을 찾아드려요", 220, None, OUT / "default.png")
    for name, art in ICONS.items():
        hue = art["hue"]
        title = [(name if name != "기타" else "기타 지원", hsl(hue, 62, 36)), ("지원 서비스" if name != "기타" else "서비스", INK)]
        render(title, f"내 조건에 맞는 {name if name != '기타' else '정부·지자체'} 지원을 한 번에 확인하세요", hue, art["d"], OUT / f"{art['slug']}.png")
    print("완료:", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
