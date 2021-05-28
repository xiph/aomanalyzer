import * as React from "react";
import * as ReactDOM from "react-dom";

import { LoaderComponent } from "./components/Loader";
import { PlayerSplitComponent } from "./components/PlayerSplit";
import { VotingSessionComponent } from "./components/VotingSession";
import { DownloadComponent } from "./components/Download";
import { LocalAnalyzerComponent } from "./components/LocalAnalyzer";

import {grey} from '@material-ui/core/colors';
import {createMuiTheme, CssBaseline, PaletteType, ThemeProvider} from "@material-ui/core";

export function forEachUrlParameter(callback: (key: string, value: string) => void) {
  let url = window.location.search.substring(1);
  url = url.replace(/\/$/, ""); // Replace / at the end that gets inserted by browsers.
  let params = {};
  url.split('&').forEach(function (s) {
    let t = s.split('=');
    callback(t[0], decodeURIComponent(t[1]));
  });
}

export function getUrlParameters(): any {
  let params = {};
  forEachUrlParameter((key, value) => {
    params[key] = value;
  });
  return params;
};

let parameters = getUrlParameters();
let decoder = parameters.decoder;
let file = parameters.file;
let playbackFrameRate = parameters.playbackFrameRate;
let layers = parameters.layers;
let maxFrames = parameters.maxFrames;
let local = parameters.local | 0;
let blind = parameters.blind | 0;
let split = parameters.split | 0;
let bench = parameters.bench | 0;
let download = parameters.download | 0;
let showVoteResult = parameters.showVoteResult | 0;
let player = parameters.player | 0;
let vote = parameters.vote;
let voteDescription = parameters.voteDescription || "";
let benchmark = parameters.benchmark | 0;

/**
 * Extracts decoder / file pairs from the url parameter string.
 */
function getDecoderVideoUrls(): {decoderUrl: string, videoUrl: string, decoderName: string} [] {
  let currentDecoderUrl = null;
  let currentDecoderName = null;
  let currentUrlPrefix = "";
  let pairs = [];
  forEachUrlParameter((key, value) => {
    if (key == "decoder" || key == "d") {
      currentDecoderUrl = value;
    } else if (key == "decoderName") {
      currentDecoderName = value;
    } else if (key == "prefix" || key == "p") {
      currentUrlPrefix = value;
    } else if (key == "file" || key == "f") {
      pairs.push({
        decoderUrl: currentUrlPrefix + currentDecoderUrl,
        videoUrl: currentUrlPrefix + value,
        decoderName: currentDecoderName
      });
    }
  });
  return pairs;
}

let pairs = getDecoderVideoUrls();

let overrideTheme = {
  palette: {
    type: 'dark' as PaletteType,
    accent1Color: "red"
  },
  tableRow: {
    height: 24
  },
  tableRowColumn: {
    height: 24,
    spacing: 4
  },
  tableHeaderColumn: {
    height: 32,
    spacing: 4
  },
  toolbar: {
    backgroundColor: grey[900]
  },
  tabs: {
    backgroundColor: grey[800],
    textColor: grey[100],
    selectedTextColor: grey[200]
  },
  table: {
    backgroundColor: grey[900]
  }
};

let theme = createMuiTheme(overrideTheme);

if (player || vote) {
  let videos = (vote || '').split(",").map(x => {
    return x.split(":").map(y => pairs[y|0]);
  });
  ReactDOM.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <VotingSessionComponent videos={videos} description={voteDescription} isBlind={!!blind} showResult={!!showVoteResult}/>
    </ThemeProvider>,
    document.getElementById("analyzer-app")
  );
} else if (local || pairs.length === 0) {
  ReactDOM.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalAnalyzerComponent/>
    </ThemeProvider>,
    document.getElementById("analyzer-app")
  );
} else if (download) {
  ReactDOM.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DownloadComponent video={pairs[0]}/>
    </ThemeProvider>,
    document.getElementById("analyzer-app")
  );
} else {
  ReactDOM.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LoaderComponent
        decoderVideoUrlPairs={pairs}
        playbackFrameRate={playbackFrameRate}
        layers={layers}
        maxFrames={maxFrames}
        blind={blind}
        split={split}
        bench={bench}/>
    </ThemeProvider>,
    document.getElementById("analyzer-app")
  );
}
