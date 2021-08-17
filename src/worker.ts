declare let importScripts;
declare let DecoderModule;

function assert(c: boolean, message = '') {
  if (!c) {
    throw new Error(message);
  }
}

enum ImageType {
  Image,
  ScaleGrain,
  Grain,
  OldImage,
}

let decoderPathPrefix = '';

onmessage = function (e) {
  // console.log("Worker: " + e.data.command);
  switch (e.data.command) {
    case 'load':
      try {
        const payload = e.data.payload;
        const path = payload[0];
        decoderPathPrefix = path.substring(0, path.lastIndexOf('/') + 1);
        importScripts.apply(self, payload);
        load(payload[0], (nativeModule) => {
          native = nativeModule;
          // TODO: Remove after a while. For backwards compatibility, older
          // analyzer files may not have compression.
          native._set_compress && native._set_compress(1);
          let buildConfig;
          if (native._get_aom_codec_build_config) {
            // TODO: Remove after a while, make sure libaom is updated to use |_get_codec_build_config|.
            buildConfig = native.UTF8ToString(native._get_aom_codec_build_config());
          } else if (native._get_codec_build_config) {
            buildConfig = native.UTF8ToString(native._get_codec_build_config());
          } else {
            buildConfig = 'N/A';
          }
          postMessage(
            {
              command: 'loadResult',
              payload: {
                buildConfig,
              },
              id: e.data.id,
            },
            undefined,
          );
        });
      } catch (x) {
        postMessage(
          {
            command: 'loadResult',
            payload: false,
            id: e.data.id,
          },
          undefined,
        );
      }
      break;
    case 'readFrame':
      readFrame(e);
      break;
    case 'setLayers':
      setLayers(e);
      break;
    case 'openFileBytes':
      openFileBytes(e.data.payload);
      break;
    case 'releaseFrameBuffers':
      releaseFrameBuffer(e.data.payload.Y);
      releaseFrameBuffer(e.data.payload.U);
      releaseFrameBuffer(e.data.payload.V);
      break;
  }
};

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
  _get_bits_per_sample(): number;
  _get_image_format(): number;
  _get_frame_height(): number;
  _open_file(): number;
  _set_layers(layers: number): number;
  _set_compress(compress: number): number;
  _get_codec_build_config(): number;
  _get_aom_codec_build_config(): number; // Legacy for AV1
  _get_grain_values(pli: number);
  _get_old_plane(pli: number);
  FS: any;
  HEAPU8: Uint8Array;
  UTF8ToString(p: number): string;
}

let native: Native = null;
let frameRate = 0;
const buffer: Uint8Array = null;
let json = null;

function load(path: string, ready: (native: any) => void) {
  const Module = {
    locateFile: function (path) {
      return decoderPathPrefix + path;
    },
    noExitRuntime: true,
    noInitialRun: true,
    preRun: [],
    postRun: [
      function () {
        // console.info(`Loaded Decoder in Worker`);
      },
    ],
    memoryInitializerPrefixURL: 'bin/',
    arguments: ['input.ivf', 'output.raw'],
    on_frame_decoded_json: function (p) {
      let s = '';
      if (typeof TextDecoder != 'undefined') {
        const m = (Module as any).HEAP8;
        let e = p;
        while (m[e] != 0) {
          e++;
        }
        const textDecoder = new TextDecoder('utf-8');
        s = textDecoder.decode(m.subarray(p, e));
      } else {
        s = (Module as any).UTF8ToString(p);
      }
      json = JSON.parse('[' + s + 'null]');
    },
    onRuntimeInitialized: function () {
      ready(Module);
    },
  };
  DecoderModule(Module);
}

function openFileBytes(buffer: Uint8Array) {
  frameRate = buffer[16] | (buffer[17] << 24) | (buffer[18] << 16) | (buffer[19] << 24);
  buffer = buffer;
  native.FS.writeFile('/tmp/input.ivf', buffer, { encoding: 'binary' });
  native._open_file();
}

const bufferPool: ArrayBuffer[] = [];

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

const AOM_IMG_FMT_PLANAR = 0x100;
const AOM_IMG_FMT_HIGHBITDEPTH = 0x800;
const AOM_IMG_FMT_I422 = AOM_IMG_FMT_PLANAR | 5;
const AOM_IMG_FMT_I42216 = AOM_IMG_FMT_I422 | AOM_IMG_FMT_HIGHBITDEPTH;
const AOM_IMG_FMT_I444 = AOM_IMG_FMT_PLANAR | 6;
const AOM_IMG_FMT_I44416 = AOM_IMG_FMT_I444 | AOM_IMG_FMT_HIGHBITDEPTH;

function getImageFormat() {
  // TODO: Just call |native._get_image_format| directly. Older analyzer builds may not have
  // this function so need this for backwards compatibility.
  return native._get_image_format ? native._get_image_format() : AOM_IMG_FMT_PLANAR;
}

function readPlane(plane, type: ImageType = ImageType.Image) {
  let p = 0;

  switch (type) {
    case ImageType.Image:
      p = native._get_plane(plane);
      break;
    case ImageType.Grain:
      p = native._get_grain_values(plane);
      break;
    case ImageType.ScaleGrain:
      p = native._get_grain_values(plane + 3);
      break;
    case ImageType.OldImage:
      p = native._get_old_plane(plane);
      break;
  }
  const HEAPU8 = native.HEAPU8;
  let stride = native._get_plane_stride(plane);
  let depth = native._get_bit_depth();
  let width = native._get_frame_width();
  let height = native._get_frame_height();
  const fmt = getImageFormat();
  const hbd = fmt & AOM_IMG_FMT_HIGHBITDEPTH;
  if (hbd) {
    stride >>= 1;
  }
  let xdec;
  let ydec;
  if (fmt == AOM_IMG_FMT_I444 || fmt == AOM_IMG_FMT_I44416) {
    xdec = 0;
    ydec = 0;
  } else if (fmt == AOM_IMG_FMT_I422 || fmt == AOM_IMG_FMT_I42216) {
    xdec = plane > 0 ? 1 : 0;
    ydec = 0;
  } else {
    xdec = plane > 0 ? 1 : 0;
    ydec = plane > 0 ? 1 : 0;
  }
  width >>= xdec;
  height >>= ydec;
  const byteLength = height * width;
  let buffer = getReleasedBuffer(byteLength);

  if (buffer && !hbd) {
    // Copy into released buffer.
    const tmp = new Uint8Array(buffer);
    if (stride === width) {
      tmp.set(HEAPU8.subarray(p, p + byteLength));
    } else {
      for (let i = 0; i < height; i++) {
        tmp.set(HEAPU8.subarray(p, p + width), i * width);
        p += stride;
      }
    }
  } else if (hbd) {
    const tmpBuffer = buffer ? new Uint8Array(buffer) : new Uint8Array(byteLength);
    if (depth == 10) {
      // Convert to 8 bit depth.
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = y * (stride << 1) + (x << 1);
          tmpBuffer[y * width + x] = (HEAPU8[p + offset] + (HEAPU8[p + offset + 1] << 8)) >> 2;
        }
      }
    } else {
      // Unpack to 8 bit depth.
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = y * (stride << 1) + (x << 1);
          tmpBuffer[y * width + x] = HEAPU8[p + offset];
        }
      }
    }
    buffer = tmpBuffer.buffer;
    depth = 8;
  } else {
    if (stride === width) {
      buffer = HEAPU8.slice(p, p + byteLength).buffer;
    } else {
      const tmp = new Uint8Array(byteLength);
      for (let i = 0; i < height; i++) {
        tmp.set(HEAPU8.subarray(p, p + width), i * width);
        p += stride;
      }
      buffer = tmp.buffer;
    }
  }
  return {
    buffer,
    stride: width,
    depth,
    width,
    height,
    xdec,
    ydec,
  };
}

function readGrainImage() {
  return {
    hashCode: (Math.random() * 10000000) | 0,
    Y: readPlane(0, ImageType.Grain),
    U: readPlane(1, ImageType.Grain),
    V: readPlane(2, ImageType.Grain),
  };
}

function readOldPlaneImage() {
  return {
    hashCode: (Math.random() * 10000000) | 0,
    Y: readPlane(0, ImageType.OldImage),
    U: readPlane(1, ImageType.OldImage),
    V: readPlane(2, ImageType.OldImage),
  };
}

function readScaledGrainImage() {
  return {
    hashCode: (Math.random() * 10000000) | 0,
    Y: readPlane(0, ImageType.ScaleGrain),
    U: readPlane(1, ImageType.ScaleGrain),
    V: readPlane(2, ImageType.ScaleGrain),
  };
}

function readImage() {
  return {
    hashCode: (Math.random() * 1000000) | 0,
    Y: readPlane(0, ImageType.Image),
    U: readPlane(1, ImageType.Image),
    V: readPlane(2, ImageType.Image),
  };
}

function readFrame(e) {
  const s = performance.now();
  if (native._read_frame() != 0) {
    postMessage(
      {
        command: 'readFrameResult',
        payload: { json: null, decodeTime: performance.now() - s },
        id: e.data.id,
      },
      undefined,
    );
    return null;
  }
  let image = null;
  let grainImage = null;
  let scaledGrainImage = null;
  let oldImage = null;
  if (e.data.shouldReadImageData) {
    image = readImage();
    grainImage = readGrainImage();
    oldImage = readOldPlaneImage();
    scaledGrainImage = readScaledGrainImage();
  }
  self.postMessage(
    {
      command: 'readFrameResult',
      payload: { json, image, decodeTime: performance.now() - s, grainImage, scaledGrainImage, oldImage },
      id: e.data.id,
    },
    image ? [image.Y.buffer, image.U.buffer, image.V.buffer] : (undefined as any),
  );
  assert(
    image.Y.buffer.byteLength === 0 && image.U.buffer.byteLength === 0 && image.V.buffer.byteLength === 0,
    'Buffers must be transferred.',
  );
}

function setLayers(e) {
  native._set_layers(e.data.payload);
}
