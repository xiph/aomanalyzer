import * as React from 'react';

import Paper from 'material-ui/Paper';
import Dialog from 'material-ui/Dialog';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import Checkbox from 'material-ui/Checkbox';
import {
  grey900,
  grey800,
  grey100,
  grey200,
  red100,
  red500,
  red600,
  red700,
  red800,
  red900,
  deepOrange500,
} from 'material-ui/styles/colors';
import { assert, clamp, downloadFile, Decoder, AnalyzerFrame, FrameImage } from './analyzerTools';
import LinearProgress from 'material-ui/LinearProgress';
import CircularProgress from 'material-ui/CircularProgress';
import RaisedButton from 'material-ui/RaisedButton';
import FlatButton from 'material-ui/FlatButton';
import { Table, TableBody, TableHeader, TableHeaderColumn, TableRow, TableRowColumn } from 'material-ui/Table';
import Toggle from 'material-ui/Toggle';
import TextField from 'material-ui/TextField';
import { YUVCanvas } from '../YUVCanvas';

declare let dragscroll;
const MAX_FRAME_BUFFER_SIZE = 300;

function fixedRatio(n: number) {
  if ((n | 0) == n) {
    return String(n);
  }
  return n.toFixed(2);
}

function prepareBuffer(image: FrameImage) {
  return {
    hashCode: image.hashCode,

    strideY: image.Y.stride,
    bytesY: new Uint8Array(image.Y.buffer),

    strideCb: image.U.stride,
    bytesCb: new Uint8Array(image.U.buffer),

    strideCr: image.V.stride,
    bytesCr: new Uint8Array(image.V.buffer),

    width: image.Y.width,
    height: image.Y.height,

    vdec: 1,
    hdec: 1,
  };
}

interface PlayerComponentProps {
  video: { decoderUrl: string; videoUrl: string; decoderName: string };
  bench: number;
  areDetailsVisible: boolean;
  onScroll?: (top: number, left: number) => void;
  shouldFitWidth?: boolean;
  scale?: number;
  scrollTop?: number;
  scrollLeft?: number;
  labelPrefix?: string;
  isLooping: boolean;
  onInitialized?: () => void;
}

export class PlayerComponent extends React.Component<
  PlayerComponentProps,
  {
    decoder: Decoder;
    status: string;
    playInterval: number;
    playbackFrameRate: number;
    maxFrameBufferSize: number;
    baseFrameOffset: number;
    frameOffset: number;
  }
> {
  public static defaultProps: PlayerComponentProps = {
    scale: 1 / window.devicePixelRatio,
    scrollTop: 0,
    scrollLeft: 0,
    label: '',
    loop: false,
    shouldFitWidth: true,
  } as any;

  canvasContainer: HTMLDivElement;
  canvas: HTMLCanvasElement;
  sink: YUVCanvas;

  playerInterval: number;
  fetchPumpInterval: number;
  drainFetchPumpInterval: number;

  constructor() {
    super();
    this.state = {
      decoder: null,
      status: '',
      playInterval: 0,
      playbackFrameRate: 30,
      maxFrameBufferSize: MAX_FRAME_BUFFER_SIZE,
      frameOffset: 0,
      baseFrameOffset: 0,
    };
  }

  frames: AnalyzerFrame[] = [];
  frameBuffer: AnalyzerFrame[] = [];

  pauseIfPlaying() {
    if (this.playerInterval) {
      clearInterval(this.playerInterval);
      this.playerInterval = 0;
    }
  }

  playPause() {
    if (!this.state.decoder) {
      return;
    }
    if (this.playerInterval) {
      this.pauseIfPlaying();
      return;
    }
    const self = this;
    this.playerInterval = window.setInterval(() => {
      self.advanceOffset(true, false);
      self.forceUpdateIfMounted();
    }, 1000 / this.state.decoder.frameRate);
  }

  evictFrame() {
    if (this.frameBuffer.length < this.state.maxFrameBufferSize) {
      return;
    }
    const frame = this.frameBuffer.shift();
    this.state.decoder.releaseFrameImageBuffers(frame.frameImage);
    frame.frameImage = null; // Release Buffer
    this.setState({ baseFrameOffset: this.state.baseFrameOffset + 1 } as any);
  }

  /**
   * Not the React way.
   */
  isComponentMounted = false;

  componentDidMount() {
    this.setState({ status: 'Loading Decoder' } as any);

    Decoder.loadDecoder(this.props.video.decoderUrl).then((decoder) => {
      this.setState({ status: 'Downloading Video' } as any);
      downloadFile(this.props.video.videoUrl).then((bytes) => {
        decoder.openFileBytes(bytes);
        decoder.setLayers(0);
        this.setState({ decoder } as any);
        this.setState({ status: 'Ready' } as any);
        this.initialize(decoder);
      });
    });
    this.isComponentMounted = true;
  }

  componentWillUnmount() {
    this.pauseIfPlaying();
    this.stopFetchPump();
    this.isComponentMounted = false;
    // Clean up to avoid leaks.
    this.frames.length = 0;
    this.frameBuffer.length = 0;
    this.fetchBuffer.length = 0;
    this.lastFrameImage = null;
    this.state.decoder.unload();
    (this.state as any).decoder = null; // setState() doesn't work in componentWillUnmount.
  }

  forceUpdateIfMounted() {
    if (this.isComponentMounted) {
      this.forceUpdate();
    } else {
      console.warn("Shouldn't be updating anymore.");
    }
  }

  fetchRequestsInFlight = 0;
  fetchBuffer: AnalyzerFrame[] = [];
  fetchFrames() {
    const fetchBufferMaxSize = 8;
    if (this.fetchBuffer.length + this.fetchRequestsInFlight >= fetchBufferMaxSize) {
      return;
    }
    this.state.decoder
      .readFrame()
      .then((frames) => {
        assert(frames.length === 1);
        this.fetchRequestsInFlight--;
        this.fetchBuffer.push(frames[0]);
        this.forceUpdateIfMounted();
      })
      .catch(() => {
        this.fetchRequestsInFlight--;
        this.stopFetchPump();
      });
    this.fetchRequestsInFlight++;
  }

  /**
   * Fetch frames as long as there's more room in the buffer.
   */
  startFetchPump() {
    this.fetchPumpInterval = window.setInterval(() => {
      this.fetchFrames();
    }, 1);

    // Fill frame buffer.
    this.drainFetchPumpInterval = window.setInterval(() => {
      this.drainFetchBuffer();
    }, 1);
  }

  stopFetchPump() {
    clearInterval(this.fetchPumpInterval);
    this.fetchPumpInterval = 0;

    clearInterval(this.drainFetchPumpInterval);
    this.drainFetchPumpInterval = 0;
  }

  drainFetchBuffer() {
    while (this.frameBuffer.length < this.state.maxFrameBufferSize) {
      if (this.fetchBuffer.length) {
        const frame = this.fetchBuffer.shift();
        this.frameBuffer.push(frame);
        this.frames.push(frame);
      } else {
        return;
      }
    }
  }

  initialize(decoder: Decoder) {
    decoder.readFrame().then((frames) => {
      frames.forEach((frame) => {
        this.frames.push(frame);
        this.frameBuffer.push(frame);
      });
      const image = frames[0].frameImage;
      this.canvas.width = image.Y.width;
      this.canvas.height = image.Y.height;
      this.sink = new YUVCanvas(this.canvas);
      this.forceUpdateIfMounted();
      this.startFetchPump();
      if (this.props.bench) {
        this.playPause();
      }
      if (this.props.onInitialized) {
        this.props.onInitialized();
      }
    });
  }

  lastFrameImage: FrameImage;
  lastFrameImageDrawTime: number;
  drawFrame(index: number) {
    if (index >= this.frameBuffer.length) {
      return;
    }
    const image = this.frameBuffer[index].frameImage;
    if (this.lastFrameImage === image) {
      return;
    } else {
      const elapsed = performance.now() - this.lastFrameImageDrawTime;
      // console.log("Time Since Last Draw Frame: " + elapsed);
    }
    this.sink.drawFrame(prepareBuffer(image));
    this.lastFrameImage = image;
    this.lastFrameImageDrawTime = performance.now();
  }

  get decoder(): Decoder {
    return this.state.decoder;
  }

  canAdvanceOffsetWithoutLooping(forward: boolean): boolean {
    if (forward) {
      if (this.state.frameOffset == this.frameBuffer.length - 1) {
        return !!this.fetchBuffer.length;
      }
      return true;
    }
    return true;
  }

  advanceOffset(forward: boolean, userTriggered = true) {
    if (userTriggered) {
      // this.pauseIfPlaying();
    }
    if (forward && this.state.frameOffset == this.frameBuffer.length - 1) {
      if (this.fetchBuffer.length) {
        this.evictFrame();
        this.forceUpdateIfMounted();
      } else if (this.props.isLooping) {
        this.resetFrameOffset();
      }
      return;
    }
    // if (!forward && this.state.frameOffset === 0) {
    //   this.setState({ frameOffset: this.frameBuffer.length - 1 } as any);
    //   return;
    // }
    let frameOffset = this.state.frameOffset + (forward ? 1 : -1);
    if (this.frameBuffer.length) {
      frameOffset = clamp(frameOffset, 0, this.frameBuffer.length - 1);
    } else {
      frameOffset = 0;
    }
    this.setState({ frameOffset } as any);
  }

  resetFrameOffset() {
    this.setState({ frameOffset: 0 } as any);
  }

  ignoreNextScrollEvent = false;
  private updateScroll(top: number, left: number) {
    if (!this.canvasContainer) {
      return;
    }
    this.canvasContainer.scrollTop = top;
    this.canvasContainer.scrollLeft = left;
    this.ignoreNextScrollEvent = true;
  }

  mountCanvasContainer(el: HTMLDivElement) {
    if (!el || this.canvasContainer == el) {
      return;
    }
    this.canvasContainer = el;
    const label = this.props.labelPrefix;
    let lastClientX;
    let lastClientY;
    let mouseDown = false;
    el.addEventListener('mousedown', (e: MouseEvent) => {
      lastClientX = e.clientX - el.offsetLeft;
      lastClientY = e.clientY - el.offsetTop;
      mouseDown = true;
      // TODO: Chrome needs a prefix, but it's also behaving strangely when updating the cursor.
      // I didn't investigate this too much.
      el.style.cursor = 'grabbing';
    });
    document.documentElement.addEventListener('mouseup', (e: MouseEvent) => {
      mouseDown = false;
      el.style.cursor = 'grab';
    });
    document.documentElement.addEventListener('mousemove', (e: MouseEvent) => {
      if (mouseDown) {
        const X = e.pageX - el.offsetLeft;
        const Y = e.pageY - el.offsetTop;
        const dx = -lastClientX + (lastClientX = X);
        const dy = -lastClientY + (lastClientY = Y);
        this.props.onScroll && this.props.onScroll(el.scrollTop - dy, el.scrollLeft - dx);
      }
    });
  }
  componentDidUpdate() {
    this.updateScroll(this.props.scrollTop, this.props.scrollLeft);
  }
  render() {
    const valueStyle = { textAlign: 'right', fontSize: '12px' };

    this.drainFetchBuffer();
    this.drawFrame(this.state.frameOffset);

    let allStats, lastStats, benchStats;
    if (this.state.decoder) {
      const length = this.frames.length;
      allStats = this.getFrameDecodeStats(0, length);
      lastStats = this.getFrameDecodeStats(length - this.state.decoder.frameRate, length);
      if (this.props.bench && length >= this.props.bench) {
        benchStats = this.getFrameDecodeStats(0, this.props.bench);
      }
    }

    if (!this.state.decoder) {
      return (
        <div className="playerCenterContainer">
          <div className="playerCenterContent">
            <CircularProgress size={40} thickness={7} />
            <br />
            <br />
            {this.state.status}
          </div>
        </div>
      );
    }
    const canvasStyle: any = {};
    let scaleLabel = '';
    if (this.props.shouldFitWidth) {
      canvasStyle.width = '100%';
      scaleLabel = ' Fit Width';
    } else if (this.canvas) {
      canvasStyle.width = this.canvas.width * this.props.scale + 'px';
      // scaleLabel = " " + this.props.scale + "X" + (window.devicePixelRatio * this.props.scale) + " : 1";
      scaleLabel = ` ${fixedRatio(window.devicePixelRatio * this.props.scale) + ':1'}`;
    }
    return (
      <div className="maxWidthAndHeight">
        {this.props.labelPrefix && (
          <div className="playerLabel">
            {this.props.labelPrefix} {this.state.baseFrameOffset + 1 + this.state.frameOffset} {scaleLabel}
          </div>
        )}
        <div className="playerCanvasContainer" ref={(self: any) => this.mountCanvasContainer(self)}>
          <canvas className="playerCanvas" ref={(self: any) => (this.canvas = self)} style={canvasStyle} />
        </div>
        <LinearProgress
          style={{ borderRadius: '0px' }}
          color={red800}
          mode="determinate"
          value={this.frameBuffer.length}
          min={0}
          max={this.state.decoder.totalFrames}
        />
        {this.props.areDetailsVisible && this.state.decoder && (
          <div className="playerTableContainer">
            <Table>
              <TableBody displayRowCheckbox={false}>
                <TableRow>
                  <TableRowColumn>Frame # (Base + Offset)</TableRowColumn>
                  <TableRowColumn style={{ textAlign: 'right' }}>
                    {this.state.baseFrameOffset + 1} + {this.state.frameOffset} ={' '}
                    {this.state.baseFrameOffset + 1 + this.state.frameOffset}
                  </TableRowColumn>
                </TableRow>
                <TableRow>
                  <TableRowColumn>Frame Buffer</TableRowColumn>
                  <TableRowColumn style={{ textAlign: 'right' }}>{this.frameBuffer.length}</TableRowColumn>
                </TableRow>
                <TableRow>
                  <TableRowColumn>Fetch Buffer</TableRowColumn>
                  <TableRowColumn style={{ textAlign: 'right' }}>{this.fetchBuffer.length}</TableRowColumn>
                </TableRow>
                <TableRow>
                  <TableRowColumn>Decoded Frames</TableRowColumn>
                  <TableRowColumn style={{ textAlign: 'right' }}>{this.frames.length}</TableRowColumn>
                </TableRow>
                {this.frameBuffer.length && (
                  <TableRow>
                    <TableRowColumn>Frame Decode Time (ms)</TableRowColumn>
                    <TableRowColumn style={{ textAlign: 'right' }}>
                      {this.frameBuffer[this.state.frameOffset].decodeTime.toFixed(2)}
                    </TableRowColumn>
                  </TableRow>
                )}
                <TableRow>
                  <TableRowColumn>All Frame Decode Time</TableRowColumn>
                  <TableRowColumn style={{ textAlign: 'right' }}>
                    {allStats.avg.toFixed(2)} avg, {allStats.std.toFixed(2)} std, {allStats.min.toFixed(2)} min,{' '}
                    {allStats.max.toFixed(2)} max
                  </TableRowColumn>
                </TableRow>
                <TableRow>
                  <TableRowColumn>Last {this.state.decoder.frameRate} Frame Decode Time</TableRowColumn>
                  <TableRowColumn style={{ textAlign: 'right' }}>
                    {lastStats.avg.toFixed(2)} avg, {lastStats.std.toFixed(2)} std, {lastStats.min.toFixed(2)} min,{' '}
                    {lastStats.max.toFixed(2)} max
                  </TableRowColumn>
                </TableRow>
                {this.canvas && (
                  <TableRow>
                    <TableRowColumn>Frame Info</TableRowColumn>
                    <TableRowColumn style={{ textAlign: 'right' }}>
                      {this.canvas.width} x {this.canvas.height} {this.state.decoder.frameRate} fps
                    </TableRowColumn>
                  </TableRow>
                )}
                {this.props.bench && (
                  <TableRow>
                    <TableRowColumn>Benchmark (Worker Frame Decode Time Only)</TableRowColumn>
                    {benchStats ? (
                      <TableRowColumn style={{ textAlign: 'right', color: deepOrange500 }}>
                        {benchStats.avg.toFixed(2)} avg, {benchStats.std.toFixed(2)} std, {benchStats.min.toFixed(2)}{' '}
                        min, {benchStats.max.toFixed(2)} max
                      </TableRowColumn>
                    ) : (
                      <TableRowColumn style={{ textAlign: 'right', color: deepOrange500 }}>
                        Benchmarking {this.frames.length} of {this.props.bench} Frames{' '}
                        <CircularProgress color={deepOrange500} size={14} thickness={3} />
                      </TableRowColumn>
                    )}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  getAllFrameDecodeStats() {
    return this.getFrameDecodeStats(0, this.frames.length);
  }

  getFrameDecodeStats(start: number, end: number) {
    let sum = 0;
    let max = Number.MIN_VALUE;
    let min = Number.MAX_VALUE;
    const frames = this.frames.slice(start, end);
    frames.forEach((frame) => {
      sum += frame.decodeTime;
      max = Math.max(max, frame.decodeTime);
      min = Math.min(min, frame.decodeTime);
    });
    const avg = sum / frames.length;
    let std = 0;
    frames.forEach((frame) => {
      const diff = frame.decodeTime - avg;
      std += diff * diff;
    });
    std = Math.sqrt(std / frames.length);
    return {
      avg,
      min,
      max,
      std,
      count: frames.length,
    };
  }
}
