import math
from PIL import Image, ImageDraw

def create_favicon(size):
    # Create RGBA image with 4x supersampling for ultra smooth anti-aliased edges
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background gradient (Trello Blue #0079BF to #0052CC)
    corner_radius = int(s * 0.22)
    # Draw rounded rect mask
    mask = Image.new("L", (s, s), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=corner_radius, fill=255)

    # Generate gradient
    grad = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c1 = (0, 121, 191)  # #0079BF
    c2 = (0, 82, 204)   # #0052CC
    for y in range(s):
        factor = y / float(s)
        r = int(c1[0] + factor * (c2[0] - c1[0]))
        g = int(c1[1] + factor * (c2[1] - c1[1]))
        b = int(c1[2] + factor * (c2[2] - c1[2]))
        ImageDraw.Draw(grad).line([(0, y), (s, y)], fill=(r, g, b, 255))

    img.paste(grad, (0, 0), mask)

    # Subtle inner border
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([scale, scale, s - 1 - scale, s - 1 - scale], radius=max(2, corner_radius - scale), outline=(255, 255, 255, 55), width=max(1, int(scale * 1.2)))

    # Grid guide lines (vertical dashed subtle guides)
    g1 = int(s * 0.35)
    g2 = int(s * 0.65)
    for y in range(int(s * 0.16), int(s * 0.84), scale * 3):
        draw.line([(g1, y), (g1, min(y + scale * 2, int(s * 0.84)))], fill=(255, 255, 255, 30), width=max(1, int(scale * 0.8)))
        draw.line([(g2, y), (g2, min(y + scale * 2, int(s * 0.84)))], fill=(255, 255, 255, 30), width=max(1, int(scale * 0.8)))

    # Task Bars (Gantt pills)
    # Bar 1: White (Top)
    r1_y = int(s * 0.20)
    r1_h = int(s * 0.14)
    r1_x1 = int(s * 0.14)
    r1_x2 = int(s * 0.58)
    draw.rounded_rectangle([r1_x1, r1_y, r1_x2, r1_y + r1_h], radius=r1_h // 2, fill=(255, 255, 255, 250))

    # Bar 2: Sky Blue (Middle)
    r2_y = int(s * 0.43)
    r2_h = int(s * 0.14)
    r2_x1 = int(s * 0.36)
    r2_x2 = int(s * 0.86)
    draw.rounded_rectangle([r2_x1, r2_y, r2_x2, r2_y + r2_h], radius=r2_h // 2, fill=(56, 189, 248, 250)) # #38BDF8

    # Bar 3: Warm Amber (Bottom)
    r3_y = int(s * 0.66)
    r3_h = int(s * 0.14)
    r3_x1 = int(s * 0.20)
    r3_x2 = int(s * 0.68)
    draw.rounded_rectangle([r3_x1, r3_y, r3_x2, r3_y + r3_h], radius=r3_h // 2, fill=(251, 191, 36, 250)) # #FBBF24

    # Red "Today" vertical marker line
    today_x = int(s * 0.52)
    today_y1 = int(s * 0.13)
    today_y2 = int(s * 0.87)
    line_w = max(2, int(scale * 2.2))
    draw.line([(today_x, today_y1), (today_x, today_y2)], fill=(239, 68, 68, 255), width=line_w)

    # Red Marker Pin Circle at top of today line
    dot_r = max(2, int(scale * 3.0))
    draw.ellipse([today_x - dot_r, today_y1 - dot_r, today_x + dot_r, today_y1 + dot_r], fill=(239, 68, 68, 255), outline=(255, 255, 255, 255), width=max(1, scale))

    # Downsample using high-quality Lanczos filter
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

# Generate PNGs
img_16 = create_favicon(16)
img_16.save("favicon-16x16.png")

img_32 = create_favicon(32)
img_32.save("favicon-32x32.png")

img_48 = create_favicon(48)
img_180 = create_favicon(180)
img_180.save("apple-touch-icon.png")

# Generate multi-size ICO
img_32.save("favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print("Favicons generated successfully!")
