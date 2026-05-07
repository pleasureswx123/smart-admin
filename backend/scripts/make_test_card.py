"""生成一张用于 OCR 验证的合成名片图片（仅本地开发使用）。"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main(out: str = "test_card.jpg") -> None:
    img = Image.new("RGB", (720, 420), "white")
    draw = ImageDraw.Draw(img)
    font_path = "C:/Windows/Fonts/simsun.ttc"
    try:
        f_large = ImageFont.truetype(font_path, 36)
        f_mid = ImageFont.truetype(font_path, 24)
        f_small = ImageFont.truetype(font_path, 22)
    except Exception:
        f_large = ImageFont.load_default()
        f_mid = ImageFont.load_default()
        f_small = ImageFont.load_default()

    draw.text((48, 40), "王志强", fill="black", font=f_large)
    draw.text((48, 100), "高级产品经理", fill="black", font=f_mid)
    draw.text((48, 160), "上海科创信息技术有限公司", fill="black", font=f_mid)
    draw.text((48, 240), "电话：13912345678", fill="black", font=f_small)
    draw.text((48, 280), "邮箱：wangzq@kechuang.com", fill="black", font=f_small)
    draw.text((48, 320), "地址：上海市浦东新区张江高科技园区", fill="black", font=f_small)

    Path(out).parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=92)
    print(f"saved: {out} size={img.size}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "test_card.jpg")
