import * as React from "react";

import { getColor, makePattern, reverseMap, palette, hashString, makeBlockSizeLog2MapByValue, HEAT_COLORS, Decoder, Rectangle, Size, AnalyzerFrame, loadFramesFromJson, downloadFile, Histogram, Accounting, AccountingSymbolMap, clamp, Vector, localFiles, localFileProtocol } from "./analyzerTools";
import { HistogramComponent } from "./Histogram";
import { TRACE_RENDERING, padLeft, log2, assert, unreachable } from "./analyzerTools";

import RaisedButton from 'material-ui/RaisedButton';
import Popover from 'material-ui/Popover';
import { Tabs, Tab } from 'material-ui/Tabs';
import SelectField from 'material-ui/SelectField';
import IconMenu from 'material-ui/IconMenu';
import MenuItem from 'material-ui/MenuItem';
import Divider from 'material-ui/Divider';
import Menu from 'material-ui/Menu';
import { Table, TableBody, TableHeader, TableHeaderColumn, TableRow, TableRowColumn } from 'material-ui/Table';
import DropDownMenu from 'material-ui/DropDownMenu';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import { red500, yellow500, blue500 } from 'material-ui/styles/colors';
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import Checkbox from 'material-ui/Checkbox';
import TextField from 'material-ui/TextField';
import Slider from 'material-ui/Slider';

declare const Mousetrap;
declare var shortenUrl;
declare var document;
declare var window;

const SUPER_BLOCK_SIZE = 64;
const ZOOM_WIDTH = 500;
const ZOOM_SOURCE = 64;
const DEFAULT_CONFIG = "--disable-multithread --disable-runtime-cpu-detect --target=generic-gnu --enable-accounting --enable-analyzer --enable-aom_highbitdepth --extra-cflags=-D_POSIX_SOURCE --enable-inspection --disable-docs --disable-webm-io --enable-experimental";
const DERING_STRENGTHS = 21;
const CLPF_STRENGTHS = 4;

enum VisitMode {
  Block,
  SuperBlock,
  TransformBlock,
  Tile
}

enum HistogramTab {
  Bits,
  Symbols,
  BlockSize,
  TransformSize,
  TransformType,
  PredictionMode,
  UVPredictionMode,
  MotionMode,
  CompoundType,
  Skip,
  DualFilterType
}

function colorScale(v, colors) {
  return colors[Math.round(v * (colors.length - 1))];
}

function keyForValue(o: Object, value: any): string {
  if (o) {
    for (let k in o) {
      if (o[k] === value) {
        return k;
      }
    }
  }
  return String(value);
}

function shuffle(array: any[], count: number) {
  // Shuffle Indices
  for (let j = 0; j < count; j++) {
    let a = Math.random() * array.length | 0;
    let b = Math.random() * array.length | 0;
    let t = array[a];
    array[a] = array[b];
    array[b] = t;
  }
}
function blockSizeArea(frame: AnalyzerFrame, size: number) {
  const map = frame.blockSizeLog2Map;
  return (1 << map[size][0]) * (1 << map[size][1]);
}
function forEachValue(o: any, fn: (v: any) => void) {
  for (let n in o) {
    fn(o[n]);
  }
}
function fractionalBitsToString(v: number) {
  if (v > 16) {
    return ((v / 8) | 0).toLocaleString();
  }
  return (v / 8).toLocaleString();
}
function toPercent(v: number) {
  return (v * 100).toFixed(1);
}
function withCommas(v: number) {
  return v.toLocaleString();
}
function toByteSize(v: number) {
  return withCommas(v) + " Bytes";
}

function getLineOffset(lineWidth: number) {
  return lineWidth % 2 == 0 ? 0 : 0.5;
}

function toCflAlphas(cfl_alpha_idx: number, cfl_alpha_sign: number) {
  cfl_alpha_idx &= 255;
  cfl_alpha_sign &= 7;
  let sign_u = ((cfl_alpha_sign + 1) * 11) >> 5;
  let sign_v = cfl_alpha_sign + 1 - 3 * sign_u;
  let alpha_u = 1 + (cfl_alpha_idx >> 4);
  let alpha_v = 1 + (cfl_alpha_idx & 15);
  let cfl_alpha_u = [0, -1, 1][sign_u] * alpha_u;
  let cfl_alpha_v = [0, -1, 1][sign_v] * alpha_v;
  return [cfl_alpha_u, cfl_alpha_v];
}

function drawVector(ctx: CanvasRenderingContext2D, a: Vector, b: Vector) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.stroke();
  return;
}

function drawLine(ctx: CanvasRenderingContext2D, x, y, dx, dy) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.closePath();
  ctx.stroke();
}

interface BlockVisitor {
  (blockSize: number, c: number, r: number, sc: number, sr: number, bounds: Rectangle, scale: number): void;
}

interface AnalyzerViewProps {
  groups: AnalyzerFrame[][],
  groupNames?: string[],
  playbackFrameRate?: number;
  blind?: number;
  onDecodeAdditionalFrames: (count: number) => void;
  decoderVideoUrlPairs?: { decoderUrl: string, videoUrl: string, decoderName: string }[];
}

interface AlertProps {
  open: boolean;
  onClose: (value: boolean) => void;
  title: string;
  description: string;
}
export class Alert extends React.Component<AlertProps, {
}> {
  constructor(props: AlertProps) {
    super();
  }
  handleAction(value) {
    this.props.onClose(value);
  }
  render() {
    return <div>
      <Dialog
        title={this.props.title}
        actions={[
          <FlatButton
            label="Cancel"
            primary={true}
            onTouchTap={this.handleAction.bind(this, false)}
          />,
          <FlatButton
            label="OK"
            primary={true}
            onTouchTap={this.handleAction.bind(this, true)}
          />
        ]}
        modal={true}
        open={this.props.open}
      >
        {this.props.description}
      </Dialog>
    </div>
  }
}

export class AccountingComponent extends React.Component<{
  symbols: AccountingSymbolMap;
}, {

  }> {
  render() {
    let symbols = this.props.symbols;
    let total = 0;
    forEachValue(symbols, (symbol) => {
      total += symbol.bits;
    });

    let rows = []
    let valueStyle = { textAlign: "right", fontSize: "12px" };
    for (let name in symbols) {
      let symbol = symbols[name];
      rows.push(<TableRow key={name}>
        <TableRowColumn>{name}</TableRowColumn>
        <TableRowColumn style={valueStyle}>{fractionalBitsToString(symbol.bits)}</TableRowColumn>
        <TableRowColumn style={valueStyle}>{toPercent(symbol.bits / total)}</TableRowColumn>
        <TableRowColumn style={valueStyle}>{withCommas(symbol.samples)}</TableRowColumn>
      </TableRow>);
    }

    return <div>
      <Table>
        <TableHeader adjustForCheckbox={false} displaySelectAll={false}>
          <TableRow>
            <TableHeaderColumn style={{ textAlign: "left" }}>Symbol</TableHeaderColumn>
            <TableHeaderColumn style={{ textAlign: "right" }}>Bits {fractionalBitsToString(total)}</TableHeaderColumn>
            <TableHeaderColumn style={{ textAlign: "right" }}>%</TableHeaderColumn>
            <TableHeaderColumn style={{ textAlign: "right" }}>Samples</TableHeaderColumn>
          </TableRow>
        </TableHeader>
        <TableBody displayRowCheckbox={false}>
          {rows}
        </TableBody>
      </Table>
    </div>
  }
}

export class FrameInfoComponent extends React.Component<{
  frame: AnalyzerFrame;
  activeFrame: number;
  activeGroup: number;
}, {

  }> {
  render() {
    let frame = this.props.frame;
    let valueStyle = { textAlign: "right", fontSize: "12px" };
    return <div>
      <Table>
        <TableBody displayRowCheckbox={false}>
          <TableRow>
            <TableRowColumn>Video</TableRowColumn><TableRowColumn style={valueStyle}>{this.props.activeGroup}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Frame Number</TableRowColumn><TableRowColumn style={valueStyle}>{frame.json.frame}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Frame Type</TableRowColumn><TableRowColumn style={valueStyle}>{frame.json.frameType}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Show Frame</TableRowColumn><TableRowColumn style={valueStyle}>{frame.json.showFrame}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>BaseQIndex</TableRowColumn><TableRowColumn style={valueStyle}>{frame.json.baseQIndex}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Frame Size</TableRowColumn><TableRowColumn style={valueStyle}>{frame.image.width} x {frame.image.height}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>MI Size</TableRowColumn><TableRowColumn style={valueStyle}>{1 << frame.miSizeLog2}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>DeltaQ Res / Present Flag</TableRowColumn><TableRowColumn style={valueStyle}>{frame.json.deltaQRes} / {frame.json.deltaQPresentFlag}</TableRowColumn>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  }
}

export class ModeInfoComponent extends React.Component<{
  frame: AnalyzerFrame;
  position: Vector;
}, {

  }> {
  render() {
    let c = this.props.position.x;
    let r = this.props.position.y;
    let json = this.props.frame.json;
    function getProperty(name: string): string {
      if (!json[name]) return "N/A";
      let v = json[name][r][c];
      if (!json[name + "Map"]) return String(v);
      return keyForValue(json[name + "Map"], v);
    }
    function getSuperBlockProperty(name: string): string {
      if (!json[name]) return "N/A";
      let v = json[name][r & ~7][c & ~7];
      if (!json[name + "Map"]) return String(v);
      return keyForValue(json[name + "Map"], v);
    }
    function getMotionVector() {
      let motionVectors = json["motionVectors"];
      if (!motionVectors) return "N/A";
      let v = motionVectors[r][c];
      return `${v[0]},${v[1]} ${v[2]},${v[3]}`;
    }
    function getReferenceFrame() {
      let referenceFrame = json["referenceFrame"];
      if (!referenceFrame) return "N/A";
      let map = json["referenceFrameMap"];
      let v = referenceFrame[r][c];
      let a = v[0] >= 0 ? keyForValue(map, v[0]) : "N/A";
      let b = v[1] >= 0 ? keyForValue(map, v[1]) : "N/A";
      return `${a}, ${b}`;
    }
    function getCFL() {
      if (json["cfl_alpha_idx"] === undefined) {
        return "N/A";
      }
      let cfl_alpha_idx = json["cfl_alpha_idx"][r][c];
      let cfl_alpha_sign = json["cfl_alpha_sign"][r][c];
      let [cfl_alpha_u, cfl_alpha_v] = toCflAlphas(cfl_alpha_idx, cfl_alpha_sign);
      return `${cfl_alpha_u},${cfl_alpha_v}`;
    }
    function getDualFilterType() {
      if (json["dualFilterType"] === undefined) {
        return "N/A";
      }
      let map = json["dualFilterTypeMap"];
      return keyForValue(map, json["dualFilterType"][r][c]);
    }
    function getDeltaQIndex() {
      if (json["delta_q"] === undefined) {
        return "N/A";
      }
      return json["delta_q"][r][c];
    }
    function getSegId() {
      if (json["seg_id"] === undefined) {
        return "N/A";
      }
      return json["seg_id"][r][c];
    }
    let valueStyle = { textAlign: "right", fontSize: "12px" };
    return <div>
      <Table>
        <TableBody displayRowCheckbox={false}>
          <TableRow>
            <TableRowColumn>Block Position: MI (col, row)</TableRowColumn><TableRowColumn style={valueStyle}>({c}, {r})</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Block Size</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("blockSize")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Transform Size</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("transformSize")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Transform Type</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("transformType")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Mode</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("mode")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>UV Mode</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("uv_mode")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Motion Mode</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("motion_mode")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Compound Type</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("compound_type")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Skip</TableRowColumn><TableRowColumn style={valueStyle}>{getProperty("skip")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>CDEF</TableRowColumn><TableRowColumn style={valueStyle}>{getSuperBlockProperty("cdef_level")} / {getSuperBlockProperty("cdef_strength")}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Motion Vectors</TableRowColumn><TableRowColumn style={valueStyle}>{getMotionVector()}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Reference Frame</TableRowColumn><TableRowColumn style={valueStyle}>{getReferenceFrame()}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>CFL</TableRowColumn><TableRowColumn style={valueStyle}>{getCFL()}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Dual Filter Type</TableRowColumn><TableRowColumn style={valueStyle}>{getDualFilterType()}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>DeltaQ Index</TableRowColumn><TableRowColumn style={valueStyle}>{getDeltaQIndex()}</TableRowColumn>
          </TableRow>
          <TableRow>
            <TableRowColumn>Segment ID</TableRowColumn><TableRowColumn style={valueStyle}>{getSegId()}</TableRowColumn>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  }
}

export class AnalyzerView extends React.Component<AnalyzerViewProps, {
  activeFrame: number;
  activeGroup: number;
  scale: number;
  showDecodedImage: boolean;
  showMotionVectors: boolean;
  showReferenceFrames: boolean;
  showBlockGrid: boolean;
  showTileGrid: boolean;
  showSuperBlockGrid: boolean;
  showTransformGrid: boolean;
  showSkip: boolean;
  showFilters: boolean;
  showCDEF: boolean;
  showMode: boolean;
  showUVMode: boolean;
  showMotionMode: boolean;
  showCompoundType: boolean;
  showSegment: boolean;
  showBits: boolean;
  showBitsScale: "frame" | "video" | "videos";
  showBitsMode: "linear" | "heat" | "heat-opaque";
  showBitsFilter: "";
  showTransformType: boolean;
  showTools: boolean;
  showFrameComment: boolean;
  activeHistogramTab: number;
  layerMenuIsOpen: boolean;
  layerMenuAnchorEl: any;

  showDecodeDialog: boolean;
  decodeFrameCount: number;
  activeTab: number;
  playInterval: any;

  showLayersInZoom: boolean;
  lockSelection: boolean;
  layerAlpha: number;
  shareUrl: string;
  showShareUrlDialog: boolean;
}> {
  public static defaultProps: AnalyzerViewProps = {
    groups: [],
    groupNames: null,
    playbackFrameRate: 30,
    blind: 0,
    onDecodeAdditionalFrames: null,
    decoderVideoUrlPairs: []
  };

  activeGroupScore: number[][];
  ratio: number;
  frameSize: Size;
  frameCanvas: HTMLCanvasElement;
  frameContext: CanvasRenderingContext2D;
  displayCanvas: HTMLCanvasElement;
  displayContext: CanvasRenderingContext2D;
  overlayCanvas: HTMLCanvasElement;
  overlayContext: CanvasRenderingContext2D;
  canvasContainer: HTMLDivElement;
  zoomCanvas: HTMLCanvasElement;
  zoomContext: CanvasRenderingContext2D;
  compositionCanvas: HTMLCanvasElement;
  compositionContext: CanvasRenderingContext2D = null;
  mousePosition: Vector;
  mouseZoomPosition: Vector;
  downloadLink: HTMLAnchorElement = null;

  options = {
    // showY: {
    //   key: "y",
    //   description: "Y",
    //   detail: "Display Y image plane.",
    //   updatesImage: true,
    //   default: true,
    //   value: undefined
    // },
    // showU: {
    //   key: "u",
    //   description: "U",
    //   detail: "Display U image plane.",
    //   updatesImage: true,
    //   default: true,
    //   value: undefined
    // },
    // showV: {
    //   key: "v",
    //   description: "V",
    //   detail: "Display V image plane.",
    //   updatesImage: true,
    //   default: true,
    //   value: undefined
    // },
    // showOriginalImage: {
    //   key: "w",
    //   description: "Original Image",
    //   detail: "Display loaded .y4m file.",
    //   updatesImage: true,
    //   default: false,
    //   disabled: true,
    //   value: undefined
    // },
    showDecodedImage: {
      key: "i",
      description: "Decoded Image",
      detail: "Display decoded image.",
      updatesImage: true,
      default: true,
      value: undefined,
      icon: "glyphicon glyphicon-picture" // glyphicon glyphicon-film
    },
    // showPredictedImage: {
    //   key: "p",
    //   description: "Predicted Image",
    //   detail: "Display the predicted image, or the residual if the decoded image is displayed.",
    //   updatesImage: true,
    //   default: false,
    //   value: undefined
    // },
    showSuperBlockGrid: {
      key: "g",
      description: "Super Block Grid",
      detail: "Display the 64x64 super block grid.",
      default: false,
      value: undefined,
      icon: "glyphicon glyphicon-th-large"
    },
    showBlockGrid: {
      key: "s",
      description: "Split Grid",
      detail: "Display block partitions.",
      default: false,
      value: undefined,
      icon: "glyphicon glyphicon-th"
    },
    showTransformGrid: {
      key: "t",
      description: "Transform Grid",
      detail: "Display transform blocks.",
      default: false,
      value: undefined,
      icon: "icon-j"
    },
    showTransformType: {
      key: "y",
      description: "Transform Type",
      detail: "Display transform type.",
      default: false,
      value: undefined,
      icon: "icon-m"
    },
    showMotionVectors: {
      key: "m",
      description: "Motion Vectors",
      detail: "Display motion vectors.",
      default: false,
      value: undefined,
      icon: "icon-u"
    },
    showReferenceFrames: {
      key: "f",
      description: "Frame References",
      detail: "Display frame references.",
      default: false,
      value: undefined,
      icon: "glyphicon glyphicon-transfer"
    },
    showMode: {
      key: "o",
      description: "Mode",
      detail: "Display prediction modes.",
      default: false,
      value: undefined,
      icon: "icon-l"
    },
    showUVMode: {
      key: "p",
      description: "UV Mode",
      detail: "Display UV prediction modes.",
      default: false,
      value: undefined,
      icon: "icon-l"
    },
    showMotionMode: {
      key: "#",
      description: "Motion Mode",
      detail: "Display motion modes.",
      default: false,
      value: undefined,
      icon: "icon-l"
    },
    showCompoundType: {
      key: "@",
      description: "Compound Type",
      detail: "Display compound type.",
      default: false,
      value: undefined,
      icon: "icon-l"
    },
    showSegment: {
      key: "v",
      description: "Show Segment",
      detail: "Display segment.",
      default: false,
      value: undefined,
      icon: "icon-l"
    },
    showBits: {
      key: "b",
      description: "Bits",
      detail: "Display bits.",
      default: false,
      value: undefined,
      icon: "icon-n"
    },
    showSkip: {
      key: "k",
      description: "Skip",
      detail: "Display skip flags.",
      default: false,
      value: undefined,
      icon: "icon-t"
    },
    showFilters: {
      key: "e",
      description: "Filters",
      detail: "Display filters.",
      default: false,
      value: undefined,
      icon: "icon-t"
    },
    showCDEF: {
      key: "d",
      description: "CDEF",
      detail: "Display blocks where the CDEF filter is applied.",
      default: false,
      value: undefined
    },
    showTileGrid: {
      key: "l",
      description: "Tiles",
      detail: "Display tile grid.",
      default: false,
      value: undefined
    }
  };
  constructor(props: AnalyzerViewProps) {
    super();
    let ratio = window.devicePixelRatio || 1;
    let activeGroupScore = [];
    this.state = {
      activeFrame: -1,
      activeGroup: 0,
      scale: 1,
      showBlockGrid: false,
      showTileGrid: false,
      showSuperBlockGrid: false,
      showTransformGrid: false,
      showSkip: false,
      showCDEF: false,
      showMode: false,
      showUVMode: false,
      showMotionMode: false,
      showCompoundType: false,
      showVMode: false,
      showSegment: false,
      showBits: false,
      showBitsScale: "frame",
      showBitsMode: "heat",
      showBitsFilter: "",
      showDecodedImage: true,
      showMotionVectors: false,
      showReferenceFrames: false,
      showTools: !props.blind,
      showFrameComment: false,
      activeHistogramTab: HistogramTab.Bits,
      layerMenuIsOpen: false,
      layerMenuAnchorEl: null,
      showDecodeDialog: false,
      decodeFrameCount: 1,
      activeTab: 0,
      showLayersInZoom: false,
      lockSelection: true,
      layerAlpha: 1,
      shareUrl: "",
      showShareUrlDialog: false
    } as any;
    this.ratio = ratio;
    this.frameCanvas = document.createElement("canvas") as any;
    this.frameContext = this.frameCanvas.getContext("2d");
    this.compositionCanvas = document.createElement("canvas") as any;
    this.compositionContext = this.compositionCanvas.getContext("2d");
    this.mousePosition = new Vector(128, 128);
    this.mouseZoomPosition = new Vector(128, 128);
    this.activeGroupScore = activeGroupScore;
  }
  resetCanvas(w: number, h: number) {
    let scale = this.state.scale;
    // Pad to SUPER_BLOCK_SIZE
    w = (w + (SUPER_BLOCK_SIZE - 1)) & ~(SUPER_BLOCK_SIZE - 1);
    h = (h + (SUPER_BLOCK_SIZE - 1)) & ~(SUPER_BLOCK_SIZE - 1);
    this.frameSize = new Size(w, h);

    this.frameCanvas.width = w;
    this.frameCanvas.height = h;
    this.compositionCanvas.width = w;
    this.compositionCanvas.height = h;

    this.displayCanvas.style.width = (w * scale) + "px";
    this.displayCanvas.style.height = (h * scale) + "px";
    this.canvasContainer.style.width = (w * scale) + "px";
    this.displayCanvas.width = w * scale * this.ratio;
    this.displayCanvas.height = h * scale * this.ratio;
    this.displayContext = this.displayCanvas.getContext("2d");

    this.overlayCanvas.style.width = (w * scale) + "px";
    this.overlayCanvas.style.height = (h * scale) + "px";
    this.overlayCanvas.width = w * scale * this.ratio;
    this.overlayCanvas.height = h * scale * this.ratio;
    this.overlayContext = this.overlayCanvas.getContext("2d");

    this.resetZoomCanvas(null);
  }
  resetZoomCanvas(canvas: HTMLCanvasElement) {
    this.zoomCanvas = canvas;
    if (!this.zoomCanvas) {
      this.zoomContext = null;
      return;
    }
    this.zoomCanvas.style.width = ZOOM_WIDTH + "px";
    this.zoomCanvas.style.height = ZOOM_WIDTH + "px";
    this.zoomCanvas.width = ZOOM_WIDTH * this.ratio;
    this.zoomCanvas.height = ZOOM_WIDTH * this.ratio;
    this.zoomContext = this.zoomCanvas.getContext("2d");
  }
  draw(group: number, index: number) {
    let frame = this.props.groups[group][index];
    // this.frameContext.putImageData(frame.imageData, 0, 0);
    this.frameContext.drawImage(frame.image as any, 0, 0);

    // Draw frameCanvas to displayCanvas
    (this.displayContext as any).imageSmoothingEnabled = false;
    this.displayContext.mozImageSmoothingEnabled = false;
    let dw = this.frameSize.w * this.state.scale * this.ratio;
    let dh = this.frameSize.h * this.state.scale * this.ratio;
    if (this.state.showDecodedImage) {
      this.displayContext.drawImage(this.frameCanvas, 0, 0, dw, dh);
    } else {
      this.displayContext.fillStyle = "#333333";
      this.displayContext.fillRect(0, 0, dw, dh);
    }

    if (this.props.blind) {
      return;
    }

    // Draw Layers
    let scale = this.state.scale;
    let ctx = this.overlayContext;
    let ratio = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, this.frameSize.w * scale * ratio, this.frameSize.h * scale * ratio);

    let src = Rectangle.createRectangleFromSize(this.frameSize);
    let dst = src.clone().multiplyScalar(scale * this.ratio);

    this.drawLayers(frame, ctx, src, dst);
  }
  drawZoom(group: number, index: number) {
    if (!this.zoomCanvas) {
      return;
    }
    TRACE_RENDERING && console.log("drawZoom");
    let frame = this.props.groups[group][index];
    let mousePosition = this.mouseZoomPosition.clone().divideScalar(this.state.scale).snap();
    let src = Rectangle.createRectangleCenteredAtPoint(mousePosition, ZOOM_SOURCE, ZOOM_SOURCE);
    let dst = new Rectangle(0, 0, ZOOM_WIDTH * this.ratio, ZOOM_WIDTH * this.ratio);

    this.zoomContext.clearRect(0, 0, dst.w, dst.h);
    if (this.state.showDecodedImage) {
      this.zoomContext.mozImageSmoothingEnabled = false;
      (this.zoomContext as any).imageSmoothingEnabled = false;
      this.zoomContext.clearRect(dst.x, dst.y, dst.w, dst.h);
      this.zoomContext.drawImage(this.frameCanvas,
        src.x, src.y, src.w, src.h,
        dst.x, dst.y, dst.w, dst.h);
    }
    if (this.state.showLayersInZoom) {
      this.drawLayers(frame, this.zoomContext, src, dst);
    }
  }
  drawLayers(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    this.state.showSkip && this.drawSkip(frame, ctx, src, dst);
    this.state.showFilters && this.drawFilters(frame, ctx, src, dst);
    this.state.showMode && this.drawMode("mode", frame, ctx, src, dst);
    this.state.showUVMode && this.drawMode("uv_mode", frame, ctx, src, dst);
    this.state.showMotionMode && this.drawMotionMode(frame, ctx, src, dst);
    this.state.showCompoundType && this.drawCompoundType(frame, ctx, src, dst);
    this.state.showSegment && this.drawSegment(frame, ctx, src, dst);
    this.state.showBits && this.drawBits(frame, ctx, src, dst);
    this.state.showCDEF && this.drawCDEF(frame, ctx, src, dst);
    this.state.showTransformType && this.drawTransformType(frame, ctx, src, dst);
    this.state.showMotionVectors && this.drawMotionVectors(frame, ctx, src, dst);
    this.state.showReferenceFrames && this.drawReferenceFrames(frame, ctx, src, dst);
    ctx.globalAlpha = 1;
    this.state.showSuperBlockGrid && this.drawGrid(frame, VisitMode.SuperBlock, "#87CEEB", ctx, src, dst, 2);
    this.state.showTransformGrid && this.drawGrid(frame, VisitMode.TransformBlock, "yellow", ctx, src, dst);
    this.state.showBlockGrid && this.drawGrid(frame, VisitMode.Block, "white", ctx, src, dst);
    this.state.showTileGrid && this.drawGrid(frame, VisitMode.Tile, "orange", ctx, src, dst, 5);
    this.state.showTools && this.drawSelection(frame, ctx, src, dst);
    ctx.restore();
  }
  drawSelection(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let scale = dst.w / src.w;
    let ratio = 1;
    ctx.save();
    let lineOffset = getLineOffset(3);
    ctx.translate(lineOffset, lineOffset);
    ctx.translate(-src.x * scale, -src.y * scale);
    // ctx.strokeStyle = "white";
    // ctx.setLineDash([2, 4]);
    // let w = ZOOM_SOURCE * ratio * scale;
    // ctx.strokeRect(this.mouseZoomPosition.x * ratio - w / 2, this.mouseZoomPosition.y * ratio - w / 2, w, w);
    let r = this.getParentMIRect(frame, this.mousePosition);
    if (r) {
      ctx.strokeStyle = "orange";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x * ratio * scale, r.y * ratio * scale, r.w * ratio * scale, r.h * ratio * scale);
    }
    ctx.restore();
  }
  drawGrid(frame: AnalyzerFrame, mode: VisitMode, color: string, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle, lineWidth = 1) {
    let scale = dst.w / src.w;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    let lineOffset = getLineOffset(lineWidth);
    ctx.translate(lineOffset, lineOffset);
    ctx.translate(-src.x * scale, -src.y * scale);
    ctx.lineWidth = lineWidth;
    this.visitBlocks(mode, frame, (blockSize, c, r, sc, sr, bounds) => {
      bounds.multiplyScalar(scale);
      ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    });
    ctx.restore();
  }
  componentDidMount() {
    if (!this.props.groups.length)
      return;
    this.reset();
    this.installKeyboardShortcuts();
    this.advanceFrame(1);

    this.overlayCanvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.overlayCanvas.addEventListener("mousedown", this.onMouseDown.bind(this));
  }
  componentDidUpdate(prevProps, prevState) {
    let image = this.props.groups[this.state.activeGroup][0].image;
    let w = image.width;
    let h = image.height;
    w = (w + (SUPER_BLOCK_SIZE - 1)) & ~(SUPER_BLOCK_SIZE - 1);
    h = (h + (SUPER_BLOCK_SIZE - 1)) & ~(SUPER_BLOCK_SIZE - 1);
    let frameSizeChanged = this.frameSize.w !== w || this.frameSize.h != h;
    if (this.state.scale != prevState.scale || frameSizeChanged) {
      this.reset();
    }
    if (this.state.activeFrame >= 0) {
      this.draw(this.state.activeGroup, this.state.activeFrame);
      if (this.state.showTools) {
        this.drawZoom(this.state.activeGroup, this.state.activeFrame);
      }
    }
  }
  reset() {
    let image = this.props.groups[this.state.activeGroup][0].image;
    let w = image.width, h = image.height;
    this.resetCanvas(w, h);
  }
  handleSelect(frame) {
    this.setState({
      activeFrame: frame
    } as any);
  }
  playPause() {
    let playInterval = this.state.playInterval;
    if (!playInterval) {
      playInterval = setInterval(() => {
        this.advanceFrame(1);
      }, 1000 / this.props.playbackFrameRate);
    } else {
      clearInterval(playInterval);
      playInterval = 0;
    }
    this.setState({playInterval} as any);
  }
  advanceGroup(delta) {
    let activeGroup = this.state.activeGroup + delta;
    if (activeGroup < 0) {
      activeGroup += this.props.groups.length;
    }
    activeGroup = activeGroup % this.props.groups.length;
    this.setActiveGroup(activeGroup);
  }
  advanceFrame(delta) {
    let activeFrame = this.state.activeFrame + delta;
    if (activeFrame < 0) {
      activeFrame += this.props.groups[0].length;
    }
    activeFrame = activeFrame % this.props.groups[0].length;
    this.setActiveFrame(activeFrame);
  }
  zoom(value) {
    let scale = this.state.scale * value;
    this.setState({ scale } as any);
  }
  installKeyboardShortcuts() {
    let playInterval;
    Mousetrap.bind(['`'], (e) => {
      this.setState({ showFrameComment: !this.state.showFrameComment } as any);
      e.preventDefault();
    });
    Mousetrap.bind(['enter'], (e) => {
      this.activeGroupScore[this.state.activeFrame][this.state.activeGroup] = 1;
      this.forceUpdate();
      e.preventDefault();
    });
    Mousetrap.bind(['space'], (e) => {
      this.playPause();
      e.preventDefault();
    });
    Mousetrap.bind(['.'], (e) => {
      this.advanceFrame(1);
      e.preventDefault();
    });
    Mousetrap.bind([','], () => {
      this.advanceFrame(-1);
    });
    Mousetrap.bind(['='], (e) => {
      this.advanceGroup(1);
      e.preventDefault();
    });
    Mousetrap.bind(['-'], () => {
      this.advanceGroup(-1);
    });
    Mousetrap.bind([']'], () => {
      this.zoom(2);
    });
    Mousetrap.bind(['['], () => {
      this.zoom(1 / 2);
    });
    Mousetrap.bind(['r'], () => {
      this.resetLayersAndActiveFrame();
    });
    Mousetrap.bind(['tab'], (e) => {
      this.toggleTools();
      e.preventDefault();
    });
    Mousetrap.bind(['z'], (e) => {
      this.setState({showLayersInZoom: !this.state.showLayersInZoom} as any);
      e.preventDefault();
    });
    Mousetrap.bind(['x'], (e) => {
      this.setState({lockSelection: !this.state.lockSelection} as any);
      e.preventDefault();
    });
    let self = this;
    function toggle(name, event) {
      self.toggleLayer(name);
      event.preventDefault();
    }

    let installedKeys = {};
    for (let name in this.options) {
      let option = this.options[name];
      if (option.key) {
        if (installedKeys[option.key]) {
          console.error("Key: " + option.key + " for " + option.description + ", is already mapped to " + installedKeys[option.key].description);
        }
        installedKeys[option.key] = option;
        Mousetrap.bind([option.key], toggle.bind(this, name));
      }
    }

    function toggleFrame(i) {
      this.setActiveGroup(i);
    }

    for (let i = 1; i <= this.props.groups.length; i++) {
      Mousetrap.bind([String(i)], toggleFrame.bind(this, i - 1));
    }

  }
  setActiveGroup(activeGroup) {
    this.setState({ activeGroup } as any);
  }
  setActiveFrame(activeFrame) {
    this.setState({ activeFrame } as any);
  }
  setActiveGroupAndFrame(activeGroup, activeFrame) {
    this.setState({ activeGroup, activeFrame } as any);
  }
  toggleTools() {
    if (this.props.blind) {
      return;
    }
    this.setState({ showTools: !this.state.showTools, layerMenuIsOpen: false } as any);
  }
  resetLayers() {
    let o: any = {};
    for (let name in this.options) {
      o[name] = false;
    }
    o.showDecodedImage = true;
    this.setState(o as any);
  }
  resetLayersAndActiveFrame() {
    let o: any = {};
    o.activeFrame = 0;
    o.activeGroup = 0;
    this.setState(o as any);
    this.resetLayers();
  }
  toggleLayer(name) {
    let o = {};
    o[name] = !this.state[name];
    this.setState(o as any);
  }
  onMouseDown(event: MouseEvent) {
    this.handleMouseEvent(event, true);
  }
  onMouseMove(event: MouseEvent) {
    this.handleMouseEvent(event, false);
  }
  handleMouseEvent(event: MouseEvent, click: boolean) {
    function getMousePosition(canvas: HTMLCanvasElement, event: MouseEvent) {
      let rect = canvas.getBoundingClientRect();
      return new Vector(
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }
    if (click || !this.state.lockSelection) {
      this.mousePosition = getMousePosition(this.overlayCanvas, event);
      this.mouseZoomPosition = this.mousePosition;
      this.updateBlockInfo();
    }
  }
  getMIBlockSize(frame: AnalyzerFrame, c: number, r: number): number {
    let blockSize = frame.json["blockSize"];
    if (!blockSize) {
      return undefined;
    }
    if (r >= blockSize.length || r < 0) {
      return undefined;
    }
    if (c >= blockSize[r].length || c < 0) {
      return undefined;
    }
    return blockSize[r][c];
  }
  getParentMIPosition(frame: AnalyzerFrame, v: Vector): Vector {
    let p = this.getMIPosition(frame, v);
    let c = p.x;
    let r = p.y;
    let size = this.getMIBlockSize(frame, c, r);
    if (size === undefined) {
      return null;
    }
    c = c & ~(((1 << frame.blockSizeLog2Map[size][0]) - 1) >> frame.miSizeLog2);
    r = r & ~(((1 << frame.blockSizeLog2Map[size][1]) - 1) >> frame.miSizeLog2);
    return new Vector(c, r);
  }
  getParentMIRect(frame: AnalyzerFrame, v: Vector): Rectangle {
    let p = this.getMIPosition(frame, v);
    let c = p.x;
    let r = p.y;
    let size = this.getMIBlockSize(frame, c, r);
    if (size === undefined) {
      return null;
    }
    const miSizeLog2 = frame.miSizeLog2;
    const log2Map = frame.blockSizeLog2Map[size];
    c = c & ~(((1 << log2Map[0]) - 1) >> miSizeLog2);
    r = r & ~(((1 << log2Map[1]) - 1) >> miSizeLog2);
    return new Rectangle(c << miSizeLog2, r << miSizeLog2, 1 << log2Map[0], 1 << log2Map[1]);
  }
  /**
   * Calculate MI coordinates.
   */
  getMIPosition(frame: AnalyzerFrame, v: Vector): Vector {
    const miSizeLog2 = frame.miSizeLog2;
    let c = (v.x / this.state.scale) >> miSizeLog2;
    let r = (v.y / this.state.scale) >> miSizeLog2;
    return new Vector(c, r);
  }
  getActiveFrame(): AnalyzerFrame {
    return this.props.groups[this.state.activeGroup][this.state.activeFrame];
  }
  getActiveGroup(): AnalyzerFrame[] {
    return this.props.groups[this.state.activeGroup];
  }
  updateBlockInfo() {
    this.forceUpdate();
  }
  getSymbolHist(frames: AnalyzerFrame[]): Histogram[] {
    let data = [];
    let names = Accounting.getSortedSymbolNames(frames.map(frame => frame.accounting));
    frames.forEach((frame, i) => {
      let row = { frame: i, total: 0 };
      let symbols = frame.accounting.createFrameSymbols();
      let total = 0;
      names.forEach(name => {
        let symbol = symbols[name];
        let bits = symbol ? symbol.bits : 0;
        total += bits;
      });
      names.forEach((name, i) => {
        let symbol = symbols[name];
        let bits = symbol ? symbol.bits : 0;
        row[i] = bits;
      });
      data.push(row);
    });
    let nameMap = {};
    names.forEach((name, i) => {
      nameMap[name] = i;
    });
    return data.map(data => new Histogram(data, nameMap));
  }

  onBitsScaleSelect(eventKey: any, event: Object) {
    let showBitsScale = eventKey;
    this.setState({ showBitsScale } as any);
  }

  onBitsModeSelect(eventKey: any, event: Object) {
    let showBitsMode = eventKey;
    this.setState({ showBitsMode } as any);
  }

  onBitsFilterSelect(eventKey: any, event: Object) {
    let showBitsFilter = eventKey;
    this.setState({ showBitsFilter } as any);
  }

  getActiveGroupScore() {
    let s = 0;
    let j = this.state.activeGroup;
    for (let i = 0; i < this.activeGroupScore.length; i++) {
      s += this.activeGroupScore[i][j];
    }
    return s;
  }

  downloadImage() {
    this.downloadLink.href = this.frameCanvas.toDataURL("image/png");
    this.downloadLink.download = "frame.png";
    if (this.downloadLink.href as any != document.location) {
      this.downloadLink.click();
    }
  }

  alertDecodeAdditionalFrames(count: number) {
    if (count <= 5) {
      if (this.props.onDecodeAdditionalFrames) {
        this.props.onDecodeAdditionalFrames(count);
      }
    } else {
      this.setState({
        showDecodeDialog: true,
        decodeFrameCount: count
      } as any);
    }
  }

  analyze() {
    window.location.reload();
  }

  decodeAdditionalFrames(value: boolean) {
    this.setState({
      showDecodeDialog: false
    } as any);

    if (value) {
      let count = this.state.decodeFrameCount;
      if (this.props.onDecodeAdditionalFrames) {
        this.props.onDecodeAdditionalFrames(count);
      }
    }
  }


  getHistogram(tab: HistogramTab, frames: AnalyzerFrame[]): Histogram[] {
    switch (tab) {
      case HistogramTab.Bits:
      case HistogramTab.Symbols:
        return this.getSymbolHist(frames);
      case HistogramTab.BlockSize:
        return frames.map(x => x.blockSizeHist);
      case HistogramTab.TransformSize:
        return frames.map(x => x.transformSizeHist);
      case HistogramTab.TransformType:
        return frames.map(x => x.transformTypeHist);
      case HistogramTab.PredictionMode:
        return frames.map(x => x.predictionModeHist);
      case HistogramTab.UVPredictionMode:
        return frames.map(x => x.uvPredictionModeHist);
      case HistogramTab.MotionMode:
        return frames.map(x => x.motionModeHist);
      case HistogramTab.CompoundType:
        return frames.map(x => x.compoundTypeHist);
      case HistogramTab.Skip:
        return frames.map(x => x.skipHist);
      case HistogramTab.DualFilterType:
        return frames.map(x => x.dualFilterTypeHist);
    }
    return null;
  }

  getHistogramColor(tab: HistogramTab, name: string) {
    let color = null;
    switch (tab) {
      case HistogramTab.BlockSize:
        color = getColor(name, palette.blockSize);
        break;
      case HistogramTab.TransformSize:
        color = getColor(name, palette.transformSize);
        break;
      case HistogramTab.TransformType:
        color = getColor(name, palette.transformType);
        break;
      case HistogramTab.MotionMode:
      case HistogramTab.CompoundType:
      case HistogramTab.PredictionMode:
      case HistogramTab.UVPredictionMode:
        color = getColor(name, palette.predictionMode);
        break;
      case HistogramTab.Skip:
        color = getColor(name, palette.skip);
        break;
      case HistogramTab.DualFilterType:
        color = getColor(name, palette.dualFilterType);
        break;
      default:
        color = getColor(name);
    }
    return color;
  }

  showLayerMenu(event) {
    this.setState({
      layerMenuIsOpen: true,
      layerMenuAnchorEl: event.currentTarget
    } as any);
  }

  hideLayerMenu(event) {
    this.setState({
      layerMenuIsOpen: false,
    } as any);
  }

  getGroupName(group: number): string {
    return this.props.groupNames ? this.props.groupNames[group] : String(group);
  }

  getActiveFrameConfig() {
    // Ignore default options.
    let defaultOptions = DEFAULT_CONFIG.split(" ");
    let options = this.getActiveFrame().config.split(" ");
    return options.filter(option => defaultOptions.indexOf(option) < 0).join(" ");
  }

  downloadIvf() {
    document.location = this.props.decoderVideoUrlPairs[this.state.activeGroup].videoUrl;
  }

  downloadY4m() {
    let decoder = this.props.decoderVideoUrlPairs[this.state.activeGroup].decoderUrl;
    let file = this.props.decoderVideoUrlPairs[this.state.activeGroup].videoUrl;
    window.open("?download=1&decoder=" + encodeURIComponent(decoder) + "&file=" + encodeURIComponent(file),'_blank');
  }

  render() {
    let groups = this.props.groups;
    let sidePanel = null;
    let frames = this.props.groups[this.state.activeGroup];
    let frame = this.getActiveFrame();
    if (this.state.showTools) {
      if (frame) {
        let names = Accounting.getSortedSymbolNames(frames.map(frame => frame.accounting));
        let accounting = this.getActiveFrame().accounting;
        let p = this.getParentMIPosition(frame, this.mousePosition);

        const iconStyles = {
          marginRight: 24,
        };

        let layerMenuItems = [];
        for (let name in this.options) {
          let option = this.options[name];
          layerMenuItems.push(
            <MenuItem key={name} onTouchTap={this.toggleLayer.bind(this, name)} insetChildren={true} checked={!!this.state[name]} primaryText={option.description} secondaryText={option.key.toUpperCase()} />
          );
        }

        const layerMenu = <IconMenu multiple={true}
          iconButtonElement={<IconButton tooltip="Save Image">
            <FontIcon className="material-icons md-24" style={iconStyles}>layers</FontIcon>
          </IconButton>}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          targetOrigin={{ horizontal: 'left', vertical: 'top' }}
        >
          {layerMenuItems}
        </IconMenu>

        let bitLayerToolbar = null;
        if (this.state.showBits) {
          let names = Accounting.getSortedSymbolNames(frames.map(frame => frame.accounting));
          bitLayerToolbar = <Toolbar>
            <ToolbarGroup firstChild={true} >
              <DropDownMenu style={{ width: 150 }} autoWidth={false} value={this.state.showBitsScale} onChange={(event, index, value) => this.setState({ showBitsScale: value } as any)}>
                <MenuItem value="frame" primaryText="Frame Relative" />
                <MenuItem value="video" primaryText="Video Relative" />
                <MenuItem value="videos" primaryText="Video Relative (all)" />
              </DropDownMenu>
              <DropDownMenu style={{ width: 150 }} autoWidth={false} value={this.state.showBitsMode} onChange={(event, index, value) => this.setState({ showBitsMode: value } as any)}>
                <MenuItem value="linear" primaryText="Single Color" />
                <MenuItem value="heat" primaryText="Heat Map" />
                <MenuItem value="heat-opaque" primaryText="Heat Map (Opaque)" />
              </DropDownMenu>
              <DropDownMenu style={{ width: 150 }} autoWidth={false} value={this.state.showBitsFilter} onChange={(event, index, value) => this.setState({ showBitsFilter: value } as any)}>
                <MenuItem value="" primaryText="None" />
                {
                  names.map(name => <MenuItem key={name} value={name} primaryText={name} />)
                }
              </DropDownMenu>
            </ToolbarGroup>
          </Toolbar>
        }

        let groupTabs = null;
        if (this.props.groups.length > 1) {
          let tabs = [];
          for (let i = 0; i < this.props.groups.length; i++) {
            tabs.push(<Tab key={i} label={i + 1} value={i} />);
          }
          groupTabs = <div><Tabs value={this.state.activeGroup} onChange={(value) => {
            this.setState({
              activeGroup: value,
            } as any);
          }}>{tabs}</Tabs>
          </div>
        }

        sidePanel = <div id="sidePanel">
          <Dialog modal={false}
            title="Share URL"
            open={this.state.showShareUrlDialog}
            actions={[<FlatButton
              label="Ok"
              primary={true}
              onTouchTap={() => { this.setState({showShareUrlDialog: false} as any) }}
            />]}
          >
          <TextField defaultValue={this.state.shareUrl} />
          </Dialog>
          <Alert open={this.state.showDecodeDialog} onClose={this.decodeAdditionalFrames.bind(this)} title={`Decode ${this.state.decodeFrameCount} Frame(s)?`} description="Frames will be decoded in the background and may take a while." />
          {groupTabs}
          <div className="activeContent">
            Frame: {padLeft(this.state.activeFrame + 1, 2)}, Group: {this.getGroupName(this.state.activeGroup)} {this.getActiveFrameConfig()}
          </div>
          <Toolbar>
            <ToolbarGroup firstChild={true}>
              <IconButton onClick={this.showLayerMenu.bind(this)} tooltip="Layers">
                <FontIcon className="material-icons md-24" style={iconStyles}>layers</FontIcon>
              </IconButton>
              <Popover open={this.state.layerMenuIsOpen}
                animated={false}
                anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                targetOrigin={{ horizontal: 'left', vertical: 'top' }}
                anchorEl={this.state.layerMenuAnchorEl}
                onRequestClose={this.hideLayerMenu.bind(this)}
              >
                <Menu desktop={true} width={250}>
                  {layerMenuItems}
                  <Divider />
                  <MenuItem onTouchTap={this.resetLayers.bind(this, name)} primaryText="Reset Layers" />
                </Menu>
              </Popover>
              {/*<IconButton onClick={this.toggleTools.bind(this)} iconClassName="icon-h" tooltip="Toggle Tools: tab"/>*/}
              <IconButton onClick={this.downloadImage.bind(this)} tooltip="Save Image">
                <FontIcon className="material-icons md-24" style={iconStyles}>image</FontIcon>
              </IconButton>
              <IconButton onClick={this.resetLayersAndActiveFrame.bind(this)} tooltip="Reset: r">
                <FontIcon className="material-icons md-24" style={iconStyles}>clear</FontIcon>
              </IconButton>
              <IconButton onClick={this.advanceFrame.bind(this, -1)} tooltip="Previous: ,">
                <FontIcon className="material-icons md-24" style={iconStyles}>skip_previous</FontIcon>
              </IconButton>
              <IconButton onClick={this.playPause.bind(this)} tooltip="Pause / Play: space">
                <FontIcon className="material-icons md-24" style={iconStyles}>{!this.state.playInterval ? "play_arrow" : "stop"}</FontIcon>
              </IconButton>
              <IconButton onClick={this.advanceFrame.bind(this, 1)} tooltip="Next: .">
                <FontIcon className="material-icons md-24" style={iconStyles}>skip_next</FontIcon>
              </IconButton>
              <IconButton onClick={this.zoom.bind(this, 1 / 2)} tooltip="Zoom Out: [">
                <FontIcon className="material-icons md-24" style={iconStyles}>zoom_out</FontIcon>
              </IconButton>
              <IconButton onClick={this.zoom.bind(this, 2)} tooltip="Zoom In: ]">
                <FontIcon className="material-icons md-24" style={iconStyles}>zoom_in</FontIcon>
              </IconButton>
              <IconButton onClick={this.alertDecodeAdditionalFrames.bind(this, 30)} tooltip="Decode 30 Additional Frames">
                <FontIcon className="material-icons md-24" style={iconStyles}>replay_30</FontIcon>
              </IconButton>
              <IconButton onClick={this.shareLink.bind(this)} tooltip="Share Link">
                <FontIcon className="material-icons md-24" style={iconStyles}>share</FontIcon>
              </IconButton>
              {/*<IconButton onClick={this.analyze.bind(this)} tooltip="Analyze Other AWCY Videos">
                <FontIcon className="material-icons md-24" style={iconStyles}>send</FontIcon>
              </IconButton>*/}
            </ToolbarGroup>
          </Toolbar>
          {bitLayerToolbar}
          <Tabs value={this.state.activeTab} onChange={(value) => {
            this.setState({
              activeTab: value,
            } as any);
          }}>
            <Tab value={0} label="Zoom">
              {this.state.activeTab == 0 && <div>
                  <canvas ref={(self: any) => this.resetZoomCanvas(self)} width="256" height="256"></canvas>
                  <div className="tabContent">
                    <Checkbox
                      label="Show Layers in Zoom: Z"
                      checked={this.state.showLayersInZoom}
                      onCheck={(event, value) => this.setState({ showLayersInZoom: value } as any)}
                    />
                    <Checkbox
                      label="Lock Selection: X"
                      checked={this.state.lockSelection}
                      onCheck={(event, value) => this.setState({ lockSelection: value } as any)}
                    />
                    <div className="componentHeader">Layer Alpha</div>
                    <Slider min={0} max={1} step={0.1} defaultValue={1} value={this.state.layerAlpha}
                      onChange={(event, value) => {
                        this.setState({layerAlpha: value} as any);
                      }}
                    />
                  </div>
                </div>
              }
            </Tab>
            <Tab value={1} label="Histograms">
              {this.state.activeTab == 1 && <div>
                <Toolbar>
                  <ToolbarGroup firstChild={true}>
                    <DropDownMenu value={this.state.activeHistogramTab} onChange={(event, index, value) => this.setState({ activeHistogramTab: value } as any)}>
                      <MenuItem value={HistogramTab.Bits} label="Bits" primaryText="Bits" />
                      <MenuItem value={HistogramTab.Symbols} label="Symbols" primaryText="Symbols" />
                      <MenuItem value={HistogramTab.BlockSize} label="Block Size" primaryText="Block Size" />
                      <MenuItem value={HistogramTab.TransformSize} label="Transform Size" primaryText="Transform Size" />
                      <MenuItem value={HistogramTab.TransformType} label="Transform Type" primaryText="Transform Type" />
                      <MenuItem value={HistogramTab.PredictionMode} label="Prediction Mode" primaryText="Prediction Mode" />
                      <MenuItem value={HistogramTab.UVPredictionMode} label="UV Prediction Mode" primaryText="UV Prediction Mode" />
                      <MenuItem value={HistogramTab.MotionMode} label="Motion Mode" primaryText="Motion Mode" />
                      <MenuItem value={HistogramTab.CompoundType} label="Compound Type" primaryText="Compound Type" />
                      <MenuItem value={HistogramTab.Skip} label="Skip" primaryText="Skip" />
                      <MenuItem value={HistogramTab.DualFilterType} label="Dual Filter Type" primaryText="Dual Filter Type" />
                    </DropDownMenu>
                  </ToolbarGroup>
                </Toolbar>
                <HistogramComponent
                  histograms={this.getHistogram(this.state.activeHistogramTab, frames)}
                  color={this.getHistogramColor.bind(this, this.state.activeHistogramTab)}
                  highlight={this.state.activeFrame}
                  height={512} width={500}
                  scale={this.state.activeHistogramTab == 0 ? "max" : undefined}
                ></HistogramComponent>
              </div>
              }
            </Tab>
            <Tab value={2} label="Block Info">
              {p && this.state.activeTab == 2 && <div>
                <ModeInfoComponent frame={frame} position={p}></ModeInfoComponent>
                <AccountingComponent symbols={this.getActiveFrame().accounting.createBlockSymbols(p.x, p.y)}></AccountingComponent>
              </div>
              }
            </Tab>
            <Tab value={3} label="Frame Info">
              {this.state.activeTab == 3 && <div>
                <FrameInfoComponent frame={frame} activeFrame={this.state.activeFrame} activeGroup={this.state.activeGroup}></FrameInfoComponent>
                <AccountingComponent symbols={accounting.frameSymbols}></AccountingComponent>
              </div>
              }
            </Tab>
            <Tab value={4} label="More">
              <div className="tabContent">
                <RaisedButton primary={true} label="Feature Request" onTouchTap={this.fileIssue.bind(this, "enhancement")}/>{' '}
                <RaisedButton secondary={true} label="File a Bug" onTouchTap={this.fileIssue.bind(this, "bug")}/>
                <p><RaisedButton label="Download this video (ivf)" onTouchTap={this.downloadIvf.bind(this)}/></p>
                <p><RaisedButton label="Download this video (y4m)" onTouchTap={this.downloadY4m.bind(this)}/></p>
                <h3>Configuration</h3>
                <p>
                  {frame.config}
                </p>
                <h3>Tips</h3>
                <ul>
                  <li>Click anywhere on the image to lock focus and get mode info details.</li>
                  <li>All analyzer features have keyboard shortcuts, use them.</li>
                  <li>Toggle between video sequences by using the number keys: 1, 2, 3, etc.</li>
                </ul>
              </div>
            </Tab>
          </Tabs>
        </div>
      }
    }

    let activeGroup = this.state.activeGroup;
    let groupName = this.props.groupNames ? this.props.groupNames[activeGroup] : String(activeGroup);

    let result = <div className="maxWidthAndHeight">
      <a style={{ display: "none" }} ref={(self: any) => this.downloadLink = self} />
      {this.state.showFrameComment &&
        <div id="frameComment">
          <div>
            <div className="sectionHeader">Config</div>
            <div className="propertyValue">{this.getActiveFrame().config}</div>
            <div className="sectionHeader">Video</div>
            <div className="propertyValue">{groupName}</div>
            <div className="sectionHeader">Group</div>
            <div className="propertyValue">{activeGroup}: {this.props.groupNames[activeGroup]}</div>
            <div className="sectionHeader">Score</div>
            <div className="propertyValue">{this.getActiveGroupScore()}</div>
            <div className="sectionHeader">Frame</div>
            <div className="propertyValue">{this.state.activeFrame}</div>
          </div>
        </div>
      }
      <div className="rootContainer">
        <div className="contentContainer">
          <div className="canvasContainer" ref={(self: any) => this.canvasContainer = self}>
            <canvas ref={(self: any) => this.displayCanvas = self} width="256" height="256" style={{ position: "absolute", left: 0, top: 0, zIndex: 0, imageRendering: "pixelated", backgroundCcolor: "#F5F5F5" }}></canvas>
            <canvas ref={(self: any) => this.overlayCanvas = self} width="256" height="256" style={{ position: "absolute", left: 0, top: 0, zIndex: 1, imageRendering: "pixelated", cursor: "crosshair", opacity: this.state.layerAlpha }}></canvas>
          </div>
        </div>
        {this.state.showTools && sidePanel}
      </div>
    </div>
    return result;
  }

  drawSkip(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let skipGrid = frame.json["skip"];
    let skipMap = frame.json["skipMap"];
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      let v = skipGrid[r][c];
      if (v == skipMap.NO_SKIP) {
        return false;
      }
      ctx.fillStyle = palette.skip.SKIP;
      return true;
    });
  }

  drawFilters(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let dualFilterTypeGrid = frame.json["dualFilterType"];
    if (!dualFilterTypeGrid) return;
    let dualFilterTypeMapByValue = reverseMap(frame.json["dualFilterTypeMap"]);
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      ctx.fillStyle = getColor(dualFilterTypeMapByValue[dualFilterTypeGrid[r][c]], palette.dualFilterType);
      return true;
    });
  }

  drawCDEF(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let skipGrid = frame.json["skip"];
    if (!skipGrid) return;
    let rows = skipGrid.length;
    let cols = skipGrid[0].length;
    function allSkip(c: number, r: number) {
      let s = 1 << (frame.miSuperSizeLog2 - frame.miSizeLog2);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          if (r + y >= rows || c + x >= cols) {
            continue;
          }
          if (!skipGrid[r + y][c + x]) {
            return false;
          }
        }
      }
      return true;
    }

    let levelGrid = frame.json["cdef_level"];
    let strengthGrid = frame.json["cdef_strength"];
    if (!levelGrid) return;
    if (!strengthGrid) return;
    ctx.globalAlpha = 0.2;
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      if (allSkip(c, r)) {
        return;
      }
      let v = levelGrid[r][c] + strengthGrid[r][c];
      if (!v) {
        return false;
      }
      ctx.fillStyle = colorScale(v / (DERING_STRENGTHS + CLPF_STRENGTHS), HEAT_COLORS);
      return true;
    }, VisitMode.SuperBlock);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "white";
    ctx.font = String(8 * this.ratio) + "pt Courier New";
    this.drawBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr, bounds, scale) => {
      if (allSkip(c, r)) {
        return;
      }
      let s = strengthGrid[r][c];
      let l = levelGrid[r][c];
      let o = bounds.getCenter();
      ctx.fillText(l + "/" + s, o.x, o.y);
      return true;
    }, VisitMode.SuperBlock);
  }
  drawReferenceFrames(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let referenceGrid = frame.json["referenceFrame"];
    let referenceMapByValue = reverseMap(frame.json["referenceFrameMap"]);
    const triangles = true;
    this.drawBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr, bounds) => {
      ctx.save();
      if (referenceGrid[r][c][0] >= 0) {
        ctx.fillStyle = getColor(referenceMapByValue[referenceGrid[r][c][0]], palette.referenceFrame);
        if (triangles) {
          ctx.beginPath();
          ctx.moveTo(bounds.x, bounds.y);
          ctx.lineTo(bounds.x + bounds.w, bounds.y);
          ctx.lineTo(bounds.x, bounds.y + bounds.h);
          ctx.fill();
        } else {
          ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        }
      }
      if (referenceGrid[r][c][1] >= 0) {
        ctx.fillStyle = getColor(referenceMapByValue[referenceGrid[r][c][1]], palette.referenceFrame);
        if (triangles) {
          ctx.beginPath();
          ctx.moveTo(bounds.x + bounds.w, bounds.y);
          ctx.lineTo(bounds.x + bounds.w, bounds.y + bounds.h);
          ctx.lineTo(bounds.x, bounds.y + bounds.h);
          ctx.fill();
        } else {
          ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        }
      }
      ctx.restore();
      return true;
    });
  }

  drawMotionVectors(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let motionVectorsGrid = frame.json["motionVectors"];
    let scale = dst.w / src.w;
    let scaledFrameSize = this.frameSize.clone().multiplyScalar(scale);
    ctx.save();
    ctx.globalAlpha = 1;
    let aColor = "red";
    let bColor = "blue";
    ctx.fillStyle = aColor;
    ctx.lineWidth = scale / 2;

    ctx.translate(-src.x * scale, -src.y * scale);
    this.visitBlocks(VisitMode.Block, frame, (blockSize, c, r, sc, sr, bounds) => {
      bounds.multiplyScalar(scale);
      let o = bounds.getCenter();
      let m = motionVectorsGrid[r][c];
      let a = new Vector(m[0], m[1])
      let b = new Vector(m[2], m[3])

      if (a.length() > 0) {
        ctx.globalAlpha = Math.min(0.3, a.length() / 128);
        ctx.fillStyle = aColor;
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }

      if (b.length() > 0) {
        ctx.globalAlpha = Math.min(0.3, b.length() / 128);
        ctx.fillStyle = bColor;
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }

      a.divideScalar(8 / scale);
      let va = o.clone().add(a);
      b.divideScalar(8 / scale);
      let vb = o.clone().add(b);

      // Draw small vectors with a ligher color.
      ctx.globalAlpha = Math.max(0.2, Math.min(a.length() + b.length(), 1));
      ctx.strokeStyle = aColor;
      drawVector(ctx, o, va);

      ctx.strokeStyle = bColor;
      drawVector(ctx, o, vb);

      // Draw Dot
      ctx.beginPath();
      ctx.arc(o.x, o.y, scale / 2, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }
  drawMotionMode(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let compoundTypeMap = reverseMap(frame.json["motion_modeMap"]);
    let motionModeTypeGrid = frame.json["motion_mode"];
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      ctx.fillStyle = getColor(motionModeTypeGrid[r][c], palette.motion_mode);
      return true;
    });
  }
  drawCompoundType(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let compoundTypeMap = reverseMap(frame.json["compound_typeMap"]);
    let compoundTypeGrid = frame.json["compound_type"];
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      ctx.fillStyle = getColor(compoundTypeGrid[r][c], palette.compound_type);
      return true;
    });
  }
  drawSegment(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let segGrid = frame.json["seg_id"];
    let segMapByValue = reverseMap(frame.json["seg_idMap"]);
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      ctx.fillStyle = getColor(segGrid[r][c], palette.seg_id);
      return true;
    });
  }
  drawTransformType(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let typeGrid = frame.json["transformType"];
    let transformTypeMapByValue = reverseMap(frame.json["transformTypeMap"]);
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      ctx.fillStyle = getColor(transformTypeMapByValue[typeGrid[r][c]], palette.transformType);
      return true;
    }, VisitMode.TransformBlock);
  }
  drawBits(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let { blocks, total } = frame.accounting.countBits(this.state.showBitsFilter);
    function getBits(blocks, c, r) {
      if (!blocks[r]) {
        return 0;
      }
      return blocks[r][c] | 0;
    }
    let maxBitsPerPixel = 0;
    if (this.state.showBitsScale == "frame") {
      this.visitBlocks(VisitMode.Block, frame, (blockSize, c, r, sc, sr, bounds) => {
        let area = blockSizeArea(frame, blockSize);
        let bits = getBits(blocks, c, r);
        maxBitsPerPixel = Math.max(maxBitsPerPixel, bits / area);
      });
    } else {
      let groups = this.state.showBitsScale === "video" ? [this.getActiveGroup()] : this.props.groups;
      groups.forEach(frames => {
        frames.forEach(frame => {
          let { blocks } = frame.accounting.countBits(this.state.showBitsFilter);
          this.visitBlocks(VisitMode.Block, frame, (blockSize, c, r, sc, sr, bounds) => {
            let area = blockSizeArea(frame, blockSize);
            let bits = getBits(blocks, c, r);
            maxBitsPerPixel = Math.max(maxBitsPerPixel, bits / area);
          });
        });
      });
    }
    this.fillBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr) => {
      let area = blockSizeArea(frame, blockSize);
      let bits = getBits(blocks, c, r);
      let value = (bits / area) / maxBitsPerPixel;
      let mode = this.state.showBitsMode;
      if (mode == "linear") {
        ctx.globalAlpha = value;
        ctx.fillStyle = "#9400D3";
      } else if (mode == "heat") {
        ctx.globalAlpha = value;
        ctx.fillStyle = colorScale(value, HEAT_COLORS);
      } else if (mode == "heat-opaque") {
        ctx.globalAlpha = 1;
        ctx.fillStyle = colorScale(value, HEAT_COLORS);
      }
      return true;
    });
  }
  drawMode(type: string, frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle) {
    let skipGrid = frame.json["skip"];
    let modeGrid = frame.json[type];
    let modeMap = frame.json["modeMap"];
    let uvModeMap = frame.json["uv_modeMap"];
    let motionModeMap = frame.json["motion_modeMap"];
    let alphaIndex = frame.json["cfl_alpha_idx"];
    let modeMapByValue = reverseMap(modeMap);
    const V_PRED = modeMap.V_PRED;
    const H_PRED = modeMap.H_PRED;
    const D45_PRED = modeMap.D45_PRED;
    const D67_PRED = modeMap.D67_PRED;
    const D135_PRED = modeMap.D135_PRED;
    const D113_PRED = modeMap.D113_PRED;
    const D157_PRED = modeMap.D157_PRED;
    const D203_PRED = modeMap.D203_PRED;
    const DC_PRED = modeMap.DC_PRED;
    const UV_CFL_PRED = uvModeMap.UV_CFL_PRED;

    let scale = dst.w / src.w;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "white";
    let lineOffset = getLineOffset(1);
    ctx.translate(lineOffset, lineOffset);
    ctx.translate(-src.x * scale, -src.y * scale);
    let lineWidth = 1;
    ctx.lineWidth = lineWidth;

    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = String(6 * this.ratio) + "pt Courier New";

    this.visitBlocks(VisitMode.Block, frame, (blockSize, c, r, sc, sr, bounds) => {
      bounds.multiplyScalar(scale);
      drawMode(modeGrid[r][c], bounds);
      if (alphaIndex && type === "uv_mode" && modeGrid[r][c] === UV_CFL_PRED) {
        if (bounds.w < 16 * this.ratio || bounds.h < 16 * this.ratio) {
          return;
        }
        let o = bounds.getCenter();
        let cfl_alpha_idx = frame.json["cfl_alpha_idx"][r][c];
        let cfl_alpha_sign = frame.json["cfl_alpha_sign"][r][c];
        let [cfl_alpha_u, cfl_alpha_v] = toCflAlphas(cfl_alpha_idx, cfl_alpha_sign);
        ctx.fillStyle = "black";
        ctx.fillText(`${cfl_alpha_u}`, o.x, o.y - 4 * this.ratio);
        ctx.fillText(`${cfl_alpha_v}`, o.x, o.y + 4 * this.ratio);
      }
    });

    function drawMode(m: number, bounds: Rectangle) {
      let x = bounds.x;
      let y = bounds.y;
      let w = bounds.w;
      let h = bounds.h;
      let hw = w / 2;
      let hh = h / 2;
      ctx.fillStyle = getColor(modeMapByValue[m], palette.predictionMode);
      ctx.fillRect(x, y, w, h);
      switch (m) {
        case V_PRED:
          drawLine(ctx, x + hw + lineOffset, y, 0, h);
          break;
        case H_PRED:
          drawLine(ctx, x, y + hh + lineOffset, w, 0);
          break;
        case D45_PRED:
          drawLine(ctx, x, y + h, w, -h);
          break;
        case D67_PRED:
          drawLine(ctx, x, y + h, hw, -h);
          break;
        case D135_PRED:
          drawLine(ctx, x, y, w, h);
          break;
        case D113_PRED:
          drawLine(ctx, x + hw, y, hw, h);
          break;
        case D157_PRED:
          drawLine(ctx, x, y + hh, w, hh);
          break;
        case D203_PRED:
          drawLine(ctx, x, y + hh, w, -hh);
          break;
        default:
          break;
      }
    }
    ctx.restore();
  }

  fillBlock(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle, setFillStyle: (blockSize: number, c: number, r: number, sc: number, sr: number) => boolean, mode = VisitMode.Block) {
    this.drawBlock(frame, ctx, src, dst, (blockSize, c, r, sc, sr, bounds, scale) => {
      if (setFillStyle(blockSize, c, r, sc, sr)) {
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }
    }, mode);
  }

  drawBlock(frame: AnalyzerFrame, ctx: CanvasRenderingContext2D, src: Rectangle, dst: Rectangle, visitor: BlockVisitor, mode = VisitMode.Block) {
    let scale = dst.w / src.w;
    ctx.save();
    ctx.translate(-src.x * scale, -src.y * scale);
    this.visitBlocks(mode, frame, (blockSize, c, r, sc, sr, bounds) => {
      bounds.multiplyScalar(scale);
      visitor(blockSize, c, r, sc, sr, bounds, scale);
    });
    ctx.restore();
  }
  /**
   * A variety of ways to visit the grid.
   */
  visitBlocks(mode: VisitMode, frame: AnalyzerFrame, visitor: BlockVisitor) {
    const blockSizeGrid = frame.json["blockSize"];
    const miSizeLog2 = frame.miSizeLog2;
    const miSuperSizeLog2 = frame.miSuperSizeLog2;

    const rect = new Rectangle(0, 0, 0, 0);
    const rows = blockSizeGrid.length;
    const cols = blockSizeGrid[0].length;

    if (mode === VisitMode.Tile) {
      let tileCols = frame.json["tileCols"];
      let tileRows = frame.json["tileRows"];
      if (!tileCols || !tileRows) return;
      for (let c = 0; c < cols; c += tileCols) {
        for (let r = 0; r < rows; r += tileRows) {
          let size = blockSizeGrid[r][c];
          visitor(size, c, r, 0, 0, rect.set(c << miSizeLog2, r << miSizeLog2, (1 << miSizeLog2) * tileCols, (1 << miSizeLog2) * tileRows), 1);
        }
      }
    } else if (mode === VisitMode.SuperBlock) {
      for (let c = 0; c < cols; c += 1 << (miSuperSizeLog2 - miSizeLog2)) {
        for (let r = 0; r < rows; r += 1 << (miSuperSizeLog2 - miSizeLog2)) {
          let size = blockSizeGrid[r][c];
          visitor(size, c, r, 0, 0, rect.set(c << miSizeLog2, r << miSizeLog2, 1 << miSuperSizeLog2, 1 << miSuperSizeLog2), 1);
        }
      }
    } else if (mode === VisitMode.Block || mode === VisitMode.TransformBlock) {
      let allSizes;
      let sizeGrid;
      if (mode === VisitMode.Block) {
        sizeGrid = blockSizeGrid;
        allSizes = frame.blockSizeLog2Map;
      } else if (mode === VisitMode.TransformBlock) {
        sizeGrid = frame.json["transformSize"];
        allSizes = frame.transformSizeLog2Map;
      } else {
        unreachable();
      }
      // Visit sizes >= MI_SIZE
      for (let i = 0; i < allSizes.length; i++) {
        const sizeLog2 = allSizes[i];
        if (sizeLog2[0] < miSizeLog2 || sizeLog2[1] < miSizeLog2) {
          continue;
        }
        let dc = 1 << (sizeLog2[0] - miSizeLog2);
        let dr = 1 << (sizeLog2[1] - miSizeLog2);
        for (let r = 0; r < rows; r += dr) {
          let sizeGridRow = sizeGrid[r];
          for (let c = 0; c < cols; c += dc) {
            let size = sizeGridRow[c];
            if (size == i) {
              let w = dc << miSizeLog2;
              let h = dr << miSizeLog2;
              visitor(size, c, r, 0, 0, rect.set(c << miSizeLog2, r << miSizeLog2, w, h), 1);
            }
          }
        }
      }
    } else {
      throw new Error("Can't handle mode: " + mode);
    }
  }
  createSharingLink(): Promise<string> {
    return new Promise((resolve, reject) => {
      shortenUrl(window.location.href , (url) => {
        resolve(url);
      });
    });
  }
  shareLink() {
    this.createSharingLink().then(link => {
      this.setState({showShareUrlDialog: true, shareUrl: link} as any);
    });
  }
  fileIssue(label: string = "") {
    this.createSharingLink().then(link => {
      window.open("https://github.com/mbebenita/aomanalyzer/issues/new?labels=" + label + "&body=" + encodeURIComponent(link));
    });
  }
}
