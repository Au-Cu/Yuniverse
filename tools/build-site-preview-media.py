from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUTPUT = ROOT / "website" / "yuniverse" / "dist" / "assets" / "previews"
WIDTH = 192
HEIGHT = 208
SCENE = (640, 360)
BACKGROUND = (234, 230, 219, 255)
INK = (32, 32, 31, 255)
LINE = (32, 32, 31, 38)


def crop_cell(image: Image.Image, row: int, column: int) -> Image.Image:
    return image.crop((column * WIDTH, row * HEIGHT, (column + 1) * WIDTH, (row + 1) * HEIGHT))


def contain(image: Image.Image, width: int, height: int) -> Image.Image:
    copy = image.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    return copy


def paste_center(canvas: Image.Image, image: Image.Image, center: tuple[int, int]) -> None:
    x = round(center[0] - image.width / 2)
    y = round(center[1] - image.height / 2)
    canvas.alpha_composite(image, (x, y))


def draw_cursor(canvas: Image.Image, point: tuple[float, float]) -> None:
    x, y = point
    points = [
        (x, y),
        (x + 4, y + 24),
        (x + 10, y + 17),
        (x + 16, y + 29),
        (x + 21, y + 26),
        (x + 14, y + 14),
        (x + 24, y + 12),
    ]
    draw = ImageDraw.Draw(canvas)
    draw.polygon(points, fill=(255, 255, 252, 255), outline=INK, width=2)


def save_animation(frames: list[Image.Image], stem: str, duration: int) -> None:
    webp_path = OUTPUT / f"{stem}.webp"
    gif_path = OUTPUT / f"{stem}.gif"
    frames[0].save(
        webp_path,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        lossless=True,
        method=6,
    )
    palette_frames = [frame.convert("RGB").quantize(colors=192, method=Image.Quantize.MEDIANCUT) for frame in frames]
    palette_frames[0].save(
        gif_path,
        save_all=True,
        append_images=palette_frames[1:],
        duration=duration,
        loop=0,
        optimize=True,
        disposal=2,
    )
    frames[0].save(OUTPUT / f"{stem}.png", optimize=True)


def build_follow_animation(
    atlas: Image.Image,
    corrected_up: Image.Image,
    stem: str,
    reverse_horizontal: bool,
) -> None:
    def look_frame(index: int) -> Image.Image:
        if 0 <= index <= 3 or 13 <= index <= 15:
            column = index if index <= 3 else index - 9
            if reverse_horizontal and column != 0:
                column = 7 - column
            return corrected_up.crop((column * WIDTH, 0, (column + 1) * WIDTH, HEIGHT))
        row = 9 if index < 8 else 10
        column = index if index < 8 else index - 8
        return crop_cell(atlas, row, column)

    frames: list[Image.Image] = []
    for step in range(32):
        angle = 2 * math.pi * step / 32
        cursor = (320 + 238 * math.sin(angle), 180 - 132 * math.cos(angle))
        direction = round((angle % (2 * math.pi)) / (math.pi / 8)) % 16
        canvas = Image.new("RGBA", SCENE, BACKGROUND)
        draw = ImageDraw.Draw(canvas)
        draw.ellipse((80, 48, 560, 312), outline=LINE, width=2)
        paste_center(canvas, look_frame(direction), (320, 194))
        draw_cursor(canvas, cursor)
        frames.append(canvas)
    save_animation(frames, stem, 90)


def build_walk_animation(atlas: Image.Image, stem: str) -> None:
    frames: list[Image.Image] = []
    for step in range(32):
        moving_right = step < 16
        progress = step if moving_right else step - 16
        x = 92 + (456 * progress / 15 if moving_right else 456 * (15 - progress) / 15)
        sprite = crop_cell(atlas, 1, step % 8)
        sprite = contain(sprite, 168, 182)
        if not moving_right:
            sprite = ImageOps.mirror(sprite)

        canvas = Image.new("RGBA", SCENE, BACKGROUND)
        draw = ImageDraw.Draw(canvas)
        draw.line((48, 292, 592, 292), fill=(32, 32, 31, 70), width=2)
        target_x = 568 if moving_right else 72
        draw.ellipse((target_x - 8, 284, target_x + 8, 300), outline=INK, width=2)
        draw.ellipse((target_x - 2, 290, target_x + 2, 294), fill=INK)
        paste_center(canvas, sprite, (round(x), 202))
        frames.append(canvas)
    save_animation(frames, stem, 95)


def build_stills(
    big_sit: Image.Image,
    alien_sit: Image.Image,
    minbird_rest: Image.Image,
    sleep_frames: list[Image.Image],
) -> None:
    for name, image in (
        ("big-selector.png", big_sit),
        ("alien-selector.png", alien_sit),
        ("minbird-selector.png", minbird_rest),
    ):
        image.save(OUTPUT / name, optimize=True)

    sitting = Image.new("RGBA", SCENE, BACKGROUND)
    paste_center(sitting, contain(big_sit, 205, 222), (220, 190))
    paste_center(sitting, contain(alien_sit, 205, 222), (420, 190))
    sitting.save(OUTPUT / "sitting.png", optimize=True)

    sleeping = Image.new("RGBA", SCENE, BACKGROUND)
    for image, center_x in zip(sleep_frames, (148, 320, 492), strict=True):
        paste_center(sleeping, contain(image, 168, 182), (center_x, 194))
    sleeping.save(OUTPUT / "sleeping.png", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    big_atlas = Image.open(ASSETS / "just-big-cat.png").convert("RGBA")
    alien_atlas = Image.open(ASSETS / "just-alien-cat.png").convert("RGBA")
    minbird_atlas = Image.open(ASSETS / "just-minbird.png").convert("RGBA")
    pets = [
        (
            "big",
            big_atlas,
            Image.open(ASSETS / "just-big-look-up.png").convert("RGBA"),
            True,
        ),
        (
            "alien",
            alien_atlas,
            Image.open(ASSETS / "just-alien-look-up.png").convert("RGBA"),
            True,
        ),
        (
            "minbird",
            minbird_atlas,
            Image.open(ASSETS / "just-minbird-look-up.png").convert("RGBA"),
            False,
        ),
    ]

    for legacy_name in ("mouse-follow.webp", "mouse-follow.gif", "mouse-follow.png", "walking.webp", "walking.gif", "walking.png"):
        legacy_path = OUTPUT / legacy_name
        if legacy_path.exists():
            legacy_path.unlink()

    for name, atlas, look_up, reverse_horizontal in pets:
        build_follow_animation(atlas, look_up, f"{name}-follow", reverse_horizontal)
        build_walk_animation(atlas, f"{name}-walk")
    build_stills(
        Image.open(ASSETS / "just-big-sit.png").convert("RGBA"),
        Image.open(ASSETS / "just-alien-sit.png").convert("RGBA"),
        Image.open(ASSETS / "just-minbird-rest.png").convert("RGBA"),
        [
            crop_cell(big_atlas, 5, 7),
            crop_cell(alien_atlas, 5, 7),
            crop_cell(minbird_atlas, 5, 7),
        ],
    )

    readme = OUTPUT / "README.txt"
    readme.write_text(
        "Yuniverse 网页动作预览素材\n"
        "\n"
        "big-follow / big-walk：JUST 大猫转头与行走\n"
        "alien-follow / alien-walk：外星猫转头与行走\n"
        "minbird-follow / minbird-walk：珉鸟转头与行走\n"
        "每组动态预览均包含 .webp、.gif 和静态封面 .png。\n"
        "big-selector.png / alien-selector.png / minbird-selector.png：成员选择按钮图片\n"
        "sitting.png：两只猫坐下\n"
        "sleeping.png：三位成员休眠\n"
        "\n"
        "所有画面均从 Yuniverse 1.0.0 的运行时素材生成。\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
