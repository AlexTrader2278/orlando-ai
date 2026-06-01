"""
Импорт пользовательского лого в иконки PWA.

Если в исходнике есть белые поля по краям (например, ChatGPT-генерация
'тёмный квадрат на белом фоне') — автоматически:
  1) обрезает белые/прозрачные поля,
  2) определяет цвет фона лого (тёмный навy),
  3) делает full-bleed PNG: канва залита цветом фона + лого по центру 96%.

Так иконка визуально «весит» столько же сколько соседние на рабочем столе.

Использование:
  python scripts/import-icon.py "путь/к/лого.png"
  python scripts/import-icon.py            # ChatGPT Image из Downloads
"""
import sys
from collections import Counter
from pathlib import Path
from PIL import Image, ImageFilter

DEFAULT_SRC = r"C:\Users\user\Downloads\ChatGPT Image 1 июн. 2026 г., 04_16_26.png"

OUT = Path(__file__).resolve().parent.parent / "public"
OUT.mkdir(exist_ok=True)

TARGETS = [
    (192, "icon-192.png"),
    (512, "icon-512.png"),
    (180, "apple-touch-icon.png"),
    (32, "favicon.png"),
]

# Сколько процента канвы занимает лого (остальное — поля цвета фона)
INNER_SCALE = 0.96

# Что считать «белым/прозрачным» полем при обрезке
WHITE_THRESHOLD = 240


def load(src: Path) -> Image.Image:
    img = Image.open(src)
    return img.convert("RGBA")


def trim_white_borders(img: Image.Image) -> Image.Image:
    """Обрезает белые/прозрачные поля по краям. Возвращает кроп."""
    rgba = img.load()
    w, h = img.size

    def is_blank(x: int, y: int) -> bool:
        r, g, b, a = rgba[x, y]
        if a < 8:
            return True
        return r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD

    # ищем границы непустого контента
    left, top, right, bottom = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            if not is_blank(x, y):
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)
                found = True
    if not found:
        return img
    return img.crop((left, top, right + 1, bottom + 1))


def dominant_bg_color(img: Image.Image) -> tuple[int, int, int]:
    """Сэмплим цвет из верхней четверти лого, отступив от краёв 12%
    (мимо антиалиасинга на скруглённых углах). Самый частый кластер."""
    rgba = img.load()
    w, h = img.size
    inset_x = int(w * 0.12)
    inset_y = int(h * 0.08)
    # верхняя полоса — для логотипов "тёмный квадрат" там фон без контента
    samples: list[tuple[int, int, int]] = []
    for y in range(inset_y, int(h * 0.22)):
        for x in range(inset_x, w - inset_x):
            r, g, b, a = rgba[x, y]
            if a < 200:
                continue
            # отбрасываем явно светлые (текст/контент), берём только тёмный фон
            if r > 200 and g > 200 and b > 200:
                continue
            samples.append((r, g, b))
    # fallback: если в верхней полосе пусто — пробуем нижнюю
    if not samples:
        for y in range(int(h * 0.78), h - inset_y):
            for x in range(inset_x, w - inset_x):
                r, g, b, a = rgba[x, y]
                if a > 200 and not (r > 200 and g > 200 and b > 200):
                    samples.append((r, g, b))
    if not samples:
        return (30, 42, 79)
    # кластеризуем округлением до 16 — выбираем самый частый тёмный кластер
    rounded = [(r >> 4 << 4, g >> 4 << 4, b >> 4 << 4) for (r, g, b) in samples]
    return Counter(rounded).most_common(1)[0][0]


def make_full_bleed(content: Image.Image, size: int, bg: tuple[int, int, int]) -> Image.Image:
    """Канва нужного размера, залитая цветом фона, с лого по центру 96%."""
    canvas = Image.new("RGBA", (size, size), bg + (255,))
    inner = int(size * INNER_SCALE)
    # сохраняем пропорции содержимого
    cw, ch = content.size
    scale = inner / max(cw, ch)
    nw = max(1, int(cw * scale))
    nh = max(1, int(ch * scale))
    resized = content.resize((nw, nh), Image.LANCZOS)
    if size <= 192:
        resized = resized.filter(ImageFilter.UnsharpMask(radius=0.6, percent=80, threshold=2))
    offset = ((size - nw) // 2, (size - nh) // 2)
    canvas.paste(resized, offset, resized)
    return canvas


def main() -> None:
    src_arg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    src = Path(src_arg)
    if not src.exists():
        print(f"FAIL: source not found: {src}")
        sys.exit(1)

    print(f"Source: {src.name}")
    raw = load(src)
    print(f"  loaded: {raw.size} {raw.mode}")

    trimmed = trim_white_borders(raw)
    print(f"  trimmed: {trimmed.size}")

    bg = dominant_bg_color(trimmed)
    print(f"  bg color: rgb{bg}")
    print()

    for size, name in TARGETS:
        out = make_full_bleed(trimmed, size, bg)
        path = OUT / name
        out.convert("RGB").save(path, "PNG", optimize=True)
        print(f"  OK {name} ({size}x{size}) - {path.stat().st_size // 1024} KB")

    print("\nDone. Bump SW version after this so phones re-fetch icons.")


if __name__ == "__main__":
    main()
