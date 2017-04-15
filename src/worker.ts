declare var importScripts;
declare var TextDecoder;
declare var DecoderModule;

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

function readPlane(plane) {
  let p = native._get_plane(plane);
  let stride = native._get_plane_stride(plane);
  let depth = native._get_bit_depth();
  let width = native._get_frame_width();
  let height = native._get_frame_height();
  return {
    buffer: native.HEAPU8.slice(p, p + stride * width),
    stride,
    depth,
    width,
    height
  };
}

function readImage() {
  return {
    Y: readPlane(0),
    U: readPlane(1),
    V: readPlane(2)
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
  let image = null;
  if (e.data.shouldReadImageData) {
    image = readImage();
  }
  postMessage({
    command: "readFrameResult",
    payload: { json, image },
    id: e.data.id
  }, undefined, image ? [
    image.Y.buffer,
    image.U.buffer,
    image.V.buffer
  ] : undefined);
}

function setLayers(e) {
  native._set_layers(e.data.payload);
}
