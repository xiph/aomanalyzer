import * as React from 'react';

import { Decoder, AnalyzerFrame, downloadFile, FrameImage } from './analyzerTools';
import CircularProgress from 'material-ui/CircularProgress';
import { saveAs } from 'file-saver';

interface DownloadComponentProps {
  video: { decoderUrl: string; videoUrl: string; decoderName: string };
  filename?: string;
}

export class DownloadComponent extends React.Component<
  DownloadComponentProps,
  {
    decoder: Decoder;
    status: string;
  }
> {
  public static defaultProps: DownloadComponentProps = {
    filename: 'image.y4m',
  } as any;

  decoder: Decoder;
  y4m: Blob;
  wroteHeader = false;

  constructor() {
    super();
    this.state = {
      decoder: null,
      status: '',
    };
  }

  frames: AnalyzerFrame[] = [];
  frameBuffer: AnalyzerFrame[] = [];

  componentDidMount() {
    this.setState({ status: 'Loading Decoder' } as any);

    Decoder.loadDecoder(this.props.video.decoderUrl).then((decoder) => {
      this.setState({ status: 'Downloading Video' } as any);
      downloadFile(this.props.video.videoUrl).then((bytes) => {
        decoder.openFileBytes(bytes);
        decoder.setLayers(0);
        this.decoder = decoder;
        this.setState({ decoder } as any);
        this.dumpFrames();
      });
    });
  }

  dumpY4MFrame(image: FrameImage) {
    if (!this.wroteHeader) {
      this.y4m = new Blob(['YUV4MPEG2 C420jpeg W' + image.Y.width + ' H' + image.Y.height + '\n']);
      this.wroteHeader = true;
    }
    this.y4m = new Blob([this.y4m, 'FRAME\n']);
    for (const plane of [image.Y, image.U, image.V]) {
      const plane_uint8 = new Uint8Array(plane.buffer);
      const plane_export = new Uint8Array(plane.width * plane.height);
      for (let y = 0; y < plane.height; y++) {
        for (let x = 0; x < plane.width; x++) {
          plane_export[y * plane.width + x] = plane_uint8[y * plane.stride + x];
        }
      }
      this.y4m = new Blob([this.y4m, plane_export]);
    }
  }

  dumpFrames() {
    this.decoder.readFrame().then(
      (frames) => {
        this.setState({ status: 'Decoding video' } as any);
        frames.forEach((frame) => {
          const image = frame.frameImage;
          this.dumpY4MFrame(image);
        });
        this.dumpFrames();
      },
      () => {
        this.setState({ status: 'Complete!' } as any);
        saveAs(this.y4m, this.props.filename, true);
      },
    );
  }

  render() {
    if (this.state.status != 'Complete!') {
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
    } else {
      return (
        <div className="playerCenterContainer">
          <div className="playerCenterContent">{this.state.status}</div>
        </div>
      );
    }
  }
}
