import * as React from "react";

import Paper from 'material-ui/Paper';
import Dialog from 'material-ui/Dialog';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import Checkbox from 'material-ui/Checkbox';
import { grey900, grey800, grey100, grey200, red100, red500, red600, red700, red800, red900, deepOrange500 } from 'material-ui/styles/colors';
import { assert, clamp, downloadFile, Decoder, AnalyzerFrame, FrameImage } from "./analyzerTools";
import LinearProgress from 'material-ui/LinearProgress';
import CircularProgress from 'material-ui/CircularProgress';
import RaisedButton from 'material-ui/RaisedButton';
import FlatButton from 'material-ui/FlatButton';
import { Table, TableBody, TableHeader, TableHeaderColumn, TableRow, TableRowColumn } from 'material-ui/Table';
import Toggle from 'material-ui/Toggle';
import TextField from 'material-ui/TextField';

declare var dragscroll;
const MAX_FRAME_BUFFER_SIZE = 60;
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

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

interface PlayerSplitComponentProps {
  videos: { decoderUrl: string, videoUrl: string, decoderName: string }[]
  vote: boolean
}

export class PlayerSplitComponent extends React.Component<PlayerSplitComponentProps, {
  scale: number;
  fit: boolean;
  playing: boolean;
  focus: number;
  scrollOriginIndex: number;
  scrollTop: number;
  scrollLeft: number;
  showVoterIDDialog: boolean;
  voterID: string;
}> {
  constructor() {
    super();
    this.state = {
      scale: 1,
      fit: true,
      playing: false,
      focus: -1,
      scrollTop: 0,
      scrollLeft: 0,
      showVoterIDDialog: false,
      voterID: "XYZ"
    } as any;
  }
  players: PlayerComponent[] = [];
  playPause() {
    this.setState({ playing: !this.state.playing } as any);
    this.players.forEach(player => player.playPause());
  }
  advanceOffset(forward: boolean, userTriggered = true) {
    this.players.forEach(player => player.advanceOffset(forward, userTriggered));
  }
  resetFrameOffset() {
    this.players.forEach(player => player.resetFrameOffset());
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
      this.resetFrameOffset();
    });
    Mousetrap.bind(['f'], () => {
      this.setState({ fit: !this.state.fit } as any);
    });
    Mousetrap.bind([']'], () => {
      this.zoom(1);
    });
    Mousetrap.bind(['['], () => {
      this.zoom(-1)
    });
    Mousetrap.bind(['`'], () => {
      setFocus(-1);
    });
    let self = this;
    function setFocus(focus: number) {
      self.setState({ focus } as any);
    }
    for (let i = 1; i <= this.props.videos.length; i++) {
      Mousetrap.bind([String(i)], setFocus.bind(this, i - 1));
    }
  }
  zoom(delta: number) {
    let scale = this.state.scale;
    let newScale = Math.max(1, Math.min(32, scale + delta));
    let ratio = newScale / scale;
    this.setState({
      scale: newScale,
      scrollTop: this.state.scrollTop * ratio,
      scrollLeft: this.state.scrollLeft * ratio
    } as any);
  }
  mountPlayer(index: number, player: PlayerComponent) {
    this.players[index] = player;
  }
  onScroll(index: number, top: number, left: number) {
    this.setState({ scrollOriginIndex: index, scrollTop: top, scrollLeft: left } as any);
  }
  onVote(index: number) {
    this.setState({showVoterIDDialog: true} as any);
  }
  render() {
    let panes = this.props.videos.map((video, i) => {
      return <div key={i} className="playerSplitVerticalContent" style={{ display: (this.state.focus >= 0 && this.state.focus != i) ? "none" : "" }}>
        <PlayerComponent ref={(self: any) => this.mountPlayer(i, self)}
          onScroll={this.onScroll.bind(this, i)}
          video={video}
          bench={0}
          showDetails={false}
          fit={this.state.fit}
          scale={this.state.scale}
          scrollTop={this.state.scrollTop}
          scrollLeft={this.state.scrollLeft}
          label={ABC[i]}
        />
      </div>
    })
    let voteButtons = null;
    if (this.props.vote) {
      voteButtons = this.props.videos.map((video, i) => {
        return <RaisedButton key={i} label={ABC[i] + " is better"} onTouchTap={this.onVote.bind(this, i)} />
      })
      voteButtons.push(<RaisedButton key="tie" label={"Tie"} onTouchTap={this.onVote.bind(this, -1)} />)
    }
    return <div className="maxWidthAndHeight">
      <Dialog modal={true}
        title="Voter ID"
        open={this.state.showVoterIDDialog}
        actions={[<FlatButton
          label="Ok"
          primary={true}
          onTouchTap={() => { this.setState({showVoterIDDialog: false} as any) }}
        />]}
      >
      <TextField defaultValue={this.state.voterID} style={{width: "100%"}}/>
      </Dialog>
      <div className="playerSplitVerticalContainer">
        {panes}
      </div>
      <Toolbar>
        <ToolbarGroup firstChild={true}>
          <IconButton onClick={this.resetFrameOffset.bind(this)} tooltip="Replay: r" tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">replay</FontIcon>
          </IconButton>
          <IconButton onClick={this.advanceOffset.bind(this, false)} tooltip="Previous: ," tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">skip_previous</FontIcon>
          </IconButton>
          {/*<IconButton onClick={this.playPause.bind(this)} tooltip={"Play / Pause"} tooltipPosition="top-right">
            <FontIcon className="material-icons md-24">{this.state.playing ? "stop" : "play_arrow"}</FontIcon>
          </IconButton>*/}
          <IconButton onClick={this.advanceOffset.bind(this, true)} tooltip="Next: ." tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">skip_next</FontIcon>
          </IconButton>
          <IconButton onClick={this.zoom.bind(this, -1)} tooltip="Zoom Out: [" tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">zoom_out</FontIcon>
          </IconButton>
          <IconButton onClick={this.zoom.bind(this, +1)} tooltip="Zoom In: ]" tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">zoom_in</FontIcon>
          </IconButton>
          <Toggle style={{maxWidth: 120}} labelPosition="right" toggled={this.state.fit} onToggle={(event, fit) => this.setState({fit} as any)}
            label="Fit Width"
          />
          {/*<span className="splitTextContent" style={{ width: "256px" }}>
            Frame: {this.state.activeFrame + 1} of {this.props.groups[0].length}
          </span>*/}
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarTitle text="Vote" />
          {voteButtons}
        </ToolbarGroup>
      </Toolbar>
    </div>
  }
}

interface PlayerComponentProps {
  video: { decoderUrl: string, videoUrl: string, decoderName: string };
  bench: number;
  showDetails: boolean;
  onScroll?: (top: number, left: number) => void;
  fit?: boolean;
  scale?: number;
  scrollTop?: number;
  scrollLeft?: number;
  label: string;
}

export class PlayerComponent extends React.Component<PlayerComponentProps, {
  decoder: Decoder;
  status: string;
  playInterval: number;
  playbackFrameRate: number;
  maxFrameBufferSize: number;
  baseFrameOffset: number;
  frameOffset: number;
}> {
  public static defaultProps: PlayerComponentProps = {
    scale: 1,
    scrollTop: 0,
    scrollLeft: 0,
    label: ""
  } as any;

  canvasContainer: HTMLDivElement;
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
    this.setState({ baseFrameOffset: this.state.baseFrameOffset + 1 } as any);
  }

  componentDidMount() {
    this.setState({ status: "Loading Decoder" } as any);

    Decoder.loadDecoder(this.props.video.decoderUrl).then(decoder => {
      this.setState({ status: "Downloading Video" } as any);
      downloadFile(this.props.video.videoUrl).then(bytes => {
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
      if (this.fetchBuffer.length) {
        this.evictFrame();
        this.forceUpdate();
      }
      return;
    }
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
    el.onscroll = () => {
      if (this.ignoreNextScrollEvent) {
        this.ignoreNextScrollEvent = false;
        return;
      }
      this.props.onScroll && this.props.onScroll(el.scrollTop, el.scrollLeft);
    };
    let lastClientX;
    let lastClientY;
    let mouseDown = false;
    el.addEventListener("mousedown", (e: MouseEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      mouseDown = true;
    });
    el.addEventListener("mouseup", (e: MouseEvent) => {
      mouseDown = false;
    });
    el.addEventListener("mousemove", (e: MouseEvent) => {
      if (mouseDown) {
        let dx = -lastClientX + (lastClientX = e.clientX);
        let dy = -lastClientY + (lastClientY = e.clientY);
        el.scrollLeft -= dx;
        el.scrollTop -= dy;
      }
    });
  }
  componentDidUpdate() {
    this.updateScroll(this.props.scrollTop, this.props.scrollLeft);
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

    if (!this.state.decoder) {
      return <div className="playerCenterContainer">
        <div className="playerCenterContent">
          <CircularProgress size={40} thickness={7} /><br /><br />
          {this.state.status}
        </div>
      </div>
    }
    let canvasStyle: any = {};
    if (this.props.fit) {
      canvasStyle.width = (this.props.scale * 100) + "%";
    } else {
      canvasStyle.width = (this.canvas.width * this.props.scale) + "px";
    }
    return <div className="maxWidthAndHeight">
      <div className="playerLabel">{this.props.label} {this.state.baseFrameOffset + 1 + this.state.frameOffset}</div>
      <div className="playerCanvasContainer" ref={(self: any) => this.mountCanvasContainer(self)}>
        <canvas className="playerCanvas" ref={(self: any) => this.canvas = self} style={canvasStyle} />
      </div>
      <LinearProgress style={{ borderRadius: "0px" }} color={red800} mode="determinate" value={this.frameBuffer.length} min={0} max={this.state.maxFrameBufferSize} />
      {this.props.showDetails && this.state.decoder &&
        <div className="playerTableContainer">
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
              {this.frameBuffer.length &&
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
              {this.canvas &&
                <TableRow>
                  <TableRowColumn>Frame Info</TableRowColumn>
                  <TableRowColumn style={{ textAlign: "right" }}>
                    {this.canvas.width} x {this.canvas.height}{' '}
                    {this.state.decoder.frameRate} fps
                  </TableRowColumn>
                </TableRow>
              }
              {this.props.bench &&
                <TableRow>
                  <TableRowColumn>Benchmark (Worker Frame Decode Time Only)</TableRowColumn>
                  {benchStats ?
                    <TableRowColumn style={{ textAlign: "right", color: deepOrange500 }}>{benchStats.avg.toFixed(2)} avg, {benchStats.std.toFixed(2)} std, {benchStats.min.toFixed(2)} min, {benchStats.max.toFixed(2)} max</TableRowColumn> :
                    <TableRowColumn style={{ textAlign: "right", color: deepOrange500 }}>Benchmarking {this.frames.length} of {this.props.bench} Frames <CircularProgress color={deepOrange500} size={14} thickness={3} /></TableRowColumn>
                  }
                </TableRow>
              }
            </TableBody>
          </Table>
        </div>
      }
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
