/*
 * QR Code generator library (JavaScript)
 *
 * Copyright (c) Project Nayuki
 * MIT License. See https://www.nayuki.io/page/qr-code-generator-library
 */

"use strict";

var qrcodegen = {};

qrcodegen.QrCode = class {
  constructor(version, errorCorrectionLevel, dataCodewords, mask) {
    if (version < 1 || version > 40) {
      throw new RangeError("Version value out of range");
    }
    if (mask < -1 || mask > 7) {
      throw new RangeError("Mask value out of range");
    }

    this.version = version;
    this.errorCorrectionLevel = errorCorrectionLevel;
    this.size = version * 4 + 17;
    this.mask = mask;

    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.modules = this.makeBaseMatrix();
    this.isFunction = this.makeFunctionModules();
    this.drawCodewords(allCodewords);

    if (mask === -1) {
      let minPenalty = 1e9;
      let bestMask = 0;
      for (let i = 0; i < 8; i += 1) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          minPenalty = penalty;
          bestMask = i;
        }
        this.applyMask(i);
      }
      this.mask = bestMask;
    }

    this.applyMask(this.mask);
    this.drawFormatBits(this.mask);
    if (this.version >= 7) {
      this.drawVersion();
    }
  }

  static encodeText(text, ecl) {
    const segs = qrcodegen.QrSegment.makeSegments(text);
    return qrcodegen.QrCode.encodeSegments(segs, ecl);
  }

  static encodeBinary(data, ecl) {
    const seg = qrcodegen.QrSegment.makeBytes(data);
    return qrcodegen.QrCode.encodeSegments([seg], ecl);
  }

  static encodeSegments(
    segs,
    ecl,
    minVersion = 1,
    maxVersion = 40,
    mask = -1,
    boostEcl = true
  ) {
    if (!(minVersion >= 1 && minVersion <= maxVersion && maxVersion <= 40)) {
      throw new RangeError("Invalid version range");
    }

    let version = minVersion;
    let dataCapacityBits = 0;
    for (; version <= maxVersion; version += 1) {
      dataCapacityBits = qrcodegen.QrCode.getNumDataCodewords(version, ecl) * 8;
      const usedBits = qrcodegen.QrSegment.getTotalBits(segs, version);
      if (usedBits !== null && usedBits <= dataCapacityBits) {
        break;
      }
    }

    if (version > maxVersion) {
      throw new RangeError("Data too long");
    }

    if (boostEcl) {
      for (const newEcl of [
        qrcodegen.QrCode.Ecc.MEDIUM,
        qrcodegen.QrCode.Ecc.QUARTILE,
        qrcodegen.QrCode.Ecc.HIGH,
      ]) {
        if (qrcodegen.QrCode.getNumDataCodewords(version, newEcl) * 8 >=
            qrcodegen.QrSegment.getTotalBits(segs, version)) {
          ecl = newEcl;
        }
      }
    }

    const bb = [];
    for (const seg of segs) {
      qrcodegen.QrCode.appendBits(seg.mode.modeBits, 4, bb);
      qrcodegen.QrCode.appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
      for (const bit of seg.data) {
        bb.push(bit);
      }
    }

    const dataUsedBits = bb.length;
    if (dataUsedBits > dataCapacityBits) {
      throw new RangeError("Data too long");
    }

    qrcodegen.QrCode.appendBits(0, Math.min(4, dataCapacityBits - dataUsedBits), bb);
    while (bb.length % 8 !== 0) {
      bb.push(false);
    }

    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (bb.length < dataCapacityBits) {
      qrcodegen.QrCode.appendBits(padBytes[padIndex], 8, bb);
      padIndex = (padIndex + 1) % padBytes.length;
    }

    const dataCodewords = [];
    for (let i = 0; i < bb.length; i += 8) {
      let val = 0;
      for (let j = 0; j < 8; j += 1) {
        val = (val << 1) | (bb[i + j] ? 1 : 0);
      }
      dataCodewords.push(val);
    }

    return new qrcodegen.QrCode(version, ecl, dataCodewords, mask);
  }

  getModule(x, y) {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      throw new RangeError("QR module out of bounds");
    }
    return this.modules[y][x];
  }

  addEccAndInterleave(data) {
    const numBlocks = qrcodegen.QrCode.NUM_ERROR_CORRECTION_BLOCKS[this.errorCorrectionLevel.ordinal][
      this.version
    ];
    const blockEccLen = qrcodegen.QrCode.ECC_CODEWORDS_PER_BLOCK[this.errorCorrectionLevel.ordinal][
      this.version
    ];
    const rawCodewords = qrcodegen.QrCode.getNumRawDataModules(this.version) / 8;
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks = [];
    let k = 0;
    for (let i = 0; i < numBlocks; i += 1) {
      const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const block = data.slice(k, k + dataLen);
      k += dataLen;

      const ecc = qrcodegen.QrCode.reedSolomonComputeRemainder(
        block,
        qrcodegen.QrCode.reedSolomonComputeDivisor(blockEccLen)
      );
      blocks.push(block.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i += 1) {
      for (const block of blocks) {
        if (i < block.length) {
          result.push(block[i]);
        }
      }
    }
    return result;
  }

  makeBaseMatrix() {
    const size = this.size;
    const modules = new Array(size);
    for (let y = 0; y < size; y += 1) {
      modules[y] = new Array(size).fill(false);
    }
    return modules;
  }

  makeFunctionModules() {
    const size = this.size;
    const isFunction = new Array(size);
    for (let y = 0; y < size; y += 1) {
      isFunction[y] = new Array(size).fill(false);
    }

    this.drawFinderPattern(3, 3, isFunction);
    this.drawFinderPattern(size - 4, 3, isFunction);
    this.drawFinderPattern(3, size - 4, isFunction);

    for (let i = 0; i < size; i += 1) {
      if (!isFunction[6][i]) {
        isFunction[6][i] = true;
      }
      if (!isFunction[i][6]) {
        isFunction[i][6] = true;
      }
    }

    if (this.version >= 2) {
      const positions = qrcodegen.QrCode.getAlignmentPatternPositions(this.version);
      for (const y of positions) {
        for (const x of positions) {
          if (!isFunction[y][x]) {
            this.drawAlignmentPattern(x, y, isFunction);
          }
        }
      }
    }

    this.drawFunctionPatterns(isFunction);

    return isFunction;
  }

  drawFunctionPatterns(isFunction) {
    const size = this.size;
    for (let i = 0; i < size; i += 1) {
      if (!isFunction[6][i]) {
        this.modules[6][i] = i % 2 === 0;
        isFunction[6][i] = true;
      }
      if (!isFunction[i][6]) {
        this.modules[i][6] = i % 2 === 0;
        isFunction[i][6] = true;
      }
    }

    this.modules[size - 8][8] = true;
    isFunction[size - 8][8] = true;
  }

  drawFinderPattern(x, y, isFunction) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= this.size || yy < 0 || yy >= this.size) {
          continue;
        }
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const on = dist !== 2 && dist !== 4;
        this.modules[yy][xx] = on;
        isFunction[yy][xx] = true;
      }
    }
  }

  drawAlignmentPattern(x, y, isFunction) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const on = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
        this.modules[y + dy][x + dx] = on;
        isFunction[y + dy][x + dx] = true;
      }
    }
  }

  drawCodewords(data) {
    let i = 0;
    let dir = -1;
    for (let x = this.size - 1; x >= 1; x -= 2) {
      if (x === 6) {
        x -= 1;
      }
      for (let y = 0; y < this.size; y += 1) {
        const yy = dir === 1 ? y : this.size - 1 - y;
        for (let dx = 0; dx < 2; dx += 1) {
          const xx = x - dx;
          if (!this.isFunction[yy][xx]) {
            const bit = ((data[Math.floor(i / 8)] >>> (7 - (i % 8))) & 1) !== 0;
            this.modules[yy][xx] = bit;
            i += 1;
          }
        }
      }
      dir = -dir;
    }
  }

  applyMask(mask) {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.isFunction[y][x]) {
          continue;
        }
        let invert = false;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            throw new RangeError("Invalid mask");
        }
        if (invert) {
          this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  }

  drawFormatBits(mask) {
    const data = (this.errorCorrectionLevel.formatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) {
      rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) {
      this.setFunctionModule(8, i, ((bits >>> i) & 1) !== 0);
    }
    this.setFunctionModule(8, 7, ((bits >>> 6) & 1) !== 0);
    this.setFunctionModule(8, 8, ((bits >>> 7) & 1) !== 0);
    this.setFunctionModule(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i += 1) {
      this.setFunctionModule(14 - i, 8, ((bits >>> i) & 1) !== 0);
    }
    for (let i = 0; i < 8; i += 1) {
      this.setFunctionModule(this.size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    }
    for (let i = 8; i < 15; i += 1) {
      this.setFunctionModule(8, this.size - 15 + i, ((bits >>> i) & 1) !== 0);
    }
    this.setFunctionModule(8, this.size - 8, true);
  }

  drawVersion() {
    let rem = this.version;
    for (let i = 0; i < 12; i += 1) {
      rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1f25);
    }
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  }

  setFunctionModule(x, y, isDark) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  }

  getPenaltyScore() {
    let result = 0;
    for (let y = 0; y < this.size; y += 1) {
      let runColor = false;
      let runX = 0;
      const row = this.modules[y];
      for (let x = 0; x < this.size; x += 1) {
        if (row[x] === runColor) {
          runX += 1;
          if (runX === 5) {
            result += 3;
          } else if (runX > 5) {
            result += 1;
          }
        } else {
          runColor = row[x];
          runX = 1;
        }
      }
    }

    for (let x = 0; x < this.size; x += 1) {
      let runColor = false;
      let runY = 0;
      for (let y = 0; y < this.size; y += 1) {
        if (this.modules[y][x] === runColor) {
          runY += 1;
          if (runY === 5) {
            result += 3;
          } else if (runY > 5) {
            result += 1;
          }
        } else {
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
    }

    for (let y = 0; y < this.size - 1; y += 1) {
      for (let x = 0; x < this.size - 1; x += 1) {
        const color = this.modules[y][x];
        if (
          color === this.modules[y][x + 1] &&
          color === this.modules[y + 1][x] &&
          color === this.modules[y + 1][x + 1]
        ) {
          result += 3;
        }
      }
    }

    const finderPenalty = [true, false, true, true, true, false, true, false, false, false, false];
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size - 10; x += 1) {
        let match = true;
        for (let k = 0; k < 11; k += 1) {
          if (this.modules[y][x + k] !== finderPenalty[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          result += 40;
        }
      }
    }

    for (let x = 0; x < this.size; x += 1) {
      for (let y = 0; y < this.size - 10; y += 1) {
        let match = true;
        for (let k = 0; k < 11; k += 1) {
          if (this.modules[y + k][x] !== finderPenalty[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          result += 40;
        }
      }
    }

    let dark = 0;
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.modules[y][x]) {
          dark += 1;
        }
      }
    }
    const total = this.size * this.size;
    const k = Math.abs(dark * 20 - total * 10) / total;
    result += k * 10;

    return result;
  }

  static appendBits(val, len, bb) {
    if (len < 0 || len > 31 || (val >>> len) !== 0) {
      throw new RangeError("Value out of range");
    }
    for (let i = len - 1; i >= 0; i -= 1) {
      bb.push(((val >>> i) & 1) !== 0);
    }
  }

  static getAlignmentPatternPositions(version) {
    if (version === 1) {
      return [];
    }
    const numAlign = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 17 - 13) / (numAlign * 2 - 2)) * 2;
    const positions = [6];
    for (let i = 1; i < numAlign - 1; i += 1) {
      positions.push(this.sizeFromVersion(version) - 7 - (numAlign - 2 - i) * step);
    }
    positions.push(this.sizeFromVersion(version) - 7);
    return positions;
  }

  static sizeFromVersion(version) {
    return version * 4 + 17;
  }

  static getNumRawDataModules(version) {
    const size = qrcodegen.QrCode.sizeFromVersion(version);
    let result = size * size;
    result -= 8 * 8 * 3;
    result -= 15 * 2 + 1;
    result -= (size - 16) * 2;
    if (version >= 2) {
      const numAlign = Math.floor(version / 7) + 2;
      result -= (numAlign - 1) * (numAlign - 1) * 25;
      result -= (numAlign - 2) * 2 * 20;
    }
    if (version >= 7) {
      result -= 18 * 2;
    }
    return result;
  }

  static getNumDataCodewords(version, ecl) {
    return (
      qrcodegen.QrCode.getNumRawDataModules(version) / 8 -
      qrcodegen.QrCode.ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][version] *
        qrcodegen.QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][version]
    );
  }

  static reedSolomonComputeDivisor(degree) {
    let result = [1];
    for (let i = 0; i < degree; i += 1) {
      const factor = qrcodegen.QrCode.reedSolomonMultiply(1, 1 << i);
      result.push(0);
      for (let j = result.length - 1; j > 0; j -= 1) {
        result[j] = result[j] ^ qrcodegen.QrCode.reedSolomonMultiply(result[j - 1], factor);
      }
    }
    return result;
  }

  static reedSolomonComputeRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < result.length; i += 1) {
        result[i] ^= qrcodegen.QrCode.reedSolomonMultiply(divisor[i], factor);
      }
    }
    return result;
  }

  static reedSolomonMultiply(x, y) {
    if (x === 0 || y === 0) {
      return 0;
    }
    let z = 0;
    for (let i = 0; i < 8; i += 1) {
      if ((y & 1) !== 0) {
        z ^= x;
      }
      const carry = x & 0x80;
      x = (x << 1) & 0xff;
      if (carry !== 0) {
        x ^= 0x1d;
      }
      y >>>= 1;
    }
    return z;
  }
};

qrcodegen.QrCode.Ecc = class {
  constructor(ordinal, formatBits) {
    this.ordinal = ordinal;
    this.formatBits = formatBits;
  }
};

qrcodegen.QrCode.Ecc.LOW = new qrcodegen.QrCode.Ecc(0, 1);
qrcodegen.QrCode.Ecc.MEDIUM = new qrcodegen.QrCode.Ecc(1, 0);
qrcodegen.QrCode.Ecc.QUARTILE = new qrcodegen.QrCode.Ecc(2, 3);
qrcodegen.QrCode.Ecc.HIGH = new qrcodegen.QrCode.Ecc(3, 2);

qrcodegen.QrSegment = class {
  constructor(mode, numChars, data) {
    this.mode = mode;
    this.numChars = numChars;
    this.data = data;
  }

  static makeBytes(data) {
    const bb = [];
    for (const b of data) {
      qrcodegen.QrCode.appendBits(b, 8, bb);
    }
    return new qrcodegen.QrSegment(qrcodegen.QrSegment.Mode.BYTE, data.length, bb);
  }

  static makeSegments(text) {
    return [qrcodegen.QrSegment.makeBytes(qrcodegen.QrSegment.toUtf8ByteArray(text))];
  }

  static toUtf8ByteArray(text) {
    const result = [];
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      if (c < 0x80) {
        result.push(c);
      } else if (c < 0x800) {
        result.push(0xc0 | (c >>> 6));
        result.push(0x80 | (c & 0x3f));
      } else if (c < 0xd800 || c >= 0xe000) {
        result.push(0xe0 | (c >>> 12));
        result.push(0x80 | ((c >>> 6) & 0x3f));
        result.push(0x80 | (c & 0x3f));
      } else {
        i += 1;
        const c2 = text.charCodeAt(i);
        const codePoint = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
        result.push(0xf0 | (codePoint >>> 18));
        result.push(0x80 | ((codePoint >>> 12) & 0x3f));
        result.push(0x80 | ((codePoint >>> 6) & 0x3f));
        result.push(0x80 | (codePoint & 0x3f));
      }
    }
    return result;
  }

  static getTotalBits(segs, version) {
    let result = 0;
    for (const seg of segs) {
      const ccbits = seg.mode.numCharCountBits(version);
      if (seg.numChars >= 1 << ccbits) {
        return null;
      }
      result += 4 + ccbits + seg.data.length;
    }
    return result;
  }
};

qrcodegen.QrSegment.Mode = class {
  constructor(modeBits, numCharCountBits) {
    this.modeBits = modeBits;
    this.numCharCountBitsTable = numCharCountBits;
  }

  numCharCountBits(version) {
    if (version < 1 || version > 40) {
      throw new RangeError("Invalid version");
    }
    if (version <= 9) {
      return this.numCharCountBitsTable[0];
    }
    if (version <= 26) {
      return this.numCharCountBitsTable[1];
    }
    return this.numCharCountBitsTable[2];
  }
};

qrcodegen.QrSegment.Mode.BYTE = new qrcodegen.QrSegment.Mode(0x4, [8, 16, 16]);

qrcodegen.QrCode.ECC_CODEWORDS_PER_BLOCK = [
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

qrcodegen.QrCode.NUM_ERROR_CORRECTION_BLOCKS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
