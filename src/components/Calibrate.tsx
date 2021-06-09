import * as React from 'react';

interface CalibrateComponentProps {
  width: number;
  height: number;
}

export class CalibrateComponent extends React.Component<CalibrateComponentProps> {
  public static defaultProps: CalibrateComponentProps = {
    width: 512,
    height: 512,
  } as any;
  canvas: HTMLCanvasElement;
  renderCanvas() {
    if (!this.canvas) {
      return;
    }
    this.renderBrightnessTest();
  }
  renderBrightnessTest() {
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#00000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const colors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30];
    const p = 16;
    const size = 100;
    const cols = (this.canvas.width / (size + p)) | 0;
    const rows = Math.ceil(colors.length / cols);
    const h = size;
    const w = size;
    ctx.save();
    ctx.translate(p, p);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (i >= colors.length) {
          return;
        }
        const c = colors[i];
        ctx.fillStyle = `rgb(${c}, ${c}, ${c})`;
        ctx.fillRect(x * (w + p), y * (h + p), w, h);
        ctx.fillStyle = 'darkred';
        ctx.textBaseline = 'top';
        ctx.fillText(String(c), 4 + x * (w + p), 4 + y * (h + p));
      }
    }
    ctx.restore();
  }
  componentDidMount() {
    this.renderCanvas();
  }
  render() {
    const canvasStyle: any = {};
    return (
      <div>
        <canvas
          className="playerCanvas"
          ref={(self: any) => (this.canvas = self)}
          style={canvasStyle}
          width={this.props.width}
          height={this.props.height}
        />
      </div>
    );
  }
}
