declare let DecoderModule: any;
declare let TextDecoder: any;

export function makePattern(uri: string, scale: number, ready: (canvas: HTMLCanvasElement) => void) {
  let image = new Image();
  image.onload = function () {
    var canvas = document.createElement("canvas");
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvas.width, canvas.height);
    ready(canvas);
  }
  image.src = uri;
}
export function assert(c: boolean, message: string = "") {
  if (!c) {
    throw new Error(message);
  }
}

export function unreachable() {
  throw new Error("Unreachable");
}

export function hashString(s: string) {
  let hashValue = 0;
  if (s.length === 0) {
    return hashValue;
  }
  for (let i = 0; i < s.length; i++) {
    hashValue = ((hashValue << 5) - hashValue) + s.charCodeAt(i);
    hashValue |= 0;
  }
  return hashValue >>> 0;
}

export const COLORS_OLD = [
  "#E85EBE", "#009BFF", "#00FF00", "#0000FF", "#FF0000", "#01FFFE", "#FFA6FE",
  "#FFDB66", "#006401", "#010067", "#95003A", "#007DB5", "#FF00F6", "#FFEEE8",
  "#774D00", "#90FB92", "#0076FF", "#D5FF00", "#FF937E", "#6A826C", "#FF029D",
  "#FE8900", "#7A4782", "#7E2DD2", "#85A900", "#FF0056", "#A42400", "#00AE7E",
  "#683D3B", "#BDC6FF", "#263400", "#BDD393", "#00B917", "#9E008E", "#001544",
  "#C28C9F", "#FF74A3", "#01D0FF", "#004754", "#E56FFE", "#788231", "#0E4CA1",
  "#91D0CB", "#BE9970", "#968AE8", "#BB8800", "#43002C", "#DEFF74", "#00FFC6",
  "#FFE502", "#620E00", "#008F9C", "#98FF52", "#7544B1", "#B500FF", "#00FF78",
  "#FF6E41", "#005F39", "#6B6882", "#5FAD4E", "#A75740", "#A5FFD2", "#FFB167"
];

// Use 31 colors, don't use 32 colors since hash(string) % 32 can cause colors
// collisions.
export const COLORS = [
  "#126800",
  "#3e2dd5",
  "#87ba00",
  "#305eff",
  "#8eda53",
  "#37007f",
  "#e1c633",
  "#0055d0",
  "#ffab28",
  "#00267a",
  "#fc6800",
  "#016fc7",
  "#6e9000",
  "#b2007c",
  "#00ae63",
  "#d80048",
  "#00caed",
  "#a31500",
  "#02a4e3",
  "#ff4553",
  "#003d5b",
  "#ff6c7e",
  "#2a3700",
  "#ff95c5",
  "#a9d19d",
  "#5e0060",
  "#8f5600",
  "#dcbaed",
  "#511500",
  "#f3b9a2",
  "#5b0022"
];

export const HEAT_COLORS = [];
function generateHeatColors() {
  function color(value) {
    var h = (1.0 - value) * 240;
    return "hsl(" + h + ", 100%, 50%)";
  }
  for (let i = 0; i < 256; i++) {
    HEAT_COLORS.push(color(i / 256));
  }
}
generateHeatColors();

export function clamp(v, a, b) {
  if (v < a) {
    v = a;
  }
  if (v > b) {
    v = b;
  }
  return v;
}

let YUV2RGB_TABLE = new Uint32Array(256 * 256 * 256);

function YUV2RGB(y, u, v) {
  return YUV2RGB_TABLE[(y << 16) | (u << 8) | v];
}

function computeYUV2RGB(y, u, v) {
  let rTmp = y + (1.370705 * (v - 128));
  let gTmp = y - (0.698001 * (v - 128)) - (0.337633 * (u - 128));
  let bTmp = y + (1.732446 * (u - 128));
  let r = clamp(rTmp | 0, 0, 255) | 0;
  let g = clamp(gTmp | 0, 0, 255) | 0;
  let b = clamp(bTmp | 0, 0, 255) | 0;
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
  countCache: { [filter: string]: { blocks: number[][], total: number, leftover: number } } = {};
  countBits(filter: string): { blocks: number[][], total: number } {
    if (!filter) {
      filter = "__none__";
    }
    if (this.countCache[filter]) {
      return this.countCache[filter];
    }
    let blocks = [];
    let total = 0;
    let leftover = 0;
    this.symbols.forEach(symbol => {
      if (filter !== "__none__" && symbol.name != filter) {
        return;
      }
      let { x, y } = symbol;
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
    return this.countCache[filter] = { blocks: blocks, total, leftover };
  }
  createBlockSymbols(c: number, r: number) {
    return Accounting.flatten(this.symbols.filter(symbol => {
      return symbol.x === c && symbol.y === r;
    }));
  }
  static flatten(sybmols: AccountingSymbol[]): AccountingSymbolMap {
    let map = Object.create(null);
    sybmols.forEach(symbol => {
      let s = map[symbol.name];
      if (!s) {
        s = map[symbol.name] = new AccountingSymbol(symbol.name, 0, 0, symbol.x, symbol.y);
      }
      s.bits += symbol.bits;
      s.samples += symbol.samples;
    });
    let ret = Object.create(null);
    let names = [];
    for (let name in map) names.push(name);
    // Sort by bits.
    names.sort((a, b) => map[b].bits - map[a].bits);
    names.forEach(name => {
      ret[name] = map[name];
    });
    return ret;
  }

  static getSortedSymbolNames(accountings: Accounting[]): string[] {
    let set = {};
    accountings.forEach(accounting => {
      let frameSymbols = accounting.createFrameSymbols();
      for (let name in frameSymbols) {
        set[name] = undefined;
      }
    });
    let names = Object.keys(set);
    names.sort();
    return names;
  }
}

export class Histogram {
  constructor(
    public counts: { [id: string]: number },
    public names: { [id: string]: number }) {
    // ...
  }
}

export class AnalyzerFrame {
  json: {
    frameType: number;
    showFrame: number;
    baseQIndex: number;
    clpfSize: number;
    clpfStrengthY: number;
    config: {
      MI_SIZE: number
    };
  };
  accounting: Accounting;
  blockSizeHist: Histogram;
  transformSizeHist: Histogram;
  transformTypeHist: Histogram;
  predictionModeHist: Histogram;
  uvPredictionModeHist: Histogram;
  skipHist: Histogram;
  image: HTMLCanvasElement;
  config: string;
  blockSizeLog2Map: [number, number][];
  transformSizeLog2Map: [number, number][];
  miSizeLog2: number;
  miSuperSizeLog2: number;
}

function getAccountingFromJson(json: any, name: string): Accounting {
  var accounting = new Accounting();
  if (json[name]) {
    let names = json[name + "Map"];
    let symbols = [];
    let x = -1, y = -1;
    for (let i = 0; i < json.symbols.length; i++) {
      let symbol = json.symbols[i];
      if (symbol.length == 2) {
        x = symbol[0];
        y = symbol[1];
      } else {
        let name = symbol[0];
        let bits = symbol[1];
        let samples = symbol[2];
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
  let counts = {};
  json[name].forEach(row => {
    row.forEach(v => {
      if (counts[v] === undefined) {
        counts[v] = 0;
      }
      counts[v]++;
    });
  });
  return new Histogram(counts, json[name + "Map"]);
}

function readFrameFromJson(json): AnalyzerFrame {
  let frame = new AnalyzerFrame();
  frame.json = json;
  frame.accounting = getAccountingFromJson(json, "symbols");
  frame.blockSizeHist = getHistogramFromJson(json, "blockSize");
  frame.skipHist = getHistogramFromJson(json, "skip");
  frame.transformSizeHist = getHistogramFromJson(json, "transformSize");
  frame.transformTypeHist = getHistogramFromJson(json, "transformType");
  frame.predictionModeHist = getHistogramFromJson(json, "mode");
  frame.uvPredictionModeHist = getHistogramFromJson(json, "uv_mode");
  frame.miSizeLog2 = log2(json.config.MI_SIZE);
  frame.miSuperSizeLog2 = log2(64); // TODO: Does this ever change?
  frame.blockSizeLog2Map = makeBlockSizeLog2MapByValue(json["blockSizeMap"]);
  frame.transformSizeLog2Map = makeTransformSizeLog2MapByValue(json["transformSizeMap"]);
  return frame;
}

export function downloadFile(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (url.startsWith(localFileProtocol)) {
      let localFile = url.substring(localFileProtocol.length);
      let file = localFiles[localFile];
      if (file) {
        resolve(new Uint8Array(file));
        return;
      } else {
        reject(`Local file "${localFile}" does not exist.`);
        return;
      }
    }
    let xhr = new XMLHttpRequest();
    let self = this;
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.send();
    xhr.addEventListener("progress", (e) => {
      let progress = (e.loaded / e.total) * 100;
    });
    xhr.addEventListener("load", function () {
      if (xhr.status != 200) {
        reject();
        return;
      }
      resolve(new Uint8Array(this.response));
    });
    xhr.addEventListener("error", function () {
      reject(`Cannot download ${url}`);
    });
  });
}

export function downloadJson(url: string): Promise<Object> {
  return new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();
    let self = this;
    xhr.open("GET", url, true);
    xhr.responseType = "json";
    xhr.send();
    xhr.addEventListener("progress", (e) => {
      let progress = (e.loaded / e.total) * 100;
    });
    xhr.addEventListener("load", function () {
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
      resolve(json.filter(frame => !!frame).map(frame => {
        return readFrameFromJson(frame);
      }));
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
    let roundTo = 1 << roundToLog2;
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
    return (point.x >= this.x) &&
      (point.x < this.x + this.w) &&
      (point.y >= this.y) &&
      (point.y < this.y + this.h);
  }
  getCenter(): Vector {
    return new Vector(this.x + this.w / 2, this.y + this.h / 2);
  }
  clone(): Rectangle {
    return new Rectangle(this.x, this.y, this.w, this.h);
  }
  multiplyScalar(scalar: number) {
    if (isFinite(scalar)) {
      this.x *= scalar;
      this.y *= scalar;
      this.w *= scalar;
      this.h *= scalar;
    } else {
      this.x = 0;
      this.y = 0;
      this.w = 0;
      this.h = 0;
    }
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
    let x = this.x - v.x;
    let y = this.y - v.y;
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
    let length = this.length();
    this.multiplyScalar(Math.max(min, Math.min(max, length)) / length);
    return this;
  }
  toString(): string {
    return this.x + "," + this.y;
  }
}

export class GridSize {
  constructor(public cols: number, public rows: number) {
    // ...
  }
}

export class Decoder {
  worker: Worker;
  workerCallbacks = [];
  workerInfo: any = {};
  decoder: string;
  buffer: Uint8Array;
  frames: AnalyzerFrame[] = [];
  frameRate: number = 30;

  /** Whether to read image data after decoding a frame. */
  shouldReadImageData: boolean = true;

  constructor(nativeModule, worker) {
    this.buffer = new Uint8Array(0);
    this.worker = worker;
    this.initWorker();
  }

  load(url): Promise<any> {
    if (url.indexOf("://") < 0) {
      url = window.location.origin + '/' + url;
    }
    return new Promise((resolve, reject) => {
      var id = String(Math.random());
      this.addWorkerCallback(id, (e) => {
        3
        if (e.data.payload) {
          this.workerInfo = {
            buildConfig: e.data.payload.buildConfig
          }
          resolve();
        } else {
          reject(`Cannot load decoder, check url: ${url}`);
        }
      });
      this.worker.postMessage({
        command: "load",
        payload: [url],
        id
      });
    });
  }

  openFileBytes(buffer: Uint8Array) {
    this.frameRate = buffer[16] | buffer[17] << 24 | buffer[18] << 16 | buffer[19] << 24;
    this.buffer = buffer;
    this.worker.postMessage({
      command: "openFileBytes",
      payload: buffer
    });
  }

  setLayers(layers: number) {
    this.worker.postMessage({
      command: "setLayers",
      payload: layers
    });
  }

  initWorker() {
    this.worker.addEventListener("message", (e) => {
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

  readFrame(): Promise<AnalyzerFrame[]> {
    let worker = this.worker;
    let self = this;
    let id = String(Math.random());
    return new Promise((resolve, reject) => {
      this.addWorkerCallback(id, function (e) {
        let o = e.data.payload.json as Object[];
        if (!o) {
          reject();
          return;
        }
        let frames: AnalyzerFrame[] = [];
        for (let i = 0; i < o.length - 1; i++) {
          let json = o[i];
          let frame = readFrameFromJson(json);
          frame.config = self.workerInfo.buildConfig;
          frames.push(frame);
          self.frames.push(frame);
        }
        if (self.shouldReadImageData) {
          frames[frames.length - 1].image = self.makeCanvas(e.data.payload.image);
        }
        resolve(frames);
      });
      worker.postMessage({
        command: "readFrame",
        id
      });
    });
  }

  makeCanvas(imageData: ImageData): HTMLCanvasElement {
    var canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    var ctx = canvas.getContext("2d");
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  static loadDecoder(url: string): Promise<Decoder> {
    return new Promise((resolve, reject) => {
      let worker = new Worker("dist/analyzer_worker.bundle.js");
      let decoder = new Decoder(null, worker);
      decoder.load(url).then(() => {
        resolve(decoder);
      }).catch((x) => {
        reject(x);
      });
    });
  }
}

export let localFileProtocol = "local://";
export let localFiles = {};

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
  BLOCK_64X64: [6, 6]
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
  TX_32X32: [5, 5]
}

export function padLeft(v, n) {
  let str = String(v);
  while (str.length < n) str = " " + str;
  return str;
}

export function log2(n: number): number {
  switch (n) {
    case 1: return 0;
    case 2: return 1;
    case 4: return 2;
    case 8: return 3;
    case 16: return 4;
    case 32: return 5;
    case 64: return 6;
    default:
      unreachable();
  }
}
export function makeBlockSizeLog2MapByValue(blockSizeMap): [number, number][] {
  let byValue = [];
  for (let key in blockSizeMap) {
    byValue[blockSizeMap[key]] = blockSizeLog2MapByName[key];
  }
  return byValue;
}

export function makeTransformSizeLog2MapByValue(transformSizeMap): [number, number][] {
  let byValue = [];
  for (let key in transformSizeMap) {
    byValue[transformSizeMap[key]] = transformSizeLog2MapByName[key];
  }
  return byValue;
}

export function reverseMap(map: { [name: string]: number }): { [id: number]: string } {
  let o = [];
  for (let k in map) {
    o[map[k]] = k
  }
  return o;
}

/**
 * Hand selected using http://tools.medialab.sciences-po.fr/iwanthue/
 */
export const palette = {
  blockSize: {
    BLOCK_2X2:              "#f4ffc3",
    BLOCK_2X4:              "#622cd8",
    BLOCK_4X2:              "#deff76",
    BLOCK_4X4:              "#ff50ed",
    BLOCK_4X8:              "#808900",
    BLOCK_8X4:              "#014bb5",
    BLOCK_8X8:              "#ffbd35",
    BLOCK_8X16:             "#6895ff",
    BLOCK_16X8:             "#e62b00",
    BLOCK_16X16:            "#02b4e1",
    BLOCK_16X32:            "#a45a00",
    BLOCK_32X16:            "#00a781",
    BLOCK_32X32:            "#ff70a6",
    BLOCK_32X64:            "#00372a",
    BLOCK_64X32:            "#ff9556",
    BLOCK_64X64:            "#7a0032"
  },
  transformSize: {
    TX_2X2:                 "#f4ffc3",
    TX_4X4:                 "#622cd8",
    TX_4X8:                 "#deff76",
    TX_4X16:                "#ff50ed",
    TX_8X4:                 "#808900",
    TX_8X8:                 "#014bb5",
    TX_8X16:                "#ffbd35",
    TX_8X32:                "#6895ff",
    TX_16X4:                "#e62b00",
    TX_16X8:                "#02b4e1",
    TX_16X16:               "#a45a00",
    TX_16X32:               "#00a781",
    TX_32X8:                "#ff70a6",
    TX_32X16:               "#00372a",
    TX_32X32:               "#ff9556"
  },
  transformType: {
    DCT_DCT:                "#f4ffc3",
    ADST_DCT:               "#622cd8",
    DCT_ADST:               "#deff76",
    ADST_ADST:              "#ff50ed",
    FLIPADST_DCT:           "#808900",
    DCT_FLIPADST:           "#014bb5",
    FLIPADST_FLIPADST:      "#ffbd35",
    ADST_FLIPADST:          "#6895ff",
    FLIPADST_ADST:          "#e62b00",
    IDTX:                   "#02b4e1",
    V_DCT:                  "#a45a00",
    H_DCT:                  "#00a781",
    V_ADST:                 "#ff70a6",
    H_ADST:                 "#00372a",
    V_FLIPADST:             "#ff9556",
    H_FLIPADST:             "#7a0032"
  },
  skip: {
    SKIP:                   "#6c0039",
    NO_SKIP:                "#00d041"
  },
  predictionMode: {
    DC_PRED:                "#6c0039",
    V_PRED:                 "#00d041",
    H_PRED:                 "#801cd1",
    D45_PRED:               "#a0ff78",
    D135_PRED:              "#ff4ff7",
    D117_PRED:              "#02c45a",
    D153_PRED:              "#2d64ff",
    D207_PRED:              "#91b900",
    D63_PRED:               "#001d80",
    SMOOTH_PRED:            "#78ff9f",
    TM_PRED:                "#410065",
    NEARESTMV:              "#8affe8",
    NEARMV:                 "#ee007d",
    ZEROMV:                 "#01ad84",
    NEWMV:                  "#c00045",
    NEWFROMNEARMV:          "#6beeff",
    NEAREST_NEARESTMV:      "#af1b00",
    NEAREST_NEARMV:         "#00468f",
    NEAR_NEARESTMV:         "#ff5a3b",
    NEAR_NEARMV:            "#007e7c",
    NEAREST_NEWMV:          "#ff696f",
    NEW_NEARESTMV:          "#006a43",
    NEAR_NEWMV:             "#b79dff",
    NEW_NEARMV:             "#b17d00",
    ZERO_ZEROMV:            "#00041a",
    NEW_NEWMV:              "#ffa574"
  },
  referenceFrame: {
    INTRA_FRAME:            "#f4ffc3",
    LAST_FRAME:             "#622cd8",
    LAST2_FRAME:            "#deff76",
    LAST3_FRAME:            "#ff50ed",
    GOLDEN_FRAME:           "#ff50ed",
    BWDREF_FRAME:           "#808900",
    ALTREF_FRAME:           "#014bb5"
  }
}