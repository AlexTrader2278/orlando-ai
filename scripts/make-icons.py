"""
Генерирует PNG-иконки для PWA из простых примитивов PIL.
Запуск: python scripts/make-icons.py
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public"
OUT.mkdir(exist_ok=True)

# Палитра из tailwind.config.js
BG_TOP = (30, 42, 79)        # #1e2a4f
BG_BOT = (15, 26, 53)        # #0f1a35
ACCENT = (37, 99, 235)       # #2563eb
TEXT_HI = (219, 234, 254)    # #dbeafe
TEXT_LO = (96, 165, 250)     # #60a5fa


def find_font(size: int, want_emoji: bool = False) -> ImageFont.ImageFont:
    candidates_emoji = [
        r"C:\Windows\Fonts\seguiemj.ttf",
        r"C:\Windows\Fonts\seguisb.ttf",
    ]
    candidates_text = [
        r"C:\Windows\Fonts\segoeuib.ttf",  # Segoe UI Bold
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in (candidates_emoji if want_emoji else candidates_text):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), BG_BOT)
    draw = ImageDraw.Draw(img, "RGBA")

    # Вертикальный градиент фона
    for y in range(size):
        t = y / size
        r = int(BG_TOP[0] * (1 - t) + BG_BOT[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG_BOT[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG_BOT[2] * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b))

    # Скругление углов
    radius = int(size * 0.22)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=radius, fill=255)

    # Лёгкий блик слева-сверху
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.ellipse(
        [int(-size * 0.2), int(-size * 0.4), int(size * 0.9), int(size * 0.6)],
        fill=(255, 255, 255, 28),
    )
    img.paste(overlay, (0, 0), overlay)

    # Текст «Orlando» сверху
    title_font = find_font(int(size * 0.115))
    sub_font = find_font(int(size * 0.085))
    title = "Orlando"
    bbox = title_font.getbbox(title)
    tx = (size - (bbox[2] - bbox[0])) // 2
    ty = int(size * 0.16)
    draw.text((tx, ty), title, fill=TEXT_HI, font=title_font)

    sub = "— AI —"
    bbox2 = sub_font.getbbox(sub)
    sx = (size - (bbox2[2] - bbox2[0])) // 2
    sy = ty + int(size * 0.13)
    draw.text((sx, sy), sub, fill=TEXT_LO, font=sub_font)

    # Круг-акцент
    cx, cy = size // 2, int(size * 0.62)
    rad = int(size * 0.22)
    draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=ACCENT + (255,))

    # Эмодзи машинки в круге (если эмодзи-шрифт есть)
    emoji_font = find_font(int(size * 0.28), want_emoji=True)
    car = "🚗"
    bbox3 = emoji_font.getbbox(car)
    ex = (size - (bbox3[2] - bbox3[0])) // 2 - bbox3[0]
    ey = cy - (bbox3[3] - bbox3[1]) // 2 - bbox3[1]
    try:
        draw.text((ex, ey), car, font=emoji_font, embedded_color=True)
    except TypeError:
        draw.text((ex, ey), car, fill=(255, 255, 255), font=emoji_font)

    # Применить маску скруглений
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final.paste(img, (0, 0), mask)
    return final


def save(img: Image.Image, name: str) -> None:
    path = OUT / name
    img.save(path, "PNG", optimize=True)
    print(f"  OK {name} - {path.stat().st_size // 1024} KB")


def main() -> None:
    print(f"Generating PNG icons in {OUT}\n")
    for sz, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png"), (32, "favicon.png")]:
        save(make_icon(sz), name)
    print("\nDone.")


if __name__ == "__main__":
    main()
