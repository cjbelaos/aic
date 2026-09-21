// Test-only PNG builder. Constructs 8-bit RGBA, non-interlaced PNGs that
// match what <canvas>.toBlob("image/png") emits, so the server-side signature
// analysis gate can be exercised honestly.

import { deflateSync } from "node:zlib";
import { PNG_SIGNATURE } from "../../src/lib/serviceReports/domain.ts";

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  return out;
}

export function makePngBuffer(
  width: number,
  height: number,
  ink: ReadonlyArray<readonly [number, number]>,
): Buffer {
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const raw = Buffer.alloc((rowLength + 1) * height);
  const inkSet = new Set(ink.map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < height; y++) {
    raw[y * (rowLength + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const base = y * (rowLength + 1) + 1 + x * 4;
      const black = inkSet.has(`${x},${y}`);
      raw[base] = black ? 0 : 255;
      raw[base + 1] = black ? 0 : 255;
      raw[base + 2] = black ? 0 : 255;
      raw[base + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function diagonalInk(width: number, height: number, thickness = 6): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let t = 0; t <= 1.001; t += 0.01) {
    const x = Math.round(t * (width - 1));
    const y = Math.round(t * (height - 1));
    for (let dx = -thickness; dx <= thickness; dx++) {
      for (let dy = -thickness; dy <= thickness; dy++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < width && py >= 0 && py < height) points.push([px, py]);
      }
    }
  }
  return points;
}

/** A full, clearly meaningful signature-style stroke. */
export function meaningfulSignaturePng(width = 500, height = 200): Buffer {
  return makePngBuffer(width, height, diagonalInk(width, height));
}

/** A completely blank white canvas. */
export function emptySignaturePng(width = 500, height = 200): Buffer {
  return makePngBuffer(width, height, []);
}

/** A tiny accidental dot cluster that must be rejected. */
export function shortMarkSignaturePng(): Buffer {
  const ink: Array<[number, number]> = [];
  for (let x = 90; x < 96; x++) for (let y = 60; y < 68; y++) ink.push([x, y]);
  return makePngBuffer(500, 200, ink);
}