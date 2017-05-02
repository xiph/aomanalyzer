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
import { saveAs } from 'file-saver';

interface DownloadComponentProps {
  video: { decoderUrl: string, videoUrl: string, decoderName: string };
}

export class DownloadComponent extends React.Component<DownloadComponentProps, {
  decoder: Decoder;
  status: string;
}> {
  public static defaultProps: DownloadComponentProps = {
  } as any;

  decoder: Decoder;
  y4m: Blob;
  playerInterval: number;
  fetchPumpInterval: number;
  drainFetchPumpInterval: number;
  wroteHeader: boolean = false;

  constructor() {
    super();
    this.state = {
      decoder: null,
      status: "",
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

  /**
   * Not the React way.
   */
  isComponentMounted: boolean = false;

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
    this.isComponentMounted = true;
  }

  componentWillUnmount() {
    this.pauseIfPlaying();
    this.isComponentMounted = false;
  }

  forceUpdateIfMounted() {
    if (this.isComponentMounted) {
      this.forceUpdate();
    } else {
      console.warn("Shouldn't be updating anymore.");
    }
  }

  dumpY4MFrame(image: FrameImage) {
    if (!this.wroteHeader) {
      this.y4m = new Blob(["YUV4MPEG2 C420jpeg W"+image.Y.width+" H"+image.Y.height+"\n"]);
      this.wroteHeader = true;
    }
    this.y4m = new Blob([this.y4m, "FRAME\n"]);
    for (let plane of [image.Y, image.U, image.V]) {
      let plane_uint8 = new Uint8Array(plane.buffer);
      let plane_export = new Uint8Array(plane.width*plane.height);
      for (let y = 0; y < plane.height; y++) {
        for (let x = 0; x < plane.width; x++) {
          plane_export[y*plane.width+x] = plane_uint8[y*plane.stride+x];
        }
      }
      this.y4m = new Blob([this.y4m,plane_export]);
    }
  }

  initialize(decoder: Decoder) {
    decoder.readFrame().then(frames => {
      frames.forEach(frame => {
        let image = frames[0].frameImage; 
        this.dumpY4MFrame(image);
        saveAs(this.y4m,"image.y4m",true);
      });
      //let image = frames[0].frameImage;
      //this.forceUpdateIfMounted();
      //this.startFetchPump();
    });
  }

  advanceOffset(forward: boolean, userTriggered = true) {
    if (userTriggered) {
      // this.pauseIfPlaying();
    }
  }

  resetFrameOffset() {
    this.setState({ frameOffset: 0 } as any);
  }

  ignoreNextScrollEvent = false;
  render() {
    let valueStyle = { textAlign: "right", fontSize: "12px" };

    let allStats, lastStats, benchStats;

    if (!this.state.decoder) {
      return <div className="playerCenterContainer">
  <div className="playerCenterContent">
    <CircularProgress size={40} thickness={7} /><br /><br />
    {this.state.status}
  </div>
      </div>
    }
    return <div>Download</div>
  }

}
