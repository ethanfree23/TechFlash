"""Regenerate techflash-logo.png (white bar) from techflash-logo-login.png (#F7F7F7)."""
from PIL import Image


def login_to_navbar(src: Image.Image) -> Image.Image:
    im = src.copy().convert("RGBA")
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if (r, g, b) == (247, 247, 247):
                px[x, y] = (255, 255, 255, a)
    return im


if __name__ == "__main__":
    base = Image.open("public/techflash-logo-login.png")
    login_to_navbar(base).save("public/techflash-logo.png", optimize=True)
    print("Wrote public/techflash-logo.png from public/techflash-logo-login.png")
