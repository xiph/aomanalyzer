function assert(c: any, message: string = "") {
  if (!c) {
    throw new Error(message);
  }
}
function hashString(s: string) {
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
export class YUVCanvas {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
  rectangle = new Float32Array([
    // First triangle (top left, clockwise)
    -1.0, +1.0,
    +1.0, +1.0,
    -1.0, -1.0,
    // Second triangle (bottom right, clockwise)
    -1.0, -1.0,
    +1.0, +1.0,
    +1.0, -1.0
  ]);
  constructor(public canvas: HTMLCanvasElement, public videoInfo: any) {
    this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    assert(this.gl, "WebGL is Unavailable");
  }
  checkError() {
    let err = this.gl.getError();
    if (err != 0) {
      console.error("WebGL Error " + err);
    }
  }
  compileShader(type: number, source: string) {
    let gl = this.gl;
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('GL shader compilation for ' + type + ' failed: ' + err);
    }
    return shader;
  }
  textures: {[index: number]: WebGLTexture} = {};
  attachTexture(hashCode: number, name: string, register: number, index: number, width: number, height: number, data: Uint8Array): WebGLTexture {
    let texture;
    let needsUpload = true;
    let gl = this.gl;
    hashCode += hashString(name);
    if (this.textures[hashCode]) {
      // Reuse & update the existing texture
      texture = this.textures[hashCode];
      needsUpload = false;
    } else {
      this.textures[hashCode] = texture = gl.createTexture();
      this.checkError();
      needsUpload = true;
    }
    gl.activeTexture(register);
    this.checkError();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.checkError();
    let s = performance.now();
    if (needsUpload) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0, // mip level
        gl.RGBA, // internal format
        width, height,
        0, // border
        gl.RGBA, // format
        gl.UNSIGNED_BYTE, //type
        data // data!
      );
    }
    this.checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); this.checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); this.checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); this.checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); this.checkError();
    gl.uniform1i(gl.getUniformLocation(this.program, name), index); this.checkError();
    return texture;
  }
  init(yCbCrBuffer) {
    let gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    this.vertexShader = this.compileShader(gl.VERTEX_SHADER, `
    attribute vec2 aPosition;
    attribute vec2 aLumaPosition;
    attribute vec2 aChromaPosition;
    varying vec2 vLumaPosition;
    varying vec2 vChromaPosition;
    void main() {
      gl_Position = vec4(aPosition, 0, 1);
      vLumaPosition = aLumaPosition;
      vChromaPosition = aChromaPosition;
    }
    `);
    this.fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, `
    // inspired by https://github.com/mbebenita/Broadway/blob/master/Player/canvas.js
    // extra 'stripe' texture fiddling to work around IE 11's lack of gl.LUMINANCE or gl.ALPHA textures
    precision mediump float;
    uniform sampler2D uStripeLuma;uniform sampler2D uStripeChroma;
    uniform sampler2D uTextureY;
    uniform sampler2D uTextureCb;
    uniform sampler2D uTextureCr;
    varying vec2 vLumaPosition;
    varying vec2 vChromaPosition;
    void main() {
      // Y, Cb, and Cr planes are mapped into a pseudo-RGBA texture
      // so we can upload them without expanding the bytes on IE 11
      // which doesn't allow LUMINANCE or ALPHA textures.
      // The stripe textures mark which channel to keep for each pixel.
      vec4 vStripeLuma = texture2D(uStripeLuma, vLumaPosition);
      vec4 vStripeChroma = texture2D(uStripeChroma, vChromaPosition);
      // Each texture extraction will contain the relevant value in one
      // channel only.
      vec4 vY = texture2D(uTextureY, vLumaPosition) * vStripeLuma;
      vec4 vCb = texture2D(uTextureCb, vChromaPosition) * vStripeChroma;
      vec4 vCr = texture2D(uTextureCr, vChromaPosition) * vStripeChroma;
      // Now assemble that into a YUV vector, and premultipy the Y...
      vec3 YUV = vec3(
        (vY.x  + vY.y  + vY.z  + vY.w) * 1.1643828125,
        (vCb.x + vCb.y + vCb.z + vCb.w),
        (vCr.x + vCr.y + vCr.z + vCr.w));
      // And convert that to RGB!
      gl_FragColor = vec4(
        YUV.x + 1.59602734375 * YUV.z - 0.87078515625,
        YUV.x - 0.39176171875 * YUV.y - 0.81296875 * YUV.z + 0.52959375,
        YUV.x + 2.017234375   * YUV.y - 1.081390625, 1);
      }
    `);
    this.program = gl.createProgram();
    gl.attachShader(this.program, this.vertexShader); this.checkError();
    gl.attachShader(this.program, this.fragmentShader); this.checkError();
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      var err = gl.getProgramInfoLog(this.program);
      gl.deleteProgram(this.program);
      throw new Error('GL program linking failed: ' + err);
    }
    gl.useProgram(this.program);
    this.checkError();
    function buildStripe(width) {
      var out = new Uint32Array(width);
      for (var i = 0; i < width; i += 4) {
        out[i] = 0x000000ff;
        out[i + 1] = 0x0000ff00;
        out[i + 2] = 0x00ff0000;
        out[i + 3] = 0xff000000;
      }
      return new Uint8Array(out.buffer);
    }
    this.attachTexture(
      123,
      'uStripeLuma',
      gl.TEXTURE0,
      0,
      yCbCrBuffer.strideY,
      1,
      buildStripe(yCbCrBuffer.strideY)
    );
    this.attachTexture(
      234,
      'uStripeChroma',
      gl.TEXTURE1,
      1,
      yCbCrBuffer.strideCb,
      1,
      buildStripe(yCbCrBuffer.strideCb)
    );
  }

  freeFrameTexture(hashCode: number) {
    let gl = this.gl;
    let textures = this.textures;
    function free(name: string) {
      let hash = hashCode + hashString(name);
      let texture = textures[hash];
      // assert(texture);
      if (texture) {
        gl.deleteTexture(texture);
        delete textures[hash];
      }
    }
    free("uTextureY");
    free("uTextureCb");
    free("uTextureCr");
  }

  drawFrame(yCbCrBuffer) {
    if (!this.program) {
      this.init(yCbCrBuffer);
    }
    let gl = this.gl;
    //
    // Set up geometry
    //
    let buffer = gl.createBuffer();
    this.checkError();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    this.checkError();
    gl.bufferData(gl.ARRAY_BUFFER, this.rectangle, gl.STATIC_DRAW);
    this.checkError();
    var positionLocation = gl.getAttribLocation(this.program, 'aPosition');
    this.checkError();
    gl.enableVertexAttribArray(positionLocation);
    this.checkError();
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    this.checkError();
    let self = this;
    // Set up the texture geometry...
    function setupTexturePosition(varname, texWidth, texHeight) {
      // Warning: assumes that the stride for Cb and Cr is the same size in output pixels
      var textureX0 = self.videoInfo.picX / texWidth;
      var textureX1 = (self.videoInfo.picX + self.videoInfo.picWidth) / texWidth;
      var textureY0 = self.videoInfo.picY / yCbCrBuffer.height;
      var textureY1 = (self.videoInfo.picY + self.videoInfo.picHeight) / texHeight;
      var textureRectangle = new Float32Array([
        textureX0, textureY0,
        textureX1, textureY0,
        textureX0, textureY1,
        textureX0, textureY1,
        textureX1, textureY0,
        textureX1, textureY1
      ]);
      var texturePositionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texturePositionBuffer);
      self.checkError();
      gl.bufferData(gl.ARRAY_BUFFER, textureRectangle, gl.STATIC_DRAW);
      self.checkError();
      var texturePositionLocation = gl.getAttribLocation(self.program, varname);
      self.checkError();
      gl.enableVertexAttribArray(texturePositionLocation);
      self.checkError();
      gl.vertexAttribPointer(texturePositionLocation, 2, gl.FLOAT, false, 0, 0);
      self.checkError();
    }
    setupTexturePosition('aLumaPosition', yCbCrBuffer.strideY, yCbCrBuffer.height);
    setupTexturePosition('aChromaPosition', yCbCrBuffer.strideCb << yCbCrBuffer.hdec, yCbCrBuffer.height);
    // Create the textures...
    var textureY = this.attachTexture(
      yCbCrBuffer.hashCode,
      'uTextureY',
      gl.TEXTURE2,
      2,
      yCbCrBuffer.strideY / 4,
      yCbCrBuffer.height,
      yCbCrBuffer.bytesY
    );
    var textureCb = this.attachTexture(
      yCbCrBuffer.hashCode,
      'uTextureCb',
      gl.TEXTURE3,
      3,
      yCbCrBuffer.strideCb / 4,
      yCbCrBuffer.height >> yCbCrBuffer.vdec,
      yCbCrBuffer.bytesCb
    );
    var textureCr = this.attachTexture(
      yCbCrBuffer.hashCode,
      'uTextureCr',
      gl.TEXTURE4,
      4,
      yCbCrBuffer.strideCr / 4,
      yCbCrBuffer.height >> yCbCrBuffer.vdec,
      yCbCrBuffer.bytesCr
    );
    // Aaaaand draw stuff.
    gl.drawArrays(gl.TRIANGLES, 0, this.rectangle.length / 2);
    this.checkError();
  };
}

// /**
//  * Warning: canvas must not have been used for 2d drawing prior!
//  *
//  * @param HTMLCanvasElement canvas
//  * @constructor
//  */
// function YCbCrFrameSink(canvas, videoInfo) {
//   var self = this,
//     gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
//     debug = false; // swap this to enable more error checks, which can slow down rendering
//   if (gl == null) {
//     throw new Error('WebGL unavailable');
//   }
//   console.log('Using WebGL canvas for video drawing');
//   // GL!
//   function checkError() {
//     if (debug) {
//       err = gl.getError();
//       if (err != 0) {
//         throw new Error("GL error " + err);
//       }
//     }
//   }
//   function compileShader(type, source) {
//     var shader = gl.createShader(type);
//     gl.shaderSource(shader, source);
//     gl.compileShader(shader);
//     if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
//       var err = gl.getShaderInfoLog(shader);
//       gl.deleteShader(shader);
//       throw new Error('GL shader compilation for ' + type + ' failed: ' + err);
//     }
//     return shader;
//   }
//   var vertexShader,
//     fragmentShader,
//     program,
//     buffer,
//     err;
//   var rectangle = new Float32Array([
//     // First triangle (top left, clockwise)
//     -1.0, +1.0,
//     +1.0, +1.0,
//     -1.0, -1.0,
//     // Second triangle (bottom right, clockwise)
//     -1.0, -1.0,
//     +1.0, +1.0,
//     +1.0, -1.0
//   ]);
//   var textures = {};
//   function attachTexture(hashCode, name, register, index, width, height, data) {
//     var texture;
//     var needsUpload = true;
//     if (textures[hashCode]) {
//       // Reuse & update the existing texture
//       texture = textures[hashCode];
//       needsUpload = false;
//     } else {
//       textures[hashCode] = texture = gl.createTexture();
//       needsUpload = true;
//     }
//     checkError();
//     gl.activeTexture(register);
//     checkError();
//     gl.bindTexture(gl.TEXTURE_2D, texture);
//     checkError();
//     let s = performance.now();
//     if (needsUpload) {
//       gl.texImage2D(
//         gl.TEXTURE_2D,
//         0, // mip level
//         gl.RGBA, // internal format
//         width, height,
//         0, // border
//         gl.RGBA, // format
//         gl.UNSIGNED_BYTE, //type
//         data // data!
//       );
//     }
//     checkError();
//     // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); checkError();
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); checkError();
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); checkError();
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); checkError();
//     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); checkError();
//     gl.uniform1i(gl.getUniformLocation(program, name), index);
//     checkError();
//     return texture;
//   }
//   function init(yCbCrBuffer) {
//     gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
//     vertexShader = compileShader(gl.VERTEX_SHADER, `
//     attribute vec2 aPosition;
//     attribute vec2 aLumaPosition;
//     attribute vec2 aChromaPosition;
//     varying vec2 vLumaPosition;
//     varying vec2 vChromaPosition;
//     void main() {
//       gl_Position = vec4(aPosition, 0, 1);
//       vLumaPosition = aLumaPosition;
//       vChromaPosition = aChromaPosition;
//     }
//     `);
//     fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
//     // inspired by https://github.com/mbebenita/Broadway/blob/master/Player/canvas.js
//     // extra 'stripe' texture fiddling to work around IE 11's lack of gl.LUMINANCE or gl.ALPHA textures
//     precision mediump float;
//     uniform sampler2D uStripeLuma;uniform sampler2D uStripeChroma;
//     uniform sampler2D uTextureY;
//     uniform sampler2D uTextureCb;
//     uniform sampler2D uTextureCr;
//     varying vec2 vLumaPosition;
//     varying vec2 vChromaPosition;
//     void main() {
//       // Y, Cb, and Cr planes are mapped into a pseudo-RGBA texture
//       // so we can upload them without expanding the bytes on IE 11
//       // which doesn't allow LUMINANCE or ALPHA textures.
//       // The stripe textures mark which channel to keep for each pixel.
//       vec4 vStripeLuma = texture2D(uStripeLuma, vLumaPosition);
//       vec4 vStripeChroma = texture2D(uStripeChroma, vChromaPosition);
//       // Each texture extraction will contain the relevant value in one
//       // channel only.
//       vec4 vY = texture2D(uTextureY, vLumaPosition) * vStripeLuma;
//       vec4 vCb = texture2D(uTextureCb, vChromaPosition) * vStripeChroma;
//       vec4 vCr = texture2D(uTextureCr, vChromaPosition) * vStripeChroma;
//       // Now assemble that into a YUV vector, and premultipy the Y...
//       vec3 YUV = vec3(
//         (vY.x  + vY.y  + vY.z  + vY.w) * 1.1643828125,
//         (vCb.x + vCb.y + vCb.z + vCb.w),
//         (vCr.x + vCr.y + vCr.z + vCr.w));
//       // And convert that to RGB!
//       gl_FragColor = vec4(
//         YUV.x + 1.59602734375 * YUV.z - 0.87078515625,
//         YUV.x - 0.39176171875 * YUV.y - 0.81296875 * YUV.z + 0.52959375,
//         YUV.x + 2.017234375   * YUV.y - 1.081390625, 1);
//       }
//     `);
//     program = gl.createProgram();
//     gl.attachShader(program, vertexShader);
//     checkError();
//     gl.attachShader(program, fragmentShader);
//     checkError();
//     gl.linkProgram(program);
//     if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
//       var err = gl.getProgramInfoLog(program);
//       gl.deleteProgram(program);
//       throw new Error('GL program linking failed: ' + err);
//     }
//     gl.useProgram(program);
//     checkError();
//     function buildStripe(width) {
//       var out = new Uint32Array(width);
//       for (var i = 0; i < width; i += 4) {
//         out[i] = 0x000000ff;
//         out[i + 1] = 0x0000ff00;
//         out[i + 2] = 0x00ff0000;
//         out[i + 3] = 0xff000000;
//       }
//       return new Uint8Array(out.buffer);
//     }
//     attachTexture(
//       123,
//       'uStripeLuma',
//       gl.TEXTURE0,
//       0,
//       yCbCrBuffer.strideY,
//       1,
//       buildStripe(yCbCrBuffer.strideY)
//     );
//     attachTexture(
//       234,
//       'uStripeChroma',
//       gl.TEXTURE1,
//       1,
//       yCbCrBuffer.strideCb,
//       1,
//       buildStripe(yCbCrBuffer.strideCb)
//     );
//   }
//   self.freeFrameTexture = function (hashCode) {
//     delete textures[hashCode];
//   }
//   self.drawFrame = function (yCbCrBuffer) {
//     if (!program) {
//       init(yCbCrBuffer);
//     }
//     // Set up the rectangle and draw it
//     //
//     // Set up geometry
//     //
//     buffer = gl.createBuffer();
//     checkError();
//     gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
//     checkError();
//     gl.bufferData(gl.ARRAY_BUFFER, rectangle, gl.STATIC_DRAW);
//     checkError();
//     var positionLocation = gl.getAttribLocation(program, 'aPosition');
//     checkError();
//     gl.enableVertexAttribArray(positionLocation);
//     checkError();
//     gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
//     checkError();
//     // Set up the texture geometry...
//     function setupTexturePosition(varname, texWidth, texHeight) {
//       // Warning: assumes that the stride for Cb and Cr is the same size in output pixels
//       var textureX0 = videoInfo.picX / texWidth;
//       var textureX1 = (videoInfo.picX + videoInfo.picWidth) / texWidth;
//       var textureY0 = videoInfo.picY / yCbCrBuffer.height;
//       var textureY1 = (videoInfo.picY + videoInfo.picHeight) / texHeight;
//       var textureRectangle = new Float32Array([
//         textureX0, textureY0,
//         textureX1, textureY0,
//         textureX0, textureY1,
//         textureX0, textureY1,
//         textureX1, textureY0,
//         textureX1, textureY1
//       ]);
//       var texturePositionBuffer = gl.createBuffer();
//       gl.bindBuffer(gl.ARRAY_BUFFER, texturePositionBuffer);
//       checkError();
//       gl.bufferData(gl.ARRAY_BUFFER, textureRectangle, gl.STATIC_DRAW);
//       checkError();
//       var texturePositionLocation = gl.getAttribLocation(program, varname);
//       checkError();
//       gl.enableVertexAttribArray(texturePositionLocation);
//       checkError();
//       gl.vertexAttribPointer(texturePositionLocation, 2, gl.FLOAT, false, 0, 0);
//       checkError();
//     }
//     setupTexturePosition('aLumaPosition', yCbCrBuffer.strideY, yCbCrBuffer.height);
//     setupTexturePosition('aChromaPosition', yCbCrBuffer.strideCb << yCbCrBuffer.hdec, yCbCrBuffer.height);
//     // Create the textures...
//     var textureY = attachTexture(
//       yCbCrBuffer.hashCode,
//       'uTextureY',
//       gl.TEXTURE2,
//       2,
//       yCbCrBuffer.strideY / 4,
//       yCbCrBuffer.height,
//       yCbCrBuffer.bytesY
//     );
//     var textureCb = attachTexture(
//       yCbCrBuffer.hashCode,
//       'uTextureCb',
//       gl.TEXTURE3,
//       3,
//       yCbCrBuffer.strideCb / 4,
//       yCbCrBuffer.height >> yCbCrBuffer.vdec,
//       yCbCrBuffer.bytesCb
//     );
//     var textureCr = attachTexture(
//       yCbCrBuffer.hashCode,
//       'uTextureCr',
//       gl.TEXTURE4,
//       4,
//       yCbCrBuffer.strideCr / 4,
//       yCbCrBuffer.height >> yCbCrBuffer.vdec,
//       yCbCrBuffer.bytesCr
//     );
//     // Aaaaand draw stuff.
//     gl.drawArrays(gl.TRIANGLES, 0, rectangle.length / 2);
//     checkError();
//   };
//   return self;
// }