import * as React from "react";

import Paper from 'material-ui/Paper';
import Dialog from 'material-ui/Dialog';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import { grey900, grey800, grey100, grey200, red100, red500, red600, red700, red800, red900, deepOrange500} from 'material-ui/styles/colors';
import { assert, clamp, downloadFile, Decoder, AnalyzerFrame, FrameImage } from "./analyzerTools";
import LinearProgress from 'material-ui/LinearProgress';
import CircularProgress from 'material-ui/CircularProgress';
import { Table, TableBody, TableHeader, TableHeaderColumn, TableRow, TableRowColumn } from 'material-ui/Table';

const MAX_FRAME_BUFFER_SIZE = 64;

declare var YCbCrFrameSink;

function prepareBuffer(image: FrameImage) {
  return {
    strideY: image.Y.stride,
    bytesY: new Uint8Array(image.Y.buffer),

    strideCb: image.U.stride,
    bytesCb: new Uint8Array(image.U.buffer),

    strideCr: image.V.stride,
    bytesCr: new Uint8Array(image.V.buffer),

    width: image.Y.width,
    height: image.Y.height,

    vdec: 1,
    hdec: 1
  };
}

interface PlayerComponentProps {
  video: {decoderUrl: string, videoUrl: string, decoderName: string}
  bench: number
}

export class PlayerComponent extends React.Component<PlayerComponentProps, {
  decoder: Decoder;
  status: string;
  playInterval: number;
  playbackFrameRate: number;

  maxFrameBufferSize: number;
  showDetails: boolean;

  baseFrameOffset: number;
  frameOffset: number;
}> {
  canvas: HTMLCanvasElement;
  decoder: Decoder;
  sink: any;

  playerInterval: number;
  fetchPumpInterval: number;

  constructor() {
    super();
    this.state = {
      decoder: null,
      status: "",
      playInterval: 0,
      playbackFrameRate: 30,
      maxFrameBufferSize: MAX_FRAME_BUFFER_SIZE,
      showDetails: true,
      frameOffset: 0,
      baseFrameOffset: 0
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
    let self = this;
    this.playerInterval = setInterval(() => {
      self.advanceOffset(true, false);
      self.forceUpdate();
    }, 1000 / this.state.decoder.frameRate);
  }

  evictFrame() {
    if (this.frameBuffer.length < this.state.maxFrameBufferSize) {
      return;
    }
    let frame = this.frameBuffer.shift();
    this.state.decoder.releaseFrameImageBuffers(frame.frameImage);
    frame.frameImage = null; // Release Buffer
    this.setState({baseFrameOffset: this.state.baseFrameOffset + 1} as any);
  }

  componentDidMount() {
    Mousetrap.bind(['space'], (e) => {
      this.playPause();
      e.preventDefault();
    });
    Mousetrap.bind(['.'], (e) => {
      this.advanceOffset(true);
      e.preventDefault();
    });
    Mousetrap.bind([','], () => {
      this.advanceOffset(false);
    });
    Mousetrap.bind(['r'], () => {
      this.setState({frameOffset: 0} as any);
    });
    this.setState({ status: "Loading Decoder" } as any);

    Decoder.loadDecoder(this.props.video.decoderUrl).then(decoder => {
    // Decoder.loadDecoder("https://arewecompressedyet.com/runs/cdef_ref@2017-04-15T22:02:54.396Z/js/decoder.js").then(decoder => {
      this.setState({ status: "Downloading Video" } as any);
      // downloadFile(".media/sintel_all_960.ivf").then(bytes => {
      downloadFile(this.props.video.videoUrl).then(bytes => {
      // downloadFile(".media/market.ivf").then(bytes => {
        decoder.openFileBytes(bytes);
        decoder.setLayers(0);
        this.setState({ decoder } as any);
        this.setState({ status: "Ready" } as any);
        this.initialize(decoder);
      });
    });
  }

  fetchRequestsInFlight = 0;
  fetchBuffer: AnalyzerFrame[] = [];
  fetchFrames() {
    const fetchBufferMaxSize = 8;
    if (this.fetchBuffer.length + this.fetchRequestsInFlight >= fetchBufferMaxSize) {
      return;
    }
    this.state.decoder.readFrame().then(frames => {
      assert(frames.length === 1);
      this.fetchRequestsInFlight--;
      this.fetchBuffer.push(frames[0]);
      this.forceUpdate();
    }).catch(() => {
      this.fetchRequestsInFlight--;
      clearInterval(this.fetchPumpInterval);
      this.fetchPumpInterval = 0;
    });
    this.fetchRequestsInFlight++;
  }

  /**
   * Fetch frames as long as there's more room in the buffer.
   */
  startFetchPump() {
    this.fetchPumpInterval = setInterval(() => {
      this.fetchFrames();
    }, 1);

    // Fill frame buffer.
    setInterval(() => {
      this.drainFetchBuffer();
    }, 1);
  }

  drainFetchBuffer() {
    while (this.frameBuffer.length < this.state.maxFrameBufferSize) {
      if (this.fetchBuffer.length) {
        let frame = this.fetchBuffer.shift();
        this.frameBuffer.push(frame);
        this.frames.push(frame);
      } else {
        return;
      }
    }
  }
  initialize(decoder: Decoder) {
    decoder.readFrame().then(frames => {
      frames.forEach(frame => {
        this.frames.push(frame);
        this.frameBuffer.push(frame);
      });
      let image = frames[0].frameImage;
      this.canvas.width = image.Y.width;
      this.canvas.height = image.Y.height;
      this.sink = new YCbCrFrameSink(this.canvas, {
        picX: 0, picY: 0, picWidth: image.Y.width, picHeight: image.Y.height
      });
      this.forceUpdate();
      this.startFetchPump();
      if (this.props.bench) {
        this.playPause();
      }
    });
  }

  lastFrameImage: FrameImage;
  lastFrameImageDrawTime: number;
  drawFrame(index: number) {
    if (index >= this.frameBuffer.length) {
      return;
    }
    let image = this.frameBuffer[index].frameImage;
    if (this.lastFrameImage === image) {
      return;
    } else {
       let elapsed = performance.now() - this.lastFrameImageDrawTime;
      // console.log("Time Since Last Draw Frame: " + elapsed);
    }
    this.sink.drawFrame(prepareBuffer(image));
    this.lastFrameImage = image;
    this.lastFrameImageDrawTime = performance.now();
  }

  advanceOffset(forward: boolean, userTriggered = true) {
    if (userTriggered) {
      this.pauseIfPlaying();
    }
    if (forward && this.state.frameOffset == this.frameBuffer.length - 1) {
      this.evictFrame();
      this.forceUpdate();
      return;
    }
    let frameOffset = this.state.frameOffset + (forward ? 1 : -1);
    if (this.frameBuffer.length) {
      frameOffset = clamp(frameOffset, 0, this.frameBuffer.length - 1);
    } else {
      frameOffset = 0;
    }
    this.setState({frameOffset} as any);
  }

  render() {
    let valueStyle = { textAlign: "right", fontSize: "12px" };

    this.drainFetchBuffer();
    this.drawFrame(this.state.frameOffset);

    let allStats, lastStats, benchStats;
    if (this.state.decoder) {
      let length = this.frames.length;
      allStats = this.getFrameDecodeStats(0, length);
      lastStats = this.getFrameDecodeStats(length - this.state.decoder.frameRate, length);
      if (this.props.bench && length >= this.props.bench) {
        benchStats = this.getFrameDecodeStats(0, this.props.bench);
      }
    }

    return <div>
      <canvas className="playerCanvas" ref={(self: any) => this.canvas = self}/>
      <LinearProgress style={{borderRadius: "0px"}} color={red800} mode="determinate" value={this.frameBuffer.length} min={0} max={this.state.maxFrameBufferSize}/>
      <Toolbar style={{backgroundColor: grey800}} >
        <ToolbarGroup firstChild={true}>
          <IconButton onClick={this.advanceOffset.bind(this, false)} tooltip="Previous: ," tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">skip_previous</FontIcon>
          </IconButton>
          <IconButton onClick={this.playPause.bind(this)} tooltip={this.playerInterval ? "Pause" : "Play"} tooltipPosition="top-right">
            <FontIcon className="material-icons md-24">{this.playerInterval ? "stop" : "play_arrow"}</FontIcon>
          </IconButton>
          <IconButton onClick={this.advanceOffset.bind(this, true)} tooltip="Next: ." tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">skip_next</FontIcon>
          </IconButton>
        </ToolbarGroup>
      </Toolbar>
      <div className="playerTableContainer">
        { this.state.showDetails && this.state.decoder &&
          <Table>
            <TableBody displayRowCheckbox={false}>
              <TableRow>
                <TableRowColumn>Frame # (Base + Offset)</TableRowColumn>
                <TableRowColumn style={{ textAlign: "right" }}>{this.state.baseFrameOffset + 1} + {this.state.frameOffset} = {this.state.baseFrameOffset + 1 + this.state.frameOffset}</TableRowColumn>
              </TableRow>
              <TableRow>
                <TableRowColumn>Frame Buffer</TableRowColumn>
                <TableRowColumn style={{ textAlign: "right" }}>{this.frameBuffer.length}</TableRowColumn>
              </TableRow>
              <TableRow>
                <TableRowColumn>Fetch Buffer</TableRowColumn>
                <TableRowColumn style={{ textAlign: "right" }}>{this.fetchBuffer.length}</TableRowColumn>
              </TableRow>
              <TableRow>
                <TableRowColumn>Decoded Frames</TableRowColumn>
                <TableRowColumn style={{ textAlign: "right" }}>{this.frames.length}</TableRowColumn>
              </TableRow>
              { this.frameBuffer.length &&
                <TableRow>
                  <TableRowColumn>Frame Decode Time (ms)</TableRowColumn>
                  <TableRowColumn style={{ textAlign: "right" }}>{this.frameBuffer[this.state.frameOffset].decodeTime.toFixed(2)}</TableRowColumn>
                </TableRow>
              }
              <TableRow>
                <TableRowColumn>All Frame Decode Time</TableRowColumn>
                <TableRowColumn style={{ textAlign: "right" }}>{allStats.avg.toFixed(2)} avg, {allStats.std.toFixed(2)} std, {allStats.min.toFixed(2)} min, {allStats.max.toFixed(2)} max</TableRowColumn>
              </TableRow>
              <TableRow>
                <TableRowColumn>Last {this.state.decoder.frameRate} Frame Decode Time</TableRowColumn>
                <TableRowColumn style={{ textAlign: "right" }}>{lastStats.avg.toFixed(2)} avg, {lastStats.std.toFixed(2)} std, {lastStats.min.toFixed(2)} min, {lastStats.max.toFixed(2)} max</TableRowColumn>
              </TableRow>
              <TableRow>
                <TableRowColumn>Frame Info</TableRowColumn>
                <TableRowColumn style={{ textAlign: "right" }}>
                  {this.canvas.width} x {this.canvas.height}{' '}
                  {this.state.decoder.frameRate} fps
                </TableRowColumn>
              </TableRow>
              { this.props.bench &&
                <TableRow>
                  <TableRowColumn>Benchmark (Worker Frame Decode Time Only)</TableRowColumn>
                  { benchStats ?
                    <TableRowColumn style={{ textAlign: "right", color: deepOrange500}}>{benchStats.avg.toFixed(2)} avg, {benchStats.std.toFixed(2)} std, {benchStats.min.toFixed(2)} min, {benchStats.max.toFixed(2)} max</TableRowColumn> :
                    <TableRowColumn style={{ textAlign: "right", color: deepOrange500}}>Benchmarking {this.frames.length} of {this.props.bench} Frames <CircularProgress color={deepOrange500} size={14} thickness={3}/></TableRowColumn>
                  }
                </TableRow>
              }
            </TableBody>
          </Table>
        }
      </div>
    </div>;
  }

  getFrameDecodeStats(start, end) {
    let sum = 0;
    let max = Number.MIN_VALUE;
    let min = Number.MAX_VALUE;
    let frames = this.frames.slice(start, end);
    frames.forEach(frame => {
      sum += frame.decodeTime;
      max = Math.max(max, frame.decodeTime);
      min = Math.min(min, frame.decodeTime);
    });
    let avg = sum / frames.length;
    let std = 0;
    frames.forEach(frame => {
      let diff = frame.decodeTime - avg;
      std += diff * diff;
    });
    std = Math.sqrt(std / frames.length);
    return {
      avg,
      min,
      max,
      std
    };
  }
}
