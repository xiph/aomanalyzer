declare var importScripts;
declare var TextDecoder;
declare var DecoderModule;

function assert(c: boolean, message: string = "") {
  if (!c) {
    throw new Error(message);
  }
}

onmessage = function (e) {
  // console.log("Worker: " + e.data.command);
  switch (e.data.command) {
    case "load":
      try {
        importScripts.apply(self, e.data.payload);
        load(e.data.payload[0], (nativeModule) => {
          native = nativeModule;
          // TODO: Remove after a while. For backwards compatibility, older
          // analyzer files may not have compression.
          native._set_compress && native._set_compress(1);
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
    case "releaseFrameBuffers":
      releaseFrameBuffer(e.data.payload.Y);
      releaseFrameBuffer(e.data.payload.U);
      releaseFrameBuffer(e.data.payload.V);
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
  _set_compress(compress: number): number;
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

var bufferPool: ArrayBuffer [] = [];

function releaseFrameBuffer(buffer: ArrayBuffer) {
  if (bufferPool.length < 64) {
    bufferPool.push(buffer);
  }
}

function getReleasedBuffer(byteLength: number) {
  let i;
  for (i = 0; i < bufferPool.length; i++) {
    if (bufferPool[i].byteLength === byteLength) {
      return bufferPool.splice(i, 1)[0];
    }
  }
  return null;
}

function readPlane(plane) {
  let p = native._get_plane(plane);
  let HEAPU8 = native.HEAPU8;
  let stride = native._get_plane_stride(plane);
  let depth = native._get_bit_depth();
  let width = native._get_frame_width();
  let height = native._get_frame_height();
  if (depth == 10) {
    stride >>= 1;
  }
  if (plane > 0) {
    width >>= 1;
    height >>= 1;
  }
  let byteLength = height * stride;
  var buffer = getReleasedBuffer(byteLength);
  if (depth == 8 && buffer) {
    // Copy into released buffer.
    new Uint8Array(buffer).set(HEAPU8.subarray(p, p + byteLength));
  } else {
    if (depth == 10) {
      // Convert to 8 bit depth.
      let tmpBuffer = buffer ? new Uint8Array(buffer) : new Uint8Array(byteLength);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let offset = y * (stride << 1) + (x << 1);
          tmpBuffer[y * stride + x] = (HEAPU8[p + offset] + (HEAPU8[p + offset + 1] << 8)) >> 2;
        }
      }
      buffer = tmpBuffer.buffer;
      depth = 8;
    } else {
      buffer = HEAPU8.slice(p, p + byteLength).buffer;
    }
  }
  return {
    buffer,
    stride,
    depth,
    width,
    height
  };
}

function readImage() {
  return {
    hashCode: Math.random() * 1000000 | 0,
    Y: readPlane(0),
    U: readPlane(1),
    V: readPlane(2)
  }
}

function readFrame(e) {
  let s = performance.now();
  if (native._read_frame() != 0) {
    postMessage({
      command: "readFrameResult",
      payload: { json: null, decodeTime: performance.now() - s },
      id: e.data.id
    }, undefined);
    return null;
  }
  let image = null;
  if (e.data.shouldReadImageData) {
    image = readImage();
  }
  self.postMessage({
    command: "readFrameResult",
    payload: { json, image, decodeTime: performance.now() - s },
    id: e.data.id
  }, image ? [
    image.Y.buffer,
    image.U.buffer,
    image.V.buffer
  ] : undefined as any);
  assert(image.Y.buffer.byteLength === 0 &&
         image.U.buffer.byteLength === 0 &&
         image.V.buffer.byteLength === 0, "Buffers must be transferred.");
}

function setLayers(e) {
  native._set_layers(e.data.payload);
}
