import struct, zlib, math


def make_icon(size):
    """Generate a clean lobster claw silhouette for macOS menu bar template image."""
    pixels = []
    s = size / 32.0

    for y in range(size):
        row = [0]  # PNG filter byte
        for x in range(size):
            cx = (x - size / 2 + 0.5) / s
            cy = (y - size / 2 + 0.5) / s
            alpha = 0

            # Handle / stem (bottom part)
            if 2 <= cy <= 12:
                t = (cy - 2) / 10.0
                half_w = 2.8 - t * 0.8
                if abs(cx) <= half_w:
                    alpha = 255

            # Claw base (junction)
            base_rx, base_ry = 6.0, 3.8
            bx, by = cx, cy - 0.5
            if (bx / base_rx) ** 2 + (by / base_ry) ** 2 <= 1.0:
                alpha = 255

            # Left pincer (outer arc)
            lx, ly = cx + 1.5, cy + 1.0
            ld = math.sqrt(lx * lx + ly * ly)
            la = math.atan2(ly, lx)
            if 5.0 <= ld <= 9.0 and la < -0.2 and la > -2.9 and cx <= 3:
                alpha = 255
            if 6.5 <= ld <= 10.0 and cy <= -5 and cx <= 1.5:
                if -2.7 < la < -1.1:
                    alpha = 255

            # Right pincer (mirror of left)
            rx, ry = cx - 1.5, cy + 1.0
            rd = math.sqrt(rx * rx + ry * ry)
            ra = math.atan2(ry, rx)
            if 5.0 <= rd <= 9.0 and (ra > 3.14 - 2.9 or ra < -(3.14 - 0.2)) and cx >= -3:
                alpha = 255
            if 6.5 <= rd <= 10.0 and cy <= -5 and cx >= -1.5:
                tip_a = math.atan2(ry, rx)
                if tip_a > (3.14 - 2.7) or tip_a < -(3.14 - 1.1):
                    alpha = 255

            # Hollow gap between pincers
            gap_d = math.sqrt(cx * cx + (cy + 3) ** 2)
            if gap_d <= 3.2 and cy <= 0:
                alpha = 0

            # Anti-alias: soften edges slightly
            row.extend([0, 0, 0, alpha])
        pixels.append(bytes(row))

    return zlib.compress(b''.join(pixels))


def write_png(filename, w, h, data):
    def chunk(ctype, cdata):
        c = ctype + cdata
        return struct.pack('>I', len(cdata)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', data)
    iend = chunk(b'IEND', b'')
    with open(filename, 'wb') as f:
        f.write(sig + ihdr + idat + iend)


write_png('resources/iconTemplate.png', 16, 16, make_icon(16))
write_png('resources/iconTemplate@2x.png', 32, 32, make_icon(32))
print('Icons created (16x16 + 32x32)')
print('Icons created')
