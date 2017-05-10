const trace = false;
function assert(c: any, message: string = "") {
  if (!c) {
    throw new Error(message);
  }
}
function compileShader(gl: any, type: number, source: string) {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    let err = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('GL shader compilation for ' + type + ' failed: ' + err);
  }
  return shader;
}
function compileProgram(gl: any, vertSource: string, fragSource: string) {
  let vs = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  let fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  let program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    var err = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('GL program linking failed: ' + err);
  }
  return program;
}

const kUseLinearFiltering: boolean = false;

export interface YCbCrBuffer {
  width: number;
  height: number;
  vdec: number;
  hdec: number;
  bytesY: Uint8Array;
  strideY: number;
  bytesCb: Uint8Array;
  strideCb: number;
  bytesCr: Uint8Array;
  strideCr: number;
}

export class YUVCanvas {
  gl: any;
  firstRun: boolean = true;

  constructor(public canvas: HTMLCanvasElement) {
    let creationAttribs = {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
    };
    this.gl = canvas.getContext('webgl2', creationAttribs);
    assert(this.gl, "WebGL 2 is Unavailable");
    let gl = this.gl;

    let vertSource = `
attribute vec2 aPosition; // [0, 1]
varying vec2 vTexCoord;
void main() {
  gl_Position = vec4(2.0*aPosition - 1.0, 0, 1); // [-1, 1]
  gl_Position.y *= -1.0;
  vTexCoord = aPosition;
}
    `;
    /*
    For [0,1] instead of [0,255], and to 5 places:
    [R]   [1.16438,  0.00000,  1.79274]   [ Y - 0.06275]
    [G] = [1.16438, -0.21325, -0.53291] x [Cb - 0.50196]
    [B]   [1.16438,  2.11240,  0.00000]   [Cr - 0.50196]
    */
    let fragSource = `
precision mediump float;
uniform sampler2D uTextureY;
uniform sampler2D uTextureCb;
uniform sampler2D uTextureCr;
varying vec2 vTexCoord;
const vec3 kBias = vec3(0.06275, 0.50196, 0.50196);
// Column-major:
const mat3 kYcbcrToRgb_709 = mat3(1.16438, 1.16438, 1.16438,
                                  0.00000,-0.21325, 2.11240,
                                  1.79274,-0.53291, 0.00000);
void main() {
  float y = texture2D(uTextureY, vTexCoord).r; // premultipy the Y...
  float cb = texture2D(uTextureCb, vTexCoord).r;
  float cr = texture2D(uTextureCr, vTexCoord).r;
  vec3 ycbcr = vec3(y, cb, cr) - kBias;
  vec3 rgb = kYcbcrToRgb_709 * ycbcr;
  gl_FragColor = vec4(rgb, 1);
}
    `;

    let program = compileProgram(gl, vertSource, fragSource);
    program.aPosition = gl.getAttribLocation(program, 'aPosition');
    program.uTexture = [
      gl.getUniformLocation(program, 'uTextureY'),
      gl.getUniformLocation(program, 'uTextureCb'),
      gl.getUniformLocation(program, 'uTextureCr'),
    ];
    gl.useProgram(program);
    this.checkError();

    for (let i = 0; i < 3; i++) {
      assert(program.uTexture[i], "missing program.uTexture[" + i + "]");
      gl.uniform1i(program.uTexture[i], i);
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      if (kUseLinearFiltering) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    this.checkError();

    let vertData = [
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ];
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertData), gl.STATIC_DRAW);
    gl.vertexAttribPointer(program.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.aPosition);
    this.checkError();
  }
  checkError() {
    let err = this.gl.getError();
    if (err != 0) {
      console.error("WebGL Error " + err);
    }
  }
  drawFrame(yCbCrBuffer: YCbCrBuffer) {
    let gl = this.gl;

    if (this.firstRun ||
        gl.drawingBufferWidth != yCbCrBuffer.width ||
        gl.drawingBufferHeight != yCbCrBuffer.height)
    {
      this.firstRun = false;
      trace && console.log('Resizing to:', yCbCrBuffer.width, yCbCrBuffer.height);

      gl.canvas.width = yCbCrBuffer.width;
      gl.canvas.height = yCbCrBuffer.height;
      assert(gl.drawingBufferWidth == yCbCrBuffer.width, "bad drawingbufferWidth");
      assert(gl.drawingBufferHeight == yCbCrBuffer.height, "bad drawingbufferHeight");
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8,
                    yCbCrBuffer.width,
                    yCbCrBuffer.height,
                    0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8,
                    yCbCrBuffer.width >> yCbCrBuffer.hdec,
                    yCbCrBuffer.height >> yCbCrBuffer.vdec,
                    0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.activeTexture(gl.TEXTURE2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8,
                    yCbCrBuffer.width >> yCbCrBuffer.hdec,
                    yCbCrBuffer.height >> yCbCrBuffer.vdec,
                    0, gl.RED, gl.UNSIGNED_BYTE, null);
    }

    const start = performance.now();
    let lastLapTime = start;
    function lap(name: string) {
      let now = performance.now();
      const diff = now - lastLapTime;
      lastLapTime = now;
      trace && console.log(diff.toFixed(2) + " ms");
    }

    // Update
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, yCbCrBuffer.strideY);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
                     yCbCrBuffer.width,
                     yCbCrBuffer.height,
                     gl.RED, gl.UNSIGNED_BYTE, yCbCrBuffer.bytesY);
    lap("Upload Y");
    gl.activeTexture(gl.TEXTURE1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, yCbCrBuffer.strideCb);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
                     yCbCrBuffer.width >> yCbCrBuffer.hdec,
                     yCbCrBuffer.height >> yCbCrBuffer.vdec,
                     gl.RED, gl.UNSIGNED_BYTE, yCbCrBuffer.bytesCb);
    lap("Upload Cb");
    gl.activeTexture(gl.TEXTURE2);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, yCbCrBuffer.strideCr);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0,
                     yCbCrBuffer.width >> yCbCrBuffer.hdec,
                     yCbCrBuffer.height >> yCbCrBuffer.vdec,
                     gl.RED, gl.UNSIGNED_BYTE, yCbCrBuffer.bytesCr);
    lap("Upload Cr");
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    lap("Draw");
    trace && console.log('total:', (performance.now() - start).toFixed(2));
    this.checkError();
  };
}
