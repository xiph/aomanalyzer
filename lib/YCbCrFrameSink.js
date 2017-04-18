/**
 * Warning: canvas must not have been used for 2d drawing prior!
 *
 * @param HTMLCanvasElement canvas
 * @constructor
 */
function YCbCrFrameSink(canvas, videoInfo) {
  var self = this,
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
    debug = false; // swap this to enable more error checks, which can slow down rendering
  if (gl == null) {
    throw new Error('WebGL unavailable');
  }
  console.log('Using WebGL canvas for video drawing');
  // GL!
  function checkError() {
    if (debug) {
      err = gl.getError();
      if (err != 0) {
        throw new Error("GL error " + err);
      }
    }
  }
  function compileShader(type, source) {
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
  var vertexShader,
    fragmentShader,
    program,
    buffer,
    err;
  // In the world of GL there are no rectangles.
  // There are only triangles.
  // THERE IS NO SPOON.
  var rectangle = new Float32Array([
    // First triangle (top left, clockwise)
    -1.0, -1.0,
    +1.0, -1.0,
    -1.0, +1.0,
    // Second triangle (bottom right, clockwise)
    -1.0, +1.0,
    +1.0, -1.0,
    +1.0, +1.0
  ]);
  var textures = {};
  function attachTexture(name, register, index, width, height, data) {
    var texture;
    if (textures[name]) {
      // Reuse & update the existing texture
      texture = textures[name];
    } else {
      textures[name] = texture = gl.createTexture();
    }
    checkError();
    gl.activeTexture(register);
    checkError();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    checkError();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    checkError();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    checkError();
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
    checkError();
    gl.uniform1i(gl.getUniformLocation(program, name), index);
    checkError();
    return texture;
  }
  function init(yCbCrBuffer) {
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    vertexShader = compileShader(gl.VERTEX_SHADER, "attribute vec2 aPosition;\nattribute vec2 aLumaPosition;\nattribute vec2 aChromaPosition;\nvarying vec2 vLumaPosition;\nvarying vec2 vChromaPosition;\nvoid main() {\n    gl_Position = vec4(aPosition, 0, 1);\n    vLumaPosition = aLumaPosition;\n    vChromaPosition = aChromaPosition;\n}\n");
    fragmentShader = compileShader(gl.FRAGMENT_SHADER, "// inspired by https://github.com/mbebenita/Broadway/blob/master/Player/canvas.js\n// extra 'stripe' texture fiddling to work around IE 11's lack of gl.LUMINANCE or gl.ALPHA textures\n\nprecision mediump float;\nuniform sampler2D uStripeLuma;\nuniform sampler2D uStripeChroma;\nuniform sampler2D uTextureY;\nuniform sampler2D uTextureCb;\nuniform sampler2D uTextureCr;\nvarying vec2 vLumaPosition;\nvarying vec2 vChromaPosition;\nvoid main() {\n   // Y, Cb, and Cr planes are mapped into a pseudo-RGBA texture\n   // so we can upload them without expanding the bytes on IE 11\n   // which doesn\\'t allow LUMINANCE or ALPHA textures.\n   // The stripe textures mark which channel to keep for each pixel.\n   vec4 vStripeLuma = texture2D(uStripeLuma, vLumaPosition);\n   vec4 vStripeChroma = texture2D(uStripeChroma, vChromaPosition);\n\n   // Each texture extraction will contain the relevant value in one\n   // channel only.\n   vec4 vY = texture2D(uTextureY, vLumaPosition) * vStripeLuma;\n   vec4 vCb = texture2D(uTextureCb, vChromaPosition) * vStripeChroma;\n   vec4 vCr = texture2D(uTextureCr, vChromaPosition) * vStripeChroma;\n\n   // Now assemble that into a YUV vector, and premultipy the Y...\n   vec3 YUV = vec3(\n     (vY.x  + vY.y  + vY.z  + vY.w) * 1.1643828125,\n     (vCb.x + vCb.y + vCb.z + vCb.w),\n     (vCr.x + vCr.y + vCr.z + vCr.w)\n   );\n   // And convert that to RGB!\n   gl_FragColor = vec4(\n     YUV.x + 1.59602734375 * YUV.z - 0.87078515625,\n     YUV.x - 0.39176171875 * YUV.y - 0.81296875 * YUV.z + 0.52959375,\n     YUV.x + 2.017234375   * YUV.y - 1.081390625,\n     1\n   );\n}\n");
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    checkError();
    gl.attachShader(program, fragmentShader);
    checkError();
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var err = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error('GL program linking failed: ' + err);
    }
    gl.useProgram(program);
    checkError();
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
    var textureY = attachTexture(
      'uStripeLuma',
      gl.TEXTURE0,
      0,
      yCbCrBuffer.strideY,
      1,
      buildStripe(yCbCrBuffer.strideY)
    );
    var textureY = attachTexture(
      'uStripeChroma',
      gl.TEXTURE1,
      1,
      yCbCrBuffer.strideCb,
      1,
      buildStripe(yCbCrBuffer.strideCb)
    );
  }
  self.drawFrame = function (yCbCrBuffer) {
    if (!program) {
      init(yCbCrBuffer);
    }
    // Set up the rectangle and draw it
    //
    // Set up geometry
    //
    buffer = gl.createBuffer();
    checkError();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    checkError();
    gl.bufferData(gl.ARRAY_BUFFER, rectangle, gl.STATIC_DRAW);
    checkError();
    var positionLocation = gl.getAttribLocation(program, 'aPosition');
    checkError();
    gl.enableVertexAttribArray(positionLocation);
    checkError();
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    checkError();
    // Set up the texture geometry...
    function setupTexturePosition(varname, texWidth, texHeight) {
      // Warning: assumes that the stride for Cb and Cr is the same size in output pixels
      var textureX0 = videoInfo.picX / texWidth;
      var textureX1 = (videoInfo.picX + videoInfo.picWidth) / texWidth;
      var textureY0 = videoInfo.picY / yCbCrBuffer.height;
      var textureY1 = (videoInfo.picY + videoInfo.picHeight) / texHeight;
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
      checkError();
      gl.bufferData(gl.ARRAY_BUFFER, textureRectangle, gl.STATIC_DRAW);
      checkError();
      var texturePositionLocation = gl.getAttribLocation(program, varname);
      checkError();
      gl.enableVertexAttribArray(texturePositionLocation);
      checkError();
      gl.vertexAttribPointer(texturePositionLocation, 2, gl.FLOAT, false, 0, 0);
      checkError();
    }
    setupTexturePosition('aLumaPosition', yCbCrBuffer.strideY, yCbCrBuffer.height);
    setupTexturePosition('aChromaPosition', yCbCrBuffer.strideCb << yCbCrBuffer.hdec, yCbCrBuffer.height);
    // Create the textures...
    var textureY = attachTexture(
      'uTextureY',
      gl.TEXTURE2,
      2,
      yCbCrBuffer.strideY / 4,
      yCbCrBuffer.height,
      yCbCrBuffer.bytesY
    );
    var textureCb = attachTexture(
      'uTextureCb',
      gl.TEXTURE3,
      3,
      yCbCrBuffer.strideCb / 4,
      yCbCrBuffer.height >> yCbCrBuffer.vdec,
      yCbCrBuffer.bytesCb
    );
    var textureCr = attachTexture(
      'uTextureCr',
      gl.TEXTURE4,
      4,
      yCbCrBuffer.strideCr / 4,
      yCbCrBuffer.height >> yCbCrBuffer.vdec,
      yCbCrBuffer.bytesCr
    );
    // Aaaaand draw stuff.
    gl.drawArrays(gl.TRIANGLES, 0, rectangle.length / 2);
    checkError();
  };
  return self;
}