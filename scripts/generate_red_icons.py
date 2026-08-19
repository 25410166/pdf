import os
from PIL import Image, ImageDraw, ImageFont

def draw_cpdf_logo(size=256):
    # High-resolution image with RGBA
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = int(size * 0.05)
    rect_box = [margin, margin, size - margin, size - margin]
    radius = int(size * 0.22)

    # Draw Red rounded background (#dc2626) with White border (#ffffff)
    draw.rounded_rectangle(rect_box, radius=radius, fill=(220, 38, 38, 255), outline=(255, 255, 255, 255), width=int(size * 0.06))

    # Page folded document box in center
    px0 = int(size * 0.30)
    py0 = int(size * 0.22)
    px1 = int(size * 0.70)
    py1 = int(size * 0.78)

    # White page rectangle
    draw.rectangle([px0, py0, px1, py1], fill=(255, 255, 255, 255))

    # Folded corner top right (red triangle tint)
    corner_size = int(size * 0.14)
    draw.polygon([(px1 - corner_size, py0), (px1, py0 + corner_size), (px1 - corner_size, py0 + corner_size)], fill=(254, 226, 226, 255))

    # Document text lines (light red/pink lines #fca5a5)
    line_y1 = int(size * 0.48)
    line_y2 = int(size * 0.58)
    line_y3 = int(size * 0.68)
    line_h = max(2, int(size * 0.05))
    line_x0 = int(size * 0.36)
    line_w1 = int(size * 0.28)
    line_w2 = int(size * 0.18)

    draw.rectangle([line_x0, line_y1, line_x0 + line_w1, line_y1 + line_h], fill=(252, 165, 165, 255))
    draw.rectangle([line_x0, line_y2, line_x0 + line_w1, line_y2 + line_h], fill=(252, 165, 165, 255))
    draw.rectangle([line_x0, line_y3, line_x0 + line_w2, line_y3 + line_h], fill=(252, 165, 165, 255))

    # Dark red badge dot bottom right (#b91c1c)
    dot_r = int(size * 0.08)
    dot_cx = int(size * 0.64)
    dot_cy = int(size * 0.69)
    draw.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=(185, 28, 28, 255))

    return img

def main():
    os.makedirs("src-tauri/icons", exist_ok=True)
    os.makedirs("apps/web/public", exist_ok=True)

    img256 = draw_cpdf_logo(256)
    img128 = draw_cpdf_logo(128)
    img32 = draw_cpdf_logo(32)
    img16 = draw_cpdf_logo(16)

    # Save PNGs for Tauri
    img32.save("src-tauri/icons/32x32.png")
    img128.save("src-tauri/icons/128x128.png")
    img256.save("src-tauri/icons/128x128@2x.png")

    # Save ICO for Windows Executable
    img256.save("src-tauri/icons/icon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    img256.save("src-tauri/icons/icon.icns")

    # Save web favicons
    img256.save("apps/web/public/apple-touch-icon.png")
    img32.save("apps/web/public/favicon-32.png")
    img256.save("apps/web/public/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128)])

    print("Successfully generated red CPDF icons for Windows executable and web favicons!")

if __name__ == "__main__":
    main()
