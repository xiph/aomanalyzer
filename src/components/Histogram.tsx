import * as React from "react";
import { TRACE_RENDERING, COLORS, Rectangle, Histogram, Vector, hashString } from "./analyzerTools";

export class HistogramComponent extends React.Component<{
  histograms: Histogram[];
  highlight?: number;
  width?: number;
  height?: number;
  scale?: string | number;
  color?: (name: string) => string;
  horizontal?: boolean;
}, {
}> {
  public static defaultProps = {
    width: 128,
    height: 128,
    scale: "relative",
    horizontal: true,
    color: function (name: string) {
      return COLORS[hashString(name) % COLORS.length];
    }
  };
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ratio: number;
  w: number;
  h: number;
  position: Vector;
  constructor() {
    super();
    this.ratio = window.devicePixelRatio || 1;
    this.position = new Vector(-1, -1);
  }
  componentDidUpdate(prevProps, prevState) {
    this.renderHistogram(this.ctx, this.props.histograms);
  }
  componentDidMount() {
    let w = this.w = this.props.width;
    let h = this.h = this.props.height;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.width = w * this.ratio;
    this.canvas.height = h * this.ratio;
    this.ctx = this.canvas.getContext("2d");
    this.renderHistogram(this.ctx, this.props.histograms);
    this.canvas.addEventListener("mousemove", this.handleMouseEvent.bind(this));
  }
  componentWillUnmount() {

  }
  renderHistogram(ctx: CanvasRenderingContext2D, histograms: Histogram[]) {
    TRACE_RENDERING && console.log("renderHistogram");
    let names: string [] = null;
    let nameMap: { [id: string]: number };
    if (!histograms.length || !histograms[0]) {
      return;
    }
    nameMap = histograms[0].names;
    names = Object.keys(nameMap);
    function valueOf(histogram: Histogram, name: string) {
      let count = histogram.counts[histogram.names[name]];
      return count === undefined ? 0 : count;
    }
    let rows = [];
    let scale = 1;
    if (this.props.scale == "max") {
      let max = 0;
      histograms.forEach((histogram: Histogram, i) => {
        let total = 0;
        names.forEach((name) => {
          total += valueOf(histogram, name);
        });
        max = Math.max(max, total);
      });
      scale = max;
    }
    histograms.forEach((histogram: Histogram, i) => {
      let row = { frame: i, total: 0 };
      if (this.props.scale == "relative") {
        scale = 0;
        names.forEach(name => {
          scale += valueOf(histogram, name);
        });
      } else if (typeof this.props.scale == "number") {
        scale = this.props.scale;
      }
      names.forEach(name => {
        row[name] = valueOf(histogram, name) / scale;
      });
      rows.push(row);
    });
    this.renderChart(ctx, names, nameMap, rows);
    return;
  }

  handleMouseEvent(event: MouseEvent) {
    function getMousePosition(canvas: HTMLCanvasElement, event: MouseEvent) {
      let rect = canvas.getBoundingClientRect();
      return new Vector(
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }
    this.position = getMousePosition(this.canvas, event).multiplyScalar(this.ratio);
    this.forceUpdate();
  }

  renderChart(ctx: CanvasRenderingContext2D, names: string[], nameMap: { [id: string]: number }, data: any[], yDomain = [0, 1]) {
    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let w = this.w * this.ratio;
    let h = this.h * this.ratio;
    //let bw = Math.min(16 * this.ratio, w / data.length | 0);
    let bw = Math.min(16 * this.ratio, w / 32 | 0);
    //let bh = Math.min(16 * this.ratio, h / data.length | 0);
    let bh = Math.min(16 * this.ratio, h / 32 | 0);
    let selectedName = null;
    let selectedValue = undefined;
    let selectedFrame = -1;
    let histStart = Math.max(this.props.highlight - 16, 0)
    let histEnd = Math.min(this.props.highlight + 16, data.length)
    // for (let i = 0; i < data.length; i++) {
    for (let i = histStart; i < histEnd; i++) {
      let t = 0;
      let r = new Rectangle(0, 0, 0, 0);
      let ii = i - histStart;
      names.forEach(k => {
        let v = data[i][k];
        ctx.fillStyle = this.props.color(k);
        if (this.props.horizontal) {
          let y = (h - ((t + v) * h));
          r.set(ii * bw, y | 0, bw - 1, (v * h + (y - (y | 0))) | 0);
        } else {
          r.set((t * w | 0), bh * ii, (v * w) | 0, bh - 1);
        }
        if (r.containsPoint(this.position)) {
          ctx.globalAlpha = 1;
          selectedName = k;
          selectedValue = v;
          selectedFrame = i;
          ctx.fillStyle = "white";
        } else {
          ctx.globalAlpha = 1;
        }
        ctx.fillRect(r.x, r.y, r.w, r.h);
        t += v;
      });
      if (this.props.highlight == i) {
        ctx.fillStyle = "white";
        if (this.props.horizontal) {
          ctx.fillRect(ii * bw, 0, bw - 1, this.ratio * 4);
        } else {
          ctx.fillRect(0, ii * bh, this.ratio * 4, bh - 1);
        }
      }
    }
    if (selectedName) {
      let top = this.position.distanceTo(new Vector(0, 0)) > this.position.distanceTo(new Vector(0, h));
      let text = selectedName + " " + (selectedValue * 100).toFixed(2) + "%" + " (" + String(selectedFrame) + ")";
      ctx.globalAlpha = 0.75;
      ctx.font = (10 * this.ratio) + "px Arial";
      ctx.fillStyle = "black";
      let tw = ctx.measureText(text).width + 8 * this.ratio;
      if (top) {
        ctx.fillRect(0, 0, tw, 20 * this.ratio);
      } else {
        ctx.fillRect(0, h - 20 * this.ratio, tw, 20 * this.ratio);
      }
      ctx.fillStyle = "white";
      ctx.globalAlpha = 1;
      ctx.textBaseline = "middle";
      if (top) {
        ctx.fillText(text, 4 * this.ratio, 10 * this.ratio);
      } else {
        ctx.fillText(text, 4 * this.ratio, h - 10 * this.ratio);
      }
    }
    ctx.restore();
  }

  render() {
    return  <div id="c" className="chartParent">
      <canvas ref={(self: any) => this.canvas = self} width="256" height="256"></canvas>
    </div>
  }
}
