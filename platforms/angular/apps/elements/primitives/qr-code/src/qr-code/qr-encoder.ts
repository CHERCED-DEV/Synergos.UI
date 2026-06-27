/**
 * Dependency-free QR Code encoder (byte mode) for the SynergosLabs design
 * system. Produces a square boolean matrix where `true` = dark module.
 *
 * Scope: byte (8-bit) encoding mode, versions 1–10 (auto-selected from the
 * payload length and the requested error-correction level), the four standard
 * EC levels (L/M/Q/H), and full mask-pattern evaluation per the QR spec.
 * That envelope comfortably covers URLs, vCards and short text — the payloads
 * a CMS-driven QR primitive renders in practice. Longer payloads throw so the
 * component can surface a graceful error instead of emitting a corrupt code.
 *
 * Reference: ISO/IEC 18004. Galois-field arithmetic, the generator
 * polynomials, alignment-pattern centres and the EC block tables below are the
 * canonical constants from that standard.
 */

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  /** Module count per side (always odd, 21 + 4·(version − 1)). */
  readonly size: number;
  /** Row-major grid; `modules[y][x]` true = dark module. */
  readonly modules: readonly (readonly boolean[])[];
  readonly version: number;
  readonly errorCorrectionLevel: QrErrorCorrectionLevel;
}

const EC_LEVEL_BITS: Record<QrErrorCorrectionLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

// Total data codewords (bytes) available in byte mode, indexed [version-1] per EC level.
const DATA_CODEWORDS: Record<QrErrorCorrectionLevel, readonly number[]> = {
  L: [19, 34, 55, 80, 108, 136, 156, 194, 232, 274],
  M: [16, 28, 44, 64, 86, 108, 124, 154, 182, 216],
  Q: [13, 22, 34, 48, 62, 76, 88, 110, 132, 154],
  H: [9, 16, 26, 36, 46, 60, 66, 86, 100, 122],
};

// EC codewords per block + block layout, indexed [version-1] per EC level.
// Each entry: [ecCodewordsPerBlock, [numBlocksGroup1, dataCodewordsGroup1Block, numBlocksGroup2, dataCodewordsGroup2Block]]
const EC_BLOCKS: Record<QrErrorCorrectionLevel, readonly [number, readonly number[]][]> = {
  L: [
    [7, [1, 19, 0, 0]], [10, [1, 34, 0, 0]], [15, [1, 55, 0, 0]], [20, [1, 80, 0, 0]],
    [26, [1, 108, 0, 0]], [18, [2, 68, 0, 0]], [20, [2, 78, 0, 0]], [24, [2, 97, 0, 0]],
    [30, [2, 116, 0, 0]], [18, [2, 68, 2, 69]],
  ],
  M: [
    [10, [1, 16, 0, 0]], [16, [1, 28, 0, 0]], [26, [1, 44, 0, 0]], [18, [2, 32, 0, 0]],
    [24, [2, 43, 0, 0]], [16, [4, 27, 0, 0]], [18, [4, 31, 0, 0]], [22, [2, 38, 2, 39]],
    [22, [3, 36, 2, 37]], [26, [4, 43, 1, 44]],
  ],
  Q: [
    [13, [1, 13, 0, 0]], [22, [1, 22, 0, 0]], [18, [2, 17, 0, 0]], [26, [2, 24, 0, 0]],
    [18, [2, 15, 2, 16]], [24, [4, 19, 0, 0]], [18, [2, 14, 4, 15]], [22, [4, 18, 2, 19]],
    [20, [4, 16, 4, 17]], [24, [6, 19, 2, 20]],
  ],
  H: [
    [17, [1, 9, 0, 0]], [28, [1, 16, 0, 0]], [22, [2, 13, 0, 0]], [16, [4, 9, 0, 0]],
    [22, [2, 11, 2, 12]], [28, [4, 15, 0, 0]], [26, [4, 13, 1, 14]], [26, [4, 14, 2, 15]],
    [24, [4, 12, 4, 13]], [28, [6, 15, 2, 16]],
  ],
};

// Alignment-pattern centre coordinates per version (empty for version 1).
const ALIGNMENT_POSITIONS: readonly (readonly number[])[] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// ─── Galois field (GF(256)) tables ───────────────────────────────────────────
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function reedSolomon(data: readonly number[], ecCount: number): number[] {
  const generator = generatorPolynomial(ecCount);
  const remainder = new Array<number>(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < generator.length - 1; i++) {
      remainder[i] ^= gfMul(generator[i + 1], factor);
    }
  }
  return remainder;
}

function utf8Bytes(value: string): number[] {
  if (typeof TextEncoder === 'function') {
    return Array.from(new TextEncoder().encode(value));
  }
  // Fallback for environments without TextEncoder.
  return Array.from(unescape(encodeURIComponent(value)), (c) => c.charCodeAt(0));
}

function pickVersion(byteLength: number, level: QrErrorCorrectionLevel): number {
  const capacities = DATA_CODEWORDS[level];
  for (let version = 1; version <= capacities.length; version++) {
    // 4 bits mode + char-count indicator (8 or 16 bits) + payload + terminator.
    const charCountBits = version < 10 ? 8 : 16;
    const required = Math.ceil((4 + charCountBits + byteLength * 8) / 8);
    if (required <= capacities[version - 1]) {
      return version;
    }
  }
  throw new RangeError('QR payload too long for supported versions (1–10).');
}

function buildBitStream(bytes: readonly number[], version: number, level: QrErrorCorrectionLevel): number[] {
  const totalCodewords = DATA_CODEWORDS[level][version - 1];
  const totalBits = totalCodewords * 8;
  const charCountBits = version < 10 ? 8 : 16;

  const bits: number[] = [];
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  };

  push(0b0100, 4); // byte mode indicator
  push(bytes.length, charCountBits);
  for (const byte of bytes) {
    push(byte, 8);
  }

  // Terminator (up to 4 zero bits).
  const terminator = Math.min(4, totalBits - bits.length);
  for (let i = 0; i < terminator; i++) {
    bits.push(0);
  }
  // Pad to a byte boundary.
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Pack to codewords, then add pad bytes 0xEC / 0x11 alternately.
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    codewords.push(byte);
  }
  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < totalCodewords) {
    codewords.push(pads[padIndex % 2]);
    padIndex++;
  }
  return codewords;
}

function interleave(dataCodewords: readonly number[], version: number, level: QrErrorCorrectionLevel): number[] {
  const [ecPerBlock, [g1Count, g1Size, g2Count, g2Size]] = EC_BLOCKS[level][version - 1];

  const blocks: { data: number[]; ec: number[] }[] = [];
  let offset = 0;
  const addBlocks = (count: number, size: number): void => {
    for (let i = 0; i < count; i++) {
      const data = dataCodewords.slice(offset, offset + size);
      offset += size;
      blocks.push({ data, ec: reedSolomon(data, ecPerBlock) });
    }
  };
  addBlocks(g1Count, g1Size);
  addBlocks(g2Count, g2Size);

  const result: number[] = [];
  const maxData = Math.max(g1Size, g2Size);
  for (let i = 0; i < maxData; i++) {
    for (const block of blocks) {
      if (i < block.data.length) {
        result.push(block.data[i]);
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of blocks) {
      result.push(block.ec[i]);
    }
  }
  return result;
}

// ─── Matrix placement ────────────────────────────────────────────────────────
type Grid = (boolean | null)[][];

function newGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

function placeFinder(grid: Grid, row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || y >= grid.length || x < 0 || x >= grid.length) {
        continue;
      }
      const isBorder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const isRing = r === 0 || r === 6 || c === 0 || c === 6;
      const isCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[y][x] = isBorder ? isRing || isCore : false;
    }
  }
}

function placeAlignment(grid: Grid, version: number): void {
  const positions = ALIGNMENT_POSITIONS[version - 1];
  for (const row of positions) {
    for (const col of positions) {
      // Skip cells overlapping the three finder patterns.
      if (grid[row][col] !== null) {
        continue;
      }
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isRing = Math.abs(r) === 2 || Math.abs(c) === 2;
          const isCentre = r === 0 && c === 0;
          grid[row + r][col + c] = isRing || isCentre;
        }
      }
    }
  }
}

function placeTiming(grid: Grid): void {
  const size = grid.length;
  for (let i = 8; i < size - 8; i++) {
    const value = i % 2 === 0;
    if (grid[6][i] === null) {
      grid[6][i] = value;
    }
    if (grid[i][6] === null) {
      grid[i][6] = value;
    }
  }
}

function reserveFormatAreas(grid: Grid): void {
  const size = grid.length;
  for (let i = 0; i < 9; i++) {
    if (grid[8][i] === null) {
      grid[8][i] = false;
    }
    if (grid[i][8] === null) {
      grid[i][8] = false;
    }
  }
  for (let i = 0; i < 8; i++) {
    if (grid[8][size - 1 - i] === null) {
      grid[8][size - 1 - i] = false;
    }
    if (grid[size - 1 - i][8] === null) {
      grid[size - 1 - i][8] = false;
    }
  }
  grid[size - 8][8] = true; // dark module
}

function isFunctionModule(reserved: boolean[][], y: number, x: number): boolean {
  return reserved[y][x];
}

function placeData(grid: Grid, reserved: boolean[][], codewords: readonly number[]): void {
  const size = grid.length;
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  const getBit = (): boolean => {
    if (bitIndex >= totalBits) {
      return false;
    }
    const byte = codewords[bitIndex >> 3];
    const bit = (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit === 1;
  };

  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) {
      right = 5; // skip the vertical timing column
    }
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let c = 0; c < 2; c++) {
        const x = right - c;
        if (!isFunctionModule(reserved, y, x)) {
          grid[y][x] = getBit();
        }
      }
    }
    upward = !upward;
  }
}

function maskCondition(pattern: number, y: number, x: number): boolean {
  switch (pattern) {
    case 0: return (y + x) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (y + x) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((y * x) % 2) + ((y * x) % 3) === 0;
    case 6: return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0;
    case 7: return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0;
    default: return false;
  }
}

function applyMask(grid: Grid, reserved: boolean[][], pattern: number): boolean[][] {
  const size = grid.length;
  const out: boolean[][] = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const base = grid[y][x] === true;
      if (reserved[y][x]) {
        return base;
      }
      return maskCondition(pattern, y, x) ? !base : base;
    }),
  );
  return out;
}

function placeFormatInfo(
  grid: boolean[][],
  level: QrErrorCorrectionLevel,
  mask: number,
): void {
  const size = grid.length;
  const data = (EC_LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0x537 : 0);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  const getBit = (i: number): boolean => ((bits >> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) {
    grid[8][i] = getBit(i);
  }
  grid[8][7] = getBit(6);
  grid[8][8] = getBit(7);
  grid[7][8] = getBit(8);
  for (let i = 9; i <= 14; i++) {
    grid[14 - i][8] = getBit(i);
  }

  for (let i = 0; i <= 7; i++) {
    grid[size - 1 - i][8] = getBit(i);
  }
  for (let i = 8; i <= 14; i++) {
    grid[8][size - 15 + i] = getBit(i);
  }
}

function penalty(grid: boolean[][]): number {
  const size = grid.length;
  let score = 0;

  // Rule 1: runs of 5+ same-colour modules (rows + columns).
  const runScore = (line: boolean[]): number => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) {
        run++;
      } else {
        if (run >= 5) {
          total += 3 + (run - 5);
        }
        run = 1;
      }
    }
    if (run >= 5) {
      total += 3 + (run - 5);
    }
    return total;
  };
  for (let y = 0; y < size; y++) {
    score += runScore(grid[y]);
    score += runScore(grid.map((row) => row[y]));
  }

  // Rule 2: 2×2 blocks of the same colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = grid[y][x];
      if (v === grid[y][x + 1] && v === grid[y + 1][x] && v === grid[y + 1][x + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pattern = [true, false, true, true, true, false, true];
  const hasPattern = (line: boolean[], i: number): boolean =>
    pattern.every((p, k) => line[i + k] === p);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x <= size - 7; x++) {
      if (hasPattern(grid[y], x)) {
        score += 40;
      }
      const col = grid.map((row) => row[y]);
      if (hasPattern(col, x)) {
        score += 40;
      }
    }
  }

  // Rule 4: dark-module proportion deviation from 50%.
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x]) {
        dark++;
      }
    }
  }
  const percent = (dark / (size * size)) * 100;
  const deviation = Math.floor(Math.abs(percent - 50) / 5);
  score += deviation * 10;

  return score;
}

/**
 * Encode `value` into a QR module matrix. Throws `RangeError` when the payload
 * exceeds the supported version range so callers can render an error state.
 */
export function encodeQr(value: string, level: QrErrorCorrectionLevel): QrMatrix {
  const bytes = utf8Bytes(value);
  const version = pickVersion(bytes.length, level);
  const dataCodewords = buildBitStream(bytes, version, level);
  const finalCodewords = interleave(dataCodewords, version, level);

  const size = 21 + (version - 1) * 4;
  const grid = newGrid(size);

  placeFinder(grid, 0, 0);
  placeFinder(grid, 0, size - 7);
  placeFinder(grid, size - 7, 0);
  placeAlignment(grid, version);
  placeTiming(grid);
  reserveFormatAreas(grid);

  // Snapshot which cells are function modules before laying data.
  const reserved: boolean[][] = grid.map((row) => row.map((cell) => cell !== null));

  placeData(grid, reserved, finalCodewords);

  // Evaluate the eight masks and keep the lowest-penalty result.
  let best: boolean[][] | null = null;
  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(grid, reserved, mask);
    placeFormatInfo(masked, level, mask);
    const score = penalty(masked);
    if (score < bestScore) {
      bestScore = score;
      best = masked;
      bestMask = mask;
    }
  }

  const chosen = best ?? applyMask(grid, reserved, 0);
  if (!best) {
    placeFormatInfo(chosen, level, bestMask);
  }

  return {
    size,
    modules: chosen,
    version,
    errorCorrectionLevel: level,
  };
}
