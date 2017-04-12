import * as React from "react";
import * as ReactDOM from "react-dom";

import { LoaderComponent } from "./components/Loader";
import { LocalAnalyzerComponent } from "./components/LocalAnalyzer";

// since the export is a function, this is the only actual correct way:
import injectTapEventPluginRequire = require("react-tap-event-plugin");

// Needed for onTouchTap
// http://stackoverflow.com/a/34015469/988941
injectTapEventPluginRequire();

import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import darkBaseTheme from 'material-ui/styles/baseThemes/darkBaseTheme';
import lightBaseTheme from 'material-ui/styles/baseThemes/lightBaseTheme';

import RaisedButton from 'material-ui/RaisedButton';
import {Tabs, Tab} from 'material-ui/Tabs';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import {grey900, grey800, grey100, grey200} from 'material-ui/styles/colors';

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
let filePrefix = parameters.filePrefix || "";
let local = parameters.local | 0;
let blind = parameters.blind | 0;
let split = parameters.split | 0;
let benchmark = parameters.benchmark | 0;

/**
 * Extracts decoder / file pairs from the url parameter string.
 */
function getDecoderVideoUrls(): {decoderUrl: string, videoUrl: string, decoderName: string} [] {
  let currenDecoder = null;
  let currenDecoderName = null;
  let pairs = [];
  forEachUrlParameter((key, value) => {
    if (key == "decoder") {
      currenDecoder = value;
    } else if (key == "decoderName") {
      currenDecoderName = value;
    } else if (key == "file") {
      pairs.push({decoderUrl: currenDecoder, videoUrl: filePrefix + value, decoderName: currenDecoderName});
    }
  });
  return pairs;
}

let pairs = getDecoderVideoUrls();

let overrideTheme = {
  palette: {
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
    backgroundColor: grey900
  },
  tabs: {
    backgroundColor: grey800,
    textColor: grey100,
    selectedTextColor: grey200
  },
  table: {
    backgroundColor: grey900
  }
};

let theme = getMuiTheme(darkBaseTheme, overrideTheme);
// let theme = getMuiTheme(lightBaseTheme, overrideTheme);

if (local || pairs.length == 0) {
  ReactDOM.render(
    <MuiThemeProvider muiTheme={theme}>
      <LocalAnalyzerComponent/>
    </MuiThemeProvider>,
    document.getElementById("analyzer-app")
  );
} else {
  ReactDOM.render(
    <MuiThemeProvider muiTheme={theme}>
    <LoaderComponent
      decoderVideoUrlPairs={pairs}
      playbackFrameRate={playbackFrameRate}
      layers={layers}
      maxFrames={maxFrames}
      blind={blind}
      split={split}/>
    </MuiThemeProvider>,
    document.getElementById("analyzer-app")
  );
}