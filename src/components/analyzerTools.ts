declare let DecoderModule: any;
declare let TextDecoder: any;

export const TRACE_RENDERING = 0;

const YUV2RGB_TABLE = new Uint32Array(256 * 256 * 256);
function YUV2RGB(y, u, v) {
  return YUV2RGB_TABLE[(y << 16) | (u << 8) | v];
}
export function clamp(v, a, b) {
  if (v < a) v = a;
  if (v > b) v = b;
  return v;
}
function computeYUV2RGB(y, u, v) {
  const rTmp = y + 1.370705 * (v - 128);
  const gTmp = y - 0.698001 * (v - 128) - 0.337633 * (u - 128);
  const bTmp = y + 1.732446 * (u - 128);
  const r = clamp(rTmp | 0, 0, 255) | 0;
  const g = clamp(gTmp | 0, 0, 255) | 0;
  const b = clamp(bTmp | 0, 0, 255) | 0;
  return (b << 16) | (g << 8) | (r << 0);
}
function buildYUVTable() {
  for (let y = 0; y < 256; y++) {
    for (let u = 0; u < 256; u++) {
      for (let v = 0; v < 256; v++) {
        YUV2RGB_TABLE[(y << 16) | (u << 8) | v] = computeYUV2RGB(y, u, v);
      }
    }
  }
}
buildYUVTable();

export interface FrameImagePlane {
  buffer: ArrayBuffer;
  depth: number;
  width: number;
  height: number;
  stride: number;
  xdec: number;
  ydec: number;
}

export interface FrameImage {
  hashCode: number;
  Y: FrameImagePlane;
  U: FrameImagePlane;
  V: FrameImagePlane;
}

function createImageData(image: FrameImage, plane = -1) {
  const w = image.Y.width;
  const h = image.Y.height;
  const depth = image.Y.depth;
  assert(depth == 8);

  const YH = new Uint8Array(image.Y.buffer);
  const UH = new Uint8Array(image.U.buffer);
  const VH = new Uint8Array(image.V.buffer);

  const Ys = image.Y.stride;
  const Us = image.U.stride;
  const Vs = image.V.stride;

  const imageData = new ImageData(w, h);
  const I = imageData.data;

  const p = 0;
  let bgr = 0;
  const uxdec = image.U.xdec;
  const vxdec = image.V.xdec;
  const uydec = image.U.ydec;
  const vydec = image.V.ydec;
  for (let y = 0; y < h; y++) {
    const yYs = y * Ys;
    const yUs = (y >> uydec) * Us;
    const yVs = (y >> vydec) * Vs;
    for (let x = 0; x < w; x++) {
      const Y = YH[yYs + x];
      const U = UH[yUs + (x >> uxdec)];
      const V = VH[yVs + (x >> vxdec)];
      bgr = YUV2RGB(Y, U, V);
      let r, g, b;
      if (plane === 0) {
        r = Y;
        g = Y;
        b = Y;
      } else if (plane == 1) {
        r = U;
        g = U;
        b = U;
      } else if (plane == 2) {
        r = V;
        g = V;
        b = V;
      } else {
        r = (bgr >> 0) & 0xff;
        g = (bgr >> 8) & 0xff;
        b = (bgr >> 16) & 0xff;
      }
      const index = (Math.imul(y, w) + x) << 2;
      I[index + 0] = r;
      I[index + 1] = g;
      I[index + 2] = b;
      I[index + 3] = 255;
    }
  }
  return imageData;
}

function makeCanvas(image: FrameImage, plane = -1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const imageData = createImageData(image, plane);
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function makePattern(uri: string, scale: number, ready: (canvas: HTMLCanvasElement) => void) {
  const image = new Image();
  image.onload = function () {
    const canvas = document.createElement('canvas');
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
    ready(canvas);
  };
  image.src = uri;
}
export function assert(c: any, message = '') {
  if (!c) {
    throw new Error(message);
  }
}

export function unreachable() {
  throw new Error('Unreachable');
}

export function hashString(s: string) {
  let hashValue = 0;
  if (s.length === 0) {
    return hashValue;
  }
  for (let i = 0; i < s.length; i++) {
    hashValue = (hashValue << 5) - hashValue + s.charCodeAt(i);
    hashValue |= 0;
  }
  return hashValue >>> 0;
}

// Use 31 colors, don't use 32 colors since hash(string) % 32 can cause colors
// collisions.
export const COLORS = [
  '#126800',
  '#3e2dd5',
  '#87ba00',
  '#305eff',
  '#8eda53',
  '#37007f',
  '#e1c633',
  '#0055d0',
  '#ffab28',
  '#00267a',
  '#fc6800',
  '#016fc7',
  '#6e9000',
  '#b2007c',
  '#00ae63',
  '#d80048',
  '#00caed',
  '#a31500',
  '#02a4e3',
  '#ff4553',
  '#003d5b',
  '#ff6c7e',
  '#2a3700',
  '#ff95c5',
  '#a9d19d',
  '#5e0060',
  '#8f5600',
  '#dcbaed',
  '#511500',
  '#f3b9a2',
  '#5b0022',
];

export const HEAT_COLORS = [];
function generateHeatColors() {
  function color(value) {
    const h = (1.0 - value) * 240;
    return 'hsl(' + h + ', 100%, 50%)';
  }
  for (let i = 0; i < 256; i++) {
    HEAT_COLORS.push(color(i / 256));
  }
}
generateHeatColors();

export class AccountingSymbol {
  constructor(public name: string, public bits: number, public samples: number, public x: number, public y: number) {
    // ...
  }
}

export type AccountingSymbolMap = { [name: string]: AccountingSymbol };

export class Accounting {
  symbols: AccountingSymbol[] = null;
  frameSymbols: AccountingSymbolMap = null;
  constructor(symbols: AccountingSymbol[] = []) {
    this.symbols = symbols;
  }
  createFrameSymbols() {
    if (this.frameSymbols) {
      return this.frameSymbols;
    }
    this.frameSymbols = Object.create(null);
    this.frameSymbols = Accounting.flatten(this.symbols);
    return this.frameSymbols;
  }
  countCache: { [filter: string]: { blocks: number[][]; total: number; leftover: number } } = {};
  countBits(filter: string): { blocks: number[][]; total: number } {
    if (!filter) {
      filter = '__none__';
    }
    if (this.countCache[filter]) {
      return this.countCache[filter];
    }
    const blocks = [];
    let total = 0;
    let leftover = 0;
    this.symbols.forEach((symbol) => {
      if (filter !== '__none__' && symbol.name != filter) {
        return;
      }
      const { x, y } = symbol;
      if (x < 0 || y < 0) {
        leftover += symbol.bits;
        return;
      }
      if (!blocks[y]) {
        blocks[y] = [];
      }
      if (blocks[y][x] === undefined) {
        blocks[y][x] = 0;
      }
      blocks[y][x] += symbol.bits;
      total += symbol.bits;
    });
    return (this.countCache[filter] = { blocks: blocks, total, leftover });
  }
  createBlockSymbols(c: number, r: number) {
    return Accounting.flatten(
      this.symbols.filter((symbol) => {
        return symbol.x === c && symbol.y === r;
      }),
    );
  }
  static flatten(sybmols: AccountingSymbol[]): AccountingSymbolMap {
    const map = Object.create(null);
    sybmols.forEach((symbol) => {
      let s = map[symbol.name];
      if (!s) {
        s = map[symbol.name] = new AccountingSymbol(symbol.name, 0, 0, symbol.x, symbol.y);
      }
      s.bits += symbol.bits;
      s.samples += symbol.samples;
    });
    const ret = Object.create(null);
    const names = [];
    for (const name in map) names.push(name);
    // Sort by bits.
    names.sort((a, b) => map[b].bits - map[a].bits);
    names.forEach((name) => {
      ret[name] = map[name];
    });
    return ret;
  }

  static getSortedSymbolNames(accountings: Accounting[]): string[] {
    const set = {};
    accountings.forEach((accounting) => {
      const frameSymbols = accounting.createFrameSymbols();
      for (const name in frameSymbols) {
        set[name] = undefined;
      }
    });
    const names = Object.keys(set);
    names.sort();
    return names;
  }
}

export class Histogram {
  constructor(public counts: { [id: string]: number }, public names: { [id: string]: number }) {
    // ...
  }
}

export interface FilmGrainParams {
  scaling_lut_y: number[];
  scaling_lut_cr: number[];
  scaling_lut_cb: number[];
  grain_sample_y: number[][];
  grain_sample_cb: number[][];
  grain_sample_cr: number[][];
  normalizedGrain_y: number[][];
  normalizedGrain_cb: number[][];
  normalizedGrain_cr: number[][];
  ar_coeff_lag: number;
  ar_coeff_shift: number;
  overlap_flag: number;
  random_seed: number;
  chroma_scaling_from_luma: number;
  grain_scale_shift: number;
  scaling_shift: number;
  cb_mult: number;
  cb_luma_mult: number;
  bit_depth: number;
}

export class AnalyzerFrame {
  json: {
    frameType: number;
    showFrame: number;
    baseQIndex: number;
    filter_level_y1: number;
    filter_level_y2: number;
    filter_level_u: number;
    filter_level_v: number;
    restoration_type_y: number;
    restoration_type_u: number;
    restoration_type_v: number;
    clpfSize: number;
    clpfStrengthY: number;
    deltaQRes: number;
    deltaQPresentFlag: number;
    config: {
      MI_SIZE: number;
    };
    filmGrainParamsPresent: boolean;
    filmGrainParams?: FilmGrainParams;
  };
  accounting: Accounting;
  blockSizeHist: Histogram;
  transformSizeHist: Histogram;
  transformTypeHist: Histogram;
  predictionModeHist: Histogram;
  uvPredictionModeHist: Histogram;
  skipHist: Histogram;
  dualFilterTypeHist: Histogram;
  compoundTypeHist: Histogram;
  motionModeHist: Histogram;
  frameImage: FrameImage;
  grainFrameImage: FrameImage;
  scaledGrainImage: FrameImage;
  oldImage: FrameImage;
  decodeTime: number;
  canvasImage: HTMLCanvasElement;
  canvasGrainImage: HTMLCanvasElement[];
  scaledGrainCanvas: HTMLCanvasElement[];
  oldImageCanvas: HTMLCanvasElement[];
  imageCanvas: HTMLCanvasElement[];

  constructor() {
    this.canvasGrainImage = [null, null, null, null];
    this.scaledGrainCanvas = [null, null, null, null];
    this.oldImageCanvas = [null, null, null, null];
    this.imageCanvas = [null, null, null, null];
  }

  get image(): HTMLCanvasElement {
    return this.getImage(-1);
  }

  getImage(plane: number): HTMLCanvasElement {
    const index = plane < 3 && plane >= 0 ? plane : 4;

    if (this.imageCanvas[index]) {
      return this.imageCanvas[index];
    }

    this.imageCanvas[index] = makeCanvas(this.frameImage, plane);
    if (!this.imageCanvas.includes(null)) {
      this.frameImage = null;
    }

    return this.imageCanvas[index];
  }

  getOldImage(plane: number): HTMLCanvasElement {
    const index = plane < 3 && plane >= 0 ? plane : 4;

    if (this.oldImageCanvas[index]) {
      return this.oldImageCanvas[index];
    }

    this.oldImageCanvas[index] = makeCanvas(this.oldImage, plane);
    if (!this.oldImageCanvas.includes(null)) {
      this.oldImage = null;
    }

    return this.oldImageCanvas[index];
  }

  getGrainImage(plane: number): HTMLCanvasElement {
    const index = plane < 3 && plane >= 0 ? plane : 4;

    if (this.canvasGrainImage[index]) {
      return this.canvasGrainImage[index];
    }

    this.canvasGrainImage[index] = makeCanvas(this.grainFrameImage, plane);
    if (!this.canvasGrainImage.includes(null)) {
      this.grainFrameImage = null;
    }

    return this.canvasGrainImage[index];
  }

  getScaledGrainImage(plane: number): HTMLCanvasElement {
    const index = plane < 3 && plane >= 0 ? plane : 4;

    if (this.scaledGrainCanvas[index]) {
      return this.scaledGrainCanvas[index];
    }

    this.scaledGrainCanvas[index] = makeCanvas(this.scaledGrainImage, plane);
    if (!this.scaledGrainCanvas.includes(null)) {
      this.scaledGrainImage = null;
    }

    return this.scaledGrainCanvas[index];
  }

  normalizeGrainSamples(index: number) {
    let grain;

    switch (index) {
      case 0:
        grain = this.json.filmGrainParams.grain_sample_y;
        break;
      case 1:
        grain = this.json.filmGrainParams.grain_sample_cb;
        break;
      default:
        grain = this.json.filmGrainParams.grain_sample_cr;
    }

    const minY = Math.min(...[].concat(...grain));
    const maxY = Math.max(...[].concat(...grain));

    let normalizedGrain = grain.map((val) =>
      val.map((subVal) => {
        const z = ((subVal - minY) / (maxY - minY)) * 255;
        return Math.round(z);
      }),
    );

    if (index == 0) {
      normalizedGrain = normalizedGrain.slice(9).map((k) => k.slice(9, 82 - 9));
      this.json.filmGrainParams.normalizedGrain_y = normalizedGrain;
    } else if (index == 1) {
      normalizedGrain = normalizedGrain.slice(6).map((k) => k.slice(6, 44 - 6));
      this.json.filmGrainParams.normalizedGrain_cb = normalizedGrain;
    } else {
      normalizedGrain = normalizedGrain.slice(6).map((k) => k.slice(6, 44 - 6));
      this.json.filmGrainParams.normalizedGrain_cr = normalizedGrain;
    }
  }
  config: string;
  blockSizeLog2Map: [number, number][];
  transformSizeLog2Map: [number, number][];
  miSizeLog2: number;
  miSuperSizeLog2: number;
}

function getAccountingFromJson(json: any, name: string): Accounting {
  const accounting = new Accounting();
  if (json[name]) {
    const names = json[name + 'Map'];
    const symbols = [];
    let x = -1,
      y = -1;
    for (let i = 0; i < json.symbols.length; i++) {
      const symbol = json.symbols[i];
      if (symbol.length == 2) {
        x = symbol[0];
        y = symbol[1];
      } else {
        const name = symbol[0];
        const bits = symbol[1];
        const samples = symbol[2];
        symbols.push(new AccountingSymbol(names[name], bits, samples, x, y));
      }
    }
    accounting.symbols = symbols;
  }
  return accounting;
}

function getHistogramFromJson(json: any, name: string): Histogram {
  if (!json[name]) {
    return null;
  }
  const counts = {};
  json[name].forEach((row) => {
    row.forEach((v) => {
      if (counts[v] === undefined) {
        counts[v] = 0;
      }
      counts[v]++;
    });
  });
  return new Histogram(counts, json[name + 'Map']);
}

/**
 * JSON arrays are RLE encoded. ..., x, [12], ... means that x repeats itself
 * an additional 12 times. The RLE marker is a single element array.
 */
function uncompressArray(src: any[]) {
  let pre;
  const dst = [];
  let allUint8 = true;
  for (let i = 0; i < src.length; i++) {
    if (Array.isArray(src[i]) && src[i].length == 1) {
      const count = src[i][0];
      for (let j = 0; j < count; j++) {
        dst.push(pre);
      }
      pre = undefined;
    } else {
      pre = src[i];
      dst.push(pre);
      if (pre !== (pre & 0xff)) {
        allUint8 = false;
      }
    }
  }
  if (allUint8) {
    return new Uint8Array(dst);
  }
  return dst;
}

function uncompress(arrays) {
  if (!arrays) {
    return;
  }
  for (let i = 0; i < arrays.length; i++) {
    arrays[i] = uncompressArray(arrays[i]);
  }
}

function readFrameFromJson(json): AnalyzerFrame {
  uncompress(json['blockSize']);
  uncompress(json['transformSize']);
  uncompress(json['transformType']);
  uncompress(json['mode']);
  uncompress(json['uv_mode']);
  uncompress(json['skip']);
  uncompress(json['filter']);
  uncompress(json['cdef_level']);
  uncompress(json['cdef_strength']);
  uncompress(json['motionVectors']);
  uncompress(json['referenceFrame']);
  uncompress(json['cfl_alpha_idx']);
  uncompress(json['cfl_alpha_sign']);
  uncompress(json['dualFilterType']);
  uncompress(json['delta_q']);
  uncompress(json['seg_id']);
  uncompress(json['motion_mode']);
  uncompress(json['compound_type']);
  uncompress(json['wedge']);

  const frame = new AnalyzerFrame();
  frame.json = json;
  frame.accounting = getAccountingFromJson(json, 'symbols');
  frame.blockSizeHist = getHistogramFromJson(json, 'blockSize');
  frame.skipHist = getHistogramFromJson(json, 'skip');
  frame.transformSizeHist = getHistogramFromJson(json, 'transformSize');
  frame.transformTypeHist = getHistogramFromJson(json, 'transformType');
  frame.predictionModeHist = getHistogramFromJson(json, 'mode');
  frame.uvPredictionModeHist = getHistogramFromJson(json, 'uv_mode');
  frame.dualFilterTypeHist = getHistogramFromJson(json, 'dualFilterType');
  frame.motionModeHist = getHistogramFromJson(json, 'motion_mode');
  frame.compoundTypeHist = getHistogramFromJson(json, 'compound_type');
  frame.miSizeLog2 = log2(json.config.MI_SIZE);
  frame.miSuperSizeLog2 = log2(64); // TODO: Does this ever change?
  frame.blockSizeLog2Map = makeBlockSizeLog2MapByValue(json['blockSizeMap']);
  frame.transformSizeLog2Map = makeTransformSizeLog2MapByValue(json['transformSizeMap']);

  if (frame.json.filmGrainParamsPresent) {
    frame.normalizeGrainSamples(0);
    frame.normalizeGrainSamples(1);
    frame.normalizeGrainSamples(2);
  }
  return frame;
}

export function downloadFile(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (url.startsWith(localFileProtocol)) {
      const localFile = url.substring(localFileProtocol.length);
      const file = localFiles[localFile];
      if (file) {
        resolve(new Uint8Array(file));
        return;
      } else {
        reject(`Local file "${localFile}" does not exist.`);
        return;
      }
    }
    const xhr = new XMLHttpRequest();
    const self = this;
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.send();
    xhr.addEventListener('progress', (e) => {
      const progress = (e.loaded / e.total) * 100;
    });
    xhr.addEventListener('load', function () {
      if (xhr.status != 200) {
        reject();
        return;
      }
      resolve(new Uint8Array(this.response));
    });
    xhr.addEventListener('error', function () {
      reject(`Cannot download ${url}`);
    });
  });
}

export function downloadJson(url: string): Promise<Object> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const self = this;
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.send();
    xhr.addEventListener('progress', (e) => {
      const progress = (e.loaded / e.total) * 100;
    });
    xhr.addEventListener('load', function () {
      if (xhr.status != 200) {
        reject();
        return;
      }
      resolve(this.response);
    });
  });
}

export function loadFramesFromJson(url: string): Promise<AnalyzerFrame[]> {
  return new Promise((resolve, reject) => {
    downloadJson(url).then((json: any) => {
      resolve(
        json
          .filter((frame) => !!frame)
          .map((frame) => {
            return readFrameFromJson(frame);
          }),
      );
    });
  });
}

export class Size {
  constructor(public w: number, public h: number) {
    // ...
  }
  clone() {
    return new Size(this.w, this.h);
  }
  equals(other: Size) {
    return this.w == other.w || this.h == other.h;
  }
  area(): number {
    return this.w * this.h;
  }
  multiplyScalar(scalar: number) {
    if (isFinite(scalar)) {
      this.w *= scalar;
      this.h *= scalar;
    } else {
      this.w = 0;
      this.h = 0;
    }
    return this;
  }
  roundUpToMultipleOfLog2(roundToLog2) {
    const roundTo = 1 << roundToLog2;
    this.w = (this.w + roundTo - 1) & ~(roundTo - 1);
    this.h = (this.h + roundTo - 1) & ~(roundTo - 1);
    return this;
  }
}

export class Rectangle {
  constructor(public x: number, public y: number, public w: number, public h: number) {
    // ...
  }
  static createRectangleCenteredAtPoint(v: Vector, w: number, h: number) {
    return new Rectangle(v.x - w / 2, v.y - h / 2, w, h);
  }
  static createRectangleFromSize(size: Size) {
    return new Rectangle(0, 0, size.w, size.h);
  }
  set(x: number, y: number, w: number, h: number) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    return this;
  }
  containsPoint(point: Vector): boolean {
    return point.x >= this.x && point.x < this.x + this.w && point.y >= this.y && point.y < this.y + this.h;
  }
  getCenter(): Vector {
    return new Vector(this.x + this.w / 2, this.y + this.h / 2);
  }
  clone(): Rectangle {
    return new Rectangle(this.x, this.y, this.w, this.h);
  }
  multiplyScalar(scalar: number) {
    this.x *= scalar;
    this.y *= scalar;
    this.w *= scalar;
    this.h *= scalar;
    return this;
  }
}

export class Vector {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  lerp(v: Vector, alpha: number) {
    this.x += (v.x - this.x) * alpha;
    this.y += (v.y - this.y) * alpha;
    return this;
  }
  clone(): Vector {
    return new Vector(this.x, this.y);
  }
  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  distanceTo(v: Vector) {
    const x = this.x - v.x;
    const y = this.y - v.y;
    return Math.sqrt(x * x + y * y);
  }
  normalize() {
    return this.divideScalar(this.length());
  }
  multiplyScalar(scalar) {
    if (isFinite(scalar)) {
      this.x *= scalar;
      this.y *= scalar;
    } else {
      this.x = 0;
      this.y = 0;
    }
    return this;
  }
  divide(v) {
    this.x /= v.x;
    this.y /= v.y;
    return this;
  }
  divideScalar(scalar) {
    return this.multiplyScalar(1 / scalar);
  }
  snap() {
    // TODO: Snap to nearest pixel
    this.x = this.x | 0;
    this.y = this.y | 0;
    return this;
  }
  sub(v: Vector): Vector {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }
  add(v: Vector): Vector {
    this.x += v.x;
    this.y += v.y;
    return this;
  }
  clampLength(min: number, max: number) {
    const length = this.length();
    this.multiplyScalar(Math.max(min, Math.min(max, length)) / length);
    return this;
  }
  toString(): string {
    return this.x + ',' + this.y;
  }
}

export class GridSize {
  constructor(public cols: number, public rows: number) {
    // ...
  }
}

function getFramesIvf(ivf: Uint8Array): number {
  const length = ivf.length;
  let i = 32;
  let frames = 0;
  while (i < length) {
    const frame_length = ivf[i] + (ivf[i + 1] << 8) + (ivf[i + 2] << 16) + (ivf[i + 3] << 24);
    i += 12 + frame_length;
    frames++;
  }
  return frames;
}

export class Decoder {
  worker: Worker;
  workerCallbacks = [];
  workerInfo: any = {};
  decoder: string;
  buffer: Uint8Array;
  frames: AnalyzerFrame[] = [];
  frameRate = 30;
  totalFrames: number;
  /** Whether to read image data after decoding a frame. */
  shouldReadImageData = true;

  constructor(nativeModule, worker) {
    this.buffer = new Uint8Array(0);
    this.worker = worker;
    this.initWorker();
  }

  unload() {
    this.worker = null;
    this.buffer = null;
    this.frames = null;
  }

  load(url): Promise<any> {
    if (url.indexOf('://') < 0) {
      url = window.location.origin + '/' + url;
    }
    return new Promise((resolve, reject) => {
      const id = String(Math.random());
      this.addWorkerCallback(id, (e) => {
        3;
        if (e.data.payload) {
          this.workerInfo = {
            buildConfig: e.data.payload.buildConfig,
          };
          resolve(null);
        } else {
          reject(`Cannot load decoder, check url: ${url}`);
        }
      });
      this.worker.postMessage({
        command: 'load',
        payload: [url],
        id,
      });
    });
  }

  openFileBytes(buffer: Uint8Array) {
    this.frameRate = buffer[16] | (buffer[17] << 24) | (buffer[18] << 16) | (buffer[19] << 24);
    this.totalFrames = getFramesIvf(buffer);
    this.buffer = buffer;
    this.worker.postMessage({
      command: 'openFileBytes',
      payload: buffer,
    });
  }

  setLayers(layers: number) {
    this.worker.postMessage({
      command: 'setLayers',
      payload: layers,
    });
  }

  initWorker() {
    this.worker.addEventListener('message', (e) => {
      if (!e.data.id) {
        return;
      }
      this.workerCallbacks[e.data.id](e);
      this.workerCallbacks[e.data.id] = null;
    });
  }

  addWorkerCallback(id: string, fn: (e: any) => void) {
    this.workerCallbacks[id] = fn;
  }

  /**
   * Transfer buffers back to the worker thread so they can be reused. This reduces
   * memory pressure.
   */
  releaseFrameImageBuffers(frameImage: FrameImage) {
    this.worker.postMessage(
      {
        command: 'releaseFrameBuffers',
        payload: {
          Y: frameImage.Y.buffer,
          U: frameImage.U.buffer,
          V: frameImage.V.buffer,
        },
      },
      [frameImage.Y.buffer, frameImage.U.buffer, frameImage.V.buffer],
    );
    assert(
      frameImage.Y.buffer.byteLength === 0 &&
        frameImage.U.buffer.byteLength === 0 &&
        frameImage.V.buffer.byteLength === 0,
      'Buffers must be transferred.',
    );
  }

  readFrame(): Promise<AnalyzerFrame[]> {
    const worker = this.worker;
    const self = this;
    const id = String(Math.random());
    return new Promise((resolve, reject) => {
      this.addWorkerCallback(id, function (e) {
        const o = e.data.payload.json as Object[];
        if (!o) {
          reject();
          return;
        }
        const frames: AnalyzerFrame[] = [];
        for (let i = 0; i < o.length - 1; i++) {
          const json = o[i];
          const frame = readFrameFromJson(json);
          frame.config = self.workerInfo.buildConfig;
          frames.push(frame);
          self.frames && self.frames.push(frame);
        }
        if (self.shouldReadImageData) {
          frames[frames.length - 1].frameImage = e.data.payload.image;
          frames[frames.length - 1].grainFrameImage = e.data.payload.grainImage;
          frames[frames.length - 1].scaledGrainImage = e.data.payload.scaledGrainImage;
          frames[frames.length - 1].oldImage = e.data.payload.oldImage;
        }
        frames[frames.length - 1].decodeTime = e.data.payload.decodeTime;
        resolve(frames);
      });
      const shouldReadImageData = self.shouldReadImageData;
      worker.postMessage({
        command: 'readFrame',
        id,
        shouldReadImageData,
      });
    });
  }

  static loadDecoder(url: string): Promise<Decoder> {
    return new Promise((resolve, reject) => {
      const worker = new Worker('dist/analyzer_worker.bundle.js');
      const decoder = new Decoder(null, worker);
      decoder
        .load(url)
        .then(() => {
          resolve(decoder);
        })
        .catch((x) => {
          reject(x);
        });
    });
  }
}

export const localFileProtocol = 'local://';
export const localFiles = {};

const blockSizeLog2MapByName = {
  BLOCK_2X2: [1, 1],
  BLOCK_2X4: [1, 2],
  BLOCK_4X2: [2, 1],
  BLOCK_4X4: [2, 2],
  BLOCK_4X8: [2, 3],
  BLOCK_8X4: [3, 2],
  BLOCK_8X8: [3, 3],
  BLOCK_8X16: [3, 4],
  BLOCK_16X8: [4, 3],
  BLOCK_16X16: [4, 4],
  BLOCK_16X32: [4, 5],
  BLOCK_32X16: [5, 4],
  BLOCK_32X32: [5, 5],
  BLOCK_32X64: [5, 6],
  BLOCK_64X32: [6, 5],
  BLOCK_64X64: [6, 6],
  BLOCK_64X128: [6, 7],
  BLOCK_128X64: [7, 6],
  BLOCK_128X128: [7, 7],
  BLOCK_4X16: [2, 4],
  BLOCK_16X4: [4, 2],
  BLOCK_8X32: [3, 5],
  BLOCK_32X8: [5, 3],
  BLOCK_16X64: [4, 6],
  BLOCK_64X16: [6, 4],
  BLOCK_32X128: [5, 7],
  BLOCK_128X32: [7, 5],
};

const transformSizeLog2MapByName = {
  TX_2X2: [1, 1],
  TX_4X4: [2, 2],
  TX_4X8: [2, 3],
  TX_4X16: [2, 4],
  TX_8X4: [3, 2],
  TX_8X8: [3, 3],
  TX_8X16: [3, 4],
  TX_8X32: [3, 5],
  TX_16X4: [4, 2],
  TX_16X8: [4, 3],
  TX_16X16: [4, 4],
  TX_16X32: [4, 5],
  TX_32X8: [5, 3],
  TX_32X16: [5, 4],
  TX_32X32: [5, 5],
  TX_32X64: [5, 6],
  TX_64X32: [6, 5],
  TX_64X64: [6, 6],
  TX_16X64: [4, 6],
  TX_64X16: [6, 4],
};

export function padLeft(v, n) {
  let str = String(v);
  while (str.length < n) str = ' ' + str;
  return str;
}

export function log2(n: number): number {
  switch (n) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 4:
      return 2;
    case 8:
      return 3;
    case 16:
      return 4;
    case 32:
      return 5;
    case 64:
      return 6;
    default:
      unreachable();
  }
}
export function makeBlockSizeLog2MapByValue(blockSizeMap): [number, number][] {
  const byValue = [];
  for (const key in blockSizeMap) {
    assert(key in blockSizeLog2MapByName, `Key ${key} not found in blockSizeLog2MapByName.`);
    byValue[blockSizeMap[key]] = blockSizeLog2MapByName[key];
  }
  return byValue;
}

export function makeTransformSizeLog2MapByValue(transformSizeMap): [number, number][] {
  const byValue = [];
  for (const key in transformSizeMap) {
    assert(key in transformSizeLog2MapByName, `Key ${key} not found in transformSizeLog2MapByName.`);
    byValue[transformSizeMap[key]] = transformSizeLog2MapByName[key];
  }
  return byValue;
}

export function reverseMap(map: { [name: string]: number }): { [id: number]: string } {
  const o = [];
  for (const k in map) {
    o[map[k]] = k;
  }
  return o;
}

/**
 * Hand selected using http://tools.medialab.sciences-po.fr/iwanthue/
 */
export const palette = {
  blockSize: {
    BLOCK_2X2: '#f4ffc3',
    BLOCK_2X4: '#622cd8',
    BLOCK_4X2: '#deff76',
    BLOCK_4X4: '#ff50ed',
    BLOCK_4X8: '#808900',
    BLOCK_8X4: '#014bb5',
    BLOCK_8X8: '#ffbd35',
    BLOCK_8X16: '#6895ff',
    BLOCK_16X8: '#e62b00',
    BLOCK_16X16: '#02b4e1',
    BLOCK_16X32: '#a45a00',
    BLOCK_32X16: '#00a781',
    BLOCK_32X32: '#ff70a6',
    BLOCK_32X64: '#00372a',
    BLOCK_64X32: '#ff9556',
    BLOCK_64X64: '#7a0032',
  },
  transformSize: {
    TX_2X2: '#f4ffc3',
    TX_4X4: '#622cd8',
    TX_4X8: '#deff76',
    TX_4X16: '#ff50ed',
    TX_8X4: '#808900',
    TX_8X8: '#014bb5',
    TX_8X16: '#ffbd35',
    TX_8X32: '#6895ff',
    TX_16X4: '#e62b00',
    TX_16X8: '#02b4e1',
    TX_16X16: '#a45a00',
    TX_16X32: '#00a781',
    TX_32X8: '#ff70a6',
    TX_32X16: '#00372a',
    TX_32X32: '#ff9556',
  },
  seg_id: {
    0: '#f4ffc3',
    1: '#622cd8',
    2: '#deff76',
    3: '#ff50ed',
    4: '#6895ff',
    5: '#014bb5',
    6: '#ffbd35',
    7: '#682bff',
    8: '#e62b00',
  },
  transformType: {
    DCT_DCT: '#f4ffc3',
    ADST_DCT: '#622cd8',
    DCT_ADST: '#deff76',
    ADST_ADST: '#ff50ed',
    FLIPADST_DCT: '#808900',
    DCT_FLIPADST: '#014bb5',
    FLIPADST_FLIPADST: '#ffbd35',
    ADST_FLIPADST: '#6895ff',
    FLIPADST_ADST: '#e62b00',
    IDTX: '#02b4e1',
    V_DCT: '#a45a00',
    H_DCT: '#00a781',
    V_ADST: '#ff70a6',
    H_ADST: '#00372a',
    V_FLIPADST: '#ff9556',
    H_FLIPADST: '#7a0032',
  },
  skip: {
    SKIP: '#6c0039',
    NO_SKIP: '#00d041',
  },
  motionMode: {
    SIMPLE_TRANSLATION: '#00d041',
    OBMC_CAUSAL: '#6f7dcb',
    WARPED_CAUSAL: '#b459c0',
  },
  compoundType: {
    COMPOUND_AVERAGE: '#468400',
    COMPOUND_DISTWTD: '#0164d9',
    COMPOUND_DIFFWTD: '#fdb78c',
    COMPOUND_WEDGE: '#c9004c',
  },
  wedgeType: {
    SIGN: '#a4558f',
    NO_SIGN: '#9c9c4d',
  },
  predictionMode: {
    DC_PRED: '#6c0039',
    V_PRED: '#00d041',
    H_PRED: '#801cd1',
    D45_PRED: '#a0ff78',
    D135_PRED: '#ff4ff7',
    D113_PRED: '#02c45a',
    D157_PRED: '#2d64ff',
    D203_PRED: '#91b900',
    D67_PRED: '#001d80',
    SMOOTH_PRED: '#78ff9f',
    SMOOTH_V_PRED: '#08ff9f',
    SMOOTH_H_PRED: '#f8ff9f',
    PAETH_PRED: '#410065',
    NEARESTMV: '#8affe8',
    NEARMV: '#ee007d',
    ZEROMV: '#01ad84',
    NEWMV: '#c00045',
    NEWFROMNEARMV: '#6beeff',
    NEAREST_NEARESTMV: '#af1b00',
    NEAREST_NEARMV: '#00468f',
    NEAR_NEARESTMV: '#ff5a3b',
    NEAR_NEARMV: '#007e7c',
    NEAREST_NEWMV: '#ff696f',
    NEW_NEARESTMV: '#006a43',
    NEAR_NEWMV: '#b79dff',
    NEW_NEARMV: '#b17d00',
    ZERO_ZEROMV: '#00041a',
    NEW_NEWMV: '#ffa574',
  },
  referenceFrame: {
    INTRA_FRAME: '#f4ffc3',
    LAST_FRAME: '#622cd8',
    LAST2_FRAME: '#deff76',
    LAST3_FRAME: '#ff50ed',
    GOLDEN_FRAME: '#ff50ed',
    BWDREF_FRAME: '#808900',
    ALTREF_FRAME: '#014bb5',
  },
  dualFilterType: {
    REG_REG: '#c95f3f',
    REG_SMOOTH: '#4eb7a0',
    REG_SHARP: '#b459c0',
    SMOOTH_REG: '#77b84b',
    SMOOTH_SMOOTH: '#d0406d',
    SMOOTH_SHARP: '#627e3b',
    SHARP_REG: '#6f7dcb',
    SHARP_SMOOTH: '#c29743',
    SHARP_SHARP: '#c06d93',
  },
};

export function getColor(name: string, palette = undefined): string {
  if (name === undefined) {
    console.warn('Undefined name in getColor(), make sure ENUMs are exported correctly.');
    return '#FF0000';
  }
  return (palette && palette[name]) || COLORS[hashString(name) % COLORS.length];
}
