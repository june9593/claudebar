import struct, zlib

width, height = 32, 32
pixels = []
for y in range(height):
    row = [0]
    for x in range(width):
        cx, cy = x - 16, y - 16
        dist1 = ((cx - 3)**2 + (cy + 2)**2)**0.5
        dist2 = ((cx + 3)**2 + (cy + 2)**2)**0.5
        body = abs(cx) <= 3 and 0 <= cy <= 8
        lp = 7 < dist1 < 10 and cx < 2 and cy < 2
        rp = 7 < dist2 < 10 and cx > -2 and cy < 2
        stem = abs(cx) <= 2 and 4 <= cy <= 12
        if body or lp or rp or stem:
            row.extend([0, 0, 0, 255])
        else:
            row.extend([0, 0, 0, 0])
    pixels.append(bytes(row))

raw = b''.join(pixels)
compressed = zlib.compress(raw)

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

write_png('resources/iconTemplate.png', width, height, compressed)
write_png('resources/iconTemplate@2x.png', width, height, compressed)
print('Icons created')
