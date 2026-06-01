"""
Импорт пользовательского лого в иконки PWA нужных размеров.

Принимает квадратное изображение, ресайзит в:
  - icon-192.png  (Android)
  - icon-512.png  (Android, splash, app store)
  - apple-touch-icon.png  180x180  (iOS)
  - favicon.png  32x32 (вкладка браузера)

Использование:
  python scripts/import-icon.py "путь/к/лого.png"
  python scripts/import-icon.py            # по умолчанию берёт ChatGPT Image из Downloads
"""
import sys
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


def load(src: Path) -> Image.Image:
    img = Image.open(src)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    w, h = img.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
    return img


def resize(img: Image.Image, size: int) -> Image.Image:
    out = img.resize((size, size), Image.LANCZOS)
    # лёгкий шарп после ресайза, чтобы маленькие размеры не мылились
    if size <= 192:
        out = out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=80, threshold=2))
    return out


def main() -> None:
    src_arg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    src = Path(src_arg)
    if not src.exists():
        print(f"FAIL: source not found: {src}")
        sys.exit(1)

    print(f"Source: {src.name}")
    base = load(src)
    print(f"After load: {base.size}\n")

    for size, name in TARGETS:
        out = resize(base, size)
        path = OUT / name
        out.save(path, "PNG", optimize=True)
        print(f"  OK {name} ({size}x{size}) - {path.stat().st_size // 1024} KB")

    print("\nDone. Replace icon.svg manually if you want vector version.")


if __name__ == "__main__":
    main()
