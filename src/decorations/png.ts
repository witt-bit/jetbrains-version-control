import { deflateSync } from "node:zlib";

/**
 * Minimal PNG encoder. Needed because the gutter marker icons must be
 * regenerated whenever the user changes the palette, so fixed-color image
 * files shipped in the package would not do.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type Rgba = readonly [number, number, number, number];

export type Rgb = readonly [number, number, number];

/** Parse `#rgb`/`#rrggbb`; returns undefined for anything else. */
export function parseHex(value: string | undefined): Rgb | undefined {
  if (!value) return undefined;
  const text = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) {
    return [
      parseInt(short[1] + short[1], 16),
      parseInt(short[2] + short[2], 16),
      parseInt(short[3] + short[3], 16),
    ];
  }
  const long = /^#([0-9a-f]{6})$/i.exec(text);
  if (!long) return undefined;
  return [
    parseInt(long[1].slice(0, 2), 16),
    parseInt(long[1].slice(2, 4), 16),
    parseInt(long[1].slice(4, 6), 16),
  ];
}

/**
 * A solid-color PNG, accepting `#rgb`/`#rrggbb` or the literal `transparent`.
 * The image is 1×1 and stretched via decoration width/height, so one cache
 * entry per color is enough.
 */
export function solidColorPng(
  width: number,
  height: number,
  color: string,
): Buffer {
  const rgba = toRgba(color);
  return encodePng(width, height, () => rgba);
}

function toRgba(color: string): Rgba {
  if (color === "transparent") return [0, 0, 0, 0];
  const rgb = parseHex(color) ?? [128, 128, 128];
  return [rgb[0], rgb[1], rgb[2], 255];
}

/** Encode an image as an 8-bit RGBA PNG. */
export function encodePng(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba,
): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // no per-scanline filter
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
