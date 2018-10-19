import * as React from "react";

const MAX_FRAMES = 128;
import { downloadFile, Decoder, AnalyzerFrame } from "./analyzerTools";
import Dialog from 'material-ui/Dialog';
import CircularProgress from 'material-ui/CircularProgress';
import { AnalyzerView } from './Analyzer'
import { SplitView } from './Split'

interface LoaderComponentProps {
  decoderVideoUrlPairs: { decoderUrl: string, videoUrl: string, decoderName: string }[];
  playbackFrameRate?: number;
  layers?: number;
  maxFrames?: number;
  blind?: number;
  split?: number;
  bench?: number;
}

export class LoaderComponent extends React.Component<LoaderComponentProps, {
  frames: AnalyzerFrame[][],
  groupNames: string[],
  analyzerFailedToLoad: boolean,
  decodedFrameCount: number,
  loading: "done" | "failed" | "loading",
  status: string,
  playbackFrameRate; number;
}> {
  playbackFrameRate: number;
  public static defaultProps: LoaderComponentProps = {
    decoderVideoUrlPairs: [],
    playbackFrameRate: 1000,
    maxFrames: MAX_FRAMES,
    layers: 0xFFFFFFFF
  };
  constructor(props: LoaderComponentProps) {
    super();
    this.state = {
      frames: [],
      groupNames: null,
      decodedFrameCount: 0,
      analyzerFailedToLoad: null,
      loading: "loading",
      status: "",
      playbackFrameRate: props.playbackFrameRate
    } as any;
  }
  componentWillMount() {
    let decoderUrls = [];
    let decoderNames = [];
    let videoUrls = [];
    this.props.decoderVideoUrlPairs.forEach(pair => {
      decoderUrls.push(pair.decoderUrl);
      decoderNames.push(pair.decoderName);
      videoUrls.push(pair.videoUrl);
    });
    this.load(decoderUrls, decoderNames, videoUrls);
  }
  decoders: any[] = [];
  load(decoderPaths: string[], decoderNames: string[], videoPaths: string[]) {
    this.setState({ status: "Loading Decoders" } as any);
    Promise.all(decoderPaths.map(path => Decoder.loadDecoder(path))).then(decoders => {
      this.decoders = decoders;
      this.setState({ status: "Downloading Files" } as any);
      Promise.all(videoPaths.map(path => downloadFile(path))).then(bytes => {
        let decodedFrames = [];
        for (let i = 0; i < decoders.length; i++) {
          let decoder = decoders[i];
          decoder.openFileBytes(bytes[i]);
        }
        let groupNames = decoderNames.slice();
        for (let i = 0; i < decoderPaths.length; i++) {
          if (groupNames[i]) {
            continue;
          }
          let videoPath = videoPaths[i];
          let j = videoPath.lastIndexOf("/");
          if (j >= 0) {
            videoPath = videoPath.substring(j + 1);
          }
          groupNames[i] = videoPath;
        }
        this.setState({ status: "Decoding Frames" } as any);
        let s = performance.now();
        Promise.all(decoders.map(decoder => this.decodeFrames(decoder, this.props.maxFrames))).then(frames => {
          let playbackFrameRate = Math.min(this.props.playbackFrameRate, decoders[0].frameRate);
          if (this.props.bench) {
            this.setState({ status: "Decoded Frames in " + (performance.now() - s).toFixed(2) + " ms." } as any);
          } else {
            this.setState({ frames: frames, groupNames: groupNames, loading: "done", playbackFrameRate } as any);
          }
        });
      }).catch(e => {
        this.setState({ status: `Downloading Files Failed: ${e}`, loading: "error" } as any);
      });
    }).catch(e => {
      this.setState({ status: `Loading Decoders Failed: ${e}`, loading: "error" } as any);
    });
  }

  decodeAdditionalFrames(count: number) {
    Promise.all(this.decoders.map(decoder => this.decodeFrames(decoder, count))).then(frames => {
      let currentFrames = this.state.frames;
      for (let i = 0; i < frames.length; i++) {
        currentFrames[i] = currentFrames[i].concat(frames[i]);
      }
      this.setState({ frames: currentFrames } as any);
    });
  }

  decodedFrameCount = 0;
  decodeFrames(decoder: Decoder, count: number): Promise<AnalyzerFrame[]> {
    // If we use the split view, we don't need any layers making decoding faster.
    if (!this.props.split && !this.props.bench) {
      decoder.setLayers(0xffffffffff);
    }
    if (this.props.bench == 1) {
      decoder.shouldReadImageData = false;
    }
    return new Promise((resolve, reject) => {
      let time = performance.now();
      let decodedFrames = [];
      let framePromises = [];
      for (let i = 0; i < count; i++) {
        framePromises.push(decoder.readFrame());
      }
      // Don't swallow all promises if some fail.
      framePromises = framePromises.map(p => p.then((x) => {
        if (x) {
          this.decodedFrameCount += x.length;
          if (!this.props.bench) {
            this.setState({ status: `Decoded ${this.decodedFrameCount} Frames ...` } as any);
          }
        }
        return x;
      }).catch(() => undefined));
      Promise.all(framePromises).then((frames: AnalyzerFrame[][]) => {
        frames.forEach(f => {
          if (f) {
            decodedFrames = decodedFrames.concat(f);
          }
        });
        resolve(decodedFrames);
      });
    });
  }
  render() {
    let frames = this.state.frames;
    if (this.state.loading != "done") {
      let icon = this.state.loading === "loading" ? <span className="glyphicon glyphicon-refresh glyphicon-refresh-animate"></span> : <span className="glyphicon glyphicon-ban-circle"></span>;
      return <Dialog
        modal={false}
        open={true}
      >
        { this.props.bench ? null : <CircularProgress size={40} thickness={7} /> }
        <div style={{ paddingTop: "10px" }}>{this.state.status}</div>
      </Dialog>
    }

    if (this.props.split) {
      return <div className="maxWidthAndHeight">
        <SplitView mode={this.props.split - 1} onDecodeAdditionalFrames={this.decodeAdditionalFrames.bind(this)} groups={this.state.frames} groupNames={this.state.groupNames}></SplitView>
      </div>;
    } else {
      return <div className="maxWidthAndHeight">
        <AnalyzerView onDecodeAdditionalFrames={this.decodeAdditionalFrames.bind(this)} groups={this.state.frames} groupNames={this.state.groupNames} playbackFrameRate={this.state.playbackFrameRate} blind={this.props.blind} decoderVideoUrlPairs={this.props.decoderVideoUrlPairs}></AnalyzerView>
      </div>
    }
  }
}
