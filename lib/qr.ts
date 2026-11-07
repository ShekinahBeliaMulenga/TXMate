/**
 * A small QR code encoder (byte mode, error correction level M, versions 1 to 10, so up to 213 characters). It is
 * written here, rather than added as a package, so the two-step setup key is only ever drawn on the admin's own
 * screen and is never sent to a QR service or a third-party library.
 */
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;

function rawModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (version: number) => Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function remainder(data: number[], div: number[]): number[] {
  const result = new Array<number>(div.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    div.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

function withErrorCorrection(data: number[], version: number): number[] {
  const numBlocks = BLOCKS[version];
  const eccLen = ECC_PER_BLOCK[version];
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const div = divisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const length = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const block = data.slice(k, k + length);
    k += length;
    const ecc = remainder(block, div);
    if (i < shortBlocks) block.push(0);
    blocks.push(block.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) result.push(block[i]); });
  }
  return result;
}

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

const bit = (value: number, index: number) => ((value >>> index) & 1) !== 0;

function penalty(modules: boolean[][], size: number): number {
  let result = 0;
  const countPatterns = (h: number[]) => {
    const n = h[1];
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const addHistory = (run: number, h: number[]) => {
    if (h[0] === 0) run += size;
    h.pop();
    h.unshift(run);
  };
  const lines = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let color = false;
      let run = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        if (get(a, b) === color) {
          run++;
          if (run === 5) result += 3;
          else if (run > 5) result++;
        } else {
          addHistory(run, history);
          if (!color) result += countPatterns(history) * 40;
          color = get(a, b);
          run = 1;
        }
      }
      if (color) { addHistory(run, history); run = 0; }
      run += size;
      addHistory(run, history);
      result += countPatterns(history) * 40;
    }
  };
  lines((y, x) => modules[y][x]);
  lines((x, y) => modules[y][x]);
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += 3;
    }
  }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return result;
}

/** The QR code for `text` as rows of dark (true) and light (false) modules, without the blank border. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 1;
  const countBits = () => (version <= 9 ? 8 : 16);
  while (version <= MAX_VERSION && 4 + countBits() + bytes.length * 8 > dataCodewords(version) * 8) version++;
  if (version > MAX_VERSION) throw new Error("That text is too long for this QR code.");

  const bits: number[] = [];
  const push = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, countBits());
  bytes.forEach((byte) => push(byte, 8));
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < dataCodewords(version); pad ^= 0xec ^ 0x11) data.push(pad);
  const codewords = withErrorCorrection(data, version);

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  for (let i = 0; i < size; i++) { setFunction(6, i, i % 2 === 0); setFunction(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(cx + dx, cy + dy, dist !== 2 && dist !== 4);
    }
  }
  const align = alignmentPositions(version, size);
  align.forEach((cx, i) => align.forEach((cy, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  const drawFormat = (mask: number) => {
    const formatData = mask; // level M is 00
    let rem = formatData;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const formatBits = ((formatData << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(formatBits, i));
    setFunction(8, 7, bit(formatBits, 6));
    setFunction(8, 8, bit(formatBits, 7));
    setFunction(7, 8, bit(formatBits, 8));
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(formatBits, i));
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(formatBits, i));
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(formatBits, i));
    setFunction(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit(versionBits, i));
      setFunction(b, a, bit(versionBits, i));
    }
  }

  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!reserved[y][x] && index < codewords.length * 8) {
          modules[y][x] = bit(codewords[index >>> 3], 7 - (index & 7));
          index++;
        }
      }
    }
  }

  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const invert = [
        (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
        (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
        ((x * y) % 2) + ((x * y) % 3) === 0,
        (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
        (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
      ][mask];
      if (!reserved[y][x] && invert) modules[y][x] = !modules[y][x];
    }
  };
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const score = penalty(modules, size);
    if (score < bestScore) { best = mask; bestScore = score; }
    applyMask(mask);
  }
  applyMask(best);
  drawFormat(best);
  return modules;
}

/** An SVG path for the code with the four-module blank border QR readers need, and the side length to use as the viewBox. */
export function qrSvgPath(matrix: boolean[][]): { path: string; size: number } {
  const border = 4;
  let path = "";
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + border} ${y + border}h1v1h-1z`; }));
  return { path, size: matrix.length + border * 2 };
}
