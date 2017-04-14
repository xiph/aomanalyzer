declare var importScripts;
declare var TextDecoder;
declare var DecoderModule;

let YUV2RGB_TABLE = new Uint32Array(256 * 256 * 256);

function YUV2RGB(y, u, v) {
  return YUV2RGB_TABLE[(y << 16) | (u << 8) | v];
}

function clamp(v, a, b) {
  if (v < a) {
    v = a;
  }
  if (v > b) {
    v = b;
  }
  return v;
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

onmessage = function (e) {
  // console.log("Worker: " + e.data.command);
  switch (e.data.command) {
    case "load":
      try {
        importScripts.apply(self, e.data.payload);
        load(e.data.payload[0], (nativeModule) => {
          native = nativeModule;
          let buildConfig;
          if (!native._get_aom_codec_build_config) {
            buildConfig = "N/A";
          }
          buildConfig = native.UTF8ToString(native._get_aom_codec_build_config());
          postMessage({
            command: "loadResult",
            payload: {
              buildConfig
            },
            id: e.data.id
          }, undefined);
        });
      } catch (x) {
        postMessage({
          command: "loadResult",
          payload: false,
          id: e.data.id
        }, undefined);
      }
      break;
    case "readFrame":
      readFrame(e);
      break;
    case "setLayers":
      setLayers(e);
      break;
    case "openFileBytes":
      openFileBytes(e.data.payload);
      break;
  }
}

interface Native {
  _read_frame(): number;
  _get_bit_depth(): number;
  _get_plane(pli: number): number;
  _get_plane_stride(pli: number): number;
  _get_plane_width(pli: number): number;
  _get_plane_height(pli: number): number;
  _get_mi_cols_and_rows(): number;
  _get_tile_cols_and_rows_log2(): number;
  _get_frame_count(): number;
  _get_frame_width(): number;
  _get_frame_height(): number;
  _open_file(): number;
  _set_layers(layers: number): number;
  _get_aom_codec_build_config(): number;
  FS: any;
  HEAPU8: Uint8Array;
  UTF8ToString(p: number): string;
}

let native: Native = null;
let frameRate = 0;
let buffer: Uint8Array = null;
let json = null;

function getWasmBinaryFilePath(path: string) {
  let i = path.lastIndexOf(".js");
  if (i >= 0) {
    return path.substring(0, i) + ".wasm";
  }
  return null;
}

function load(path: string, ready: (native: any) => void) {
  var Module = {
    wasmBinaryFile: getWasmBinaryFilePath(path),
    noExitRuntime: true,
    noInitialRun: true,
    preRun: [],
    postRun: [function () {
      // console.info(`Loaded Decoder in Worker`);
    }],
    memoryInitializerPrefixURL: "bin/",
    arguments: ['input.ivf', 'output.raw'],
    on_frame_decoded_json: function (p) {
      let s = "";
      if (typeof TextDecoder != "undefined") {
        let m = (Module as any).HEAP8;
        let e = p;
        while (m[e] != 0) {
          e++;
        }
        let textDecoder = new TextDecoder("utf-8");
        s = textDecoder.decode(m.subarray(p, e));
      } else {
        s = (Module as any).UTF8ToString(p);
      }
      json = JSON.parse("[" + s + "null]");
    },
    onRuntimeInitialized: function () {
      ready(Module);
    }
  };
  DecoderModule(Module)
}

function openFileBytes(buffer: Uint8Array) {
  frameRate = buffer[16] | buffer[17] << 24 | buffer[18] << 16 | buffer[19] << 24;
  buffer = buffer;
  native.FS.writeFile("/tmp/input.ivf", buffer, { encoding: "binary" });
  native._open_file();
}

function readImage(): ImageData {
  let Yp = native._get_plane(0);
  let Ys = native._get_plane_stride(0);
  let Up = native._get_plane(1);
  let Us = native._get_plane_stride(1);
  let Vp = native._get_plane(2);
  let Vs = native._get_plane_stride(2);
  let bitDepth = native._get_bit_depth();
  let w = native._get_frame_width();
  let h = native._get_frame_height();
  let imageData = new ImageData(w, h);
  fillImageData(imageData, native.HEAPU8, Yp, Ys, Up, Us, Vp, Vs, bitDepth);
  return imageData;
}

function fillImageData(imageData: ImageData, H: Uint8Array, Yp, Ys, Up, Us, Vp, Vs, bitDepth) {
    let I = imageData.data;
    let w = imageData.width;
    let h = imageData.height;

    let p = 0;
    let bgr = 0;
    if (bitDepth == 10) {
      for (let y = 0; y < h; y++) {
        let yYs = y * Ys;
        let yUs = (y >> 1) * Us;
        let yVs = (y >> 1) * Vs;
        for (let x = 0; x < w; x++) {
          p = Yp + yYs + (x << 1);
          let Y = (H[p] + (H[p + 1] << 8)) >> 2;
          p = Up + yUs + ((x >> 1) << 1);
          let U = (H[p] + (H[p + 1] << 8)) >> 2;
          p = Vp + yVs + ((x >> 1) << 1);
          let V = (H[p] + (H[p + 1] << 8)) >> 2;
          bgr = YUV2RGB(Y, U, V);
          let r = (bgr >> 0) & 0xFF;
          let g = (bgr >> 8) & 0xFF;
          let b = (bgr >> 16) & 0xFF;
          let index = (Math.imul(y, w) + x) << 2;
          I[index + 0] = r;
          I[index + 1] = g;
          I[index + 2] = b;
          I[index + 3] = 255;
        }
      }
    } else {
      for (let y = 0; y < h; y++) {
        let yYs = y * Ys;
        let yUs = (y >> 1) * Us;
        let yVs = (y >> 1) * Vs;
        for (let x = 0; x < w; x++) {
          let Y = H[Yp + yYs + x];
          let U = H[Up + yUs + (x >> 1)];
          let V = H[Vp + yVs + (x >> 1)];
          bgr = YUV2RGB(Y, U, V);
          let r = (bgr >> 0) & 0xFF;
          let g = (bgr >> 8) & 0xFF;
          let b = (bgr >> 16) & 0xFF;
          let index = (Math.imul(y, w) + x) << 2;
          I[index + 0] = r;
          I[index + 1] = g;
          I[index + 2] = b;
          I[index + 3] = 255;
        }
      }
    }
  }

function readFrame(e) {
  if (native._read_frame() != 0) {
    postMessage({
      command: "readFrameResult",
      payload: { json: null },
      id: e.data.id
    }, undefined);
    return null;
  }
  postMessage({
    command: "readFrameResult",
    payload: { json: json, image: readImage() },
    id: e.data.id
  }, undefined);
}

function setLayers(e) {
  native._set_layers(e.data.payload);
}
