import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { LoaderComponent } from './components/Loader';
import { PlayerSplitComponent } from './components/PlayerSplit';
import { VotingSessionComponent } from './components/VotingSession';
import { DownloadComponent } from './components/Download';
import { LocalAnalyzerComponent } from './components/LocalAnalyzer';

// since the export is a function, this is the only actual correct way:
import injectTapEventPluginRequire = require('react-tap-event-plugin');

// Needed for onTouchTap
// http://stackoverflow.com/a/34015469/988941
injectTapEventPluginRequire();

import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import darkBaseTheme from 'material-ui/styles/baseThemes/darkBaseTheme';
import lightBaseTheme from 'material-ui/styles/baseThemes/lightBaseTheme';

import RaisedButton from 'material-ui/RaisedButton';
import { Tabs, Tab } from 'material-ui/Tabs';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import { grey900, grey800, grey100, grey200 } from 'material-ui/styles/colors';

export function forEachUrlParameter(callback: (key: string, value: string) => void) {
  let url = window.location.search.substring(1);
  url = url.replace(/\/$/, ''); // Replace / at the end that gets inserted by browsers.
  const params = {};
  url.split('&').forEach(function (s) {
    const t = s.split('=');
    callback(t[0], decodeURIComponent(t[1]));
  });
}

export function getUrlParameters(): any {
  const params = {};
  forEachUrlParameter((key, value) => {
    params[key] = value;
  });
  return params;
}

const parameters = getUrlParameters();
const decoder = parameters.decoder;
const file = parameters.file;
const playbackFrameRate = parameters.playbackFrameRate;
const layers = parameters.layers;
const maxFrames = parameters.maxFrames;
const local = parameters.local | 0;
const blind = parameters.blind | 0;
const split = parameters.split | 0;
const bench = parameters.bench | 0;
const download = parameters.download | 0;
const showVoteResult = parameters.showVoteResult | 0;
const player = parameters.player | 0;
const vote = parameters.vote;
const voteDescription = parameters.voteDescription || '';
const benchmark = parameters.benchmark | 0;

/**
 * Extracts decoder / file pairs from the url parameter string.
 */
function getDecoderVideoUrls(): { decoderUrl: string; videoUrl: string; decoderName: string }[] {
  let currentDecoderUrl = null;
  let currentDecoderName = null;
  let currentUrlPrefix = '';
  const pairs = [];
  forEachUrlParameter((key, value) => {
    if (key == 'decoder' || key == 'd') {
      currentDecoderUrl = value;
    } else if (key == 'decoderName') {
      currentDecoderName = value;
    } else if (key == 'prefix' || key == 'p') {
      currentUrlPrefix = value;
    } else if (key == 'file' || key == 'f') {
      pairs.push({
        decoderUrl: currentUrlPrefix + currentDecoderUrl,
        videoUrl: currentUrlPrefix + value,
        decoderName: currentDecoderName,
      });
    }
  });
  return pairs;
}

const pairs = getDecoderVideoUrls();

const overrideTheme = {
  palette: {
    accent1Color: 'red',
  },
  tableRow: {
    height: 24,
  },
  tableRowColumn: {
    height: 24,
    spacing: 4,
  },
  tableHeaderColumn: {
    height: 32,
    spacing: 4,
  },
  toolbar: {
    backgroundColor: grey900,
  },
  tabs: {
    backgroundColor: grey800,
    textColor: grey100,
    selectedTextColor: grey200,
  },
  table: {
    backgroundColor: grey900,
  },
};

const theme = getMuiTheme(darkBaseTheme, overrideTheme);

if (player || vote) {
  const videos = vote.split(',').map((x) => {
    return x.split(':').map((y) => pairs[y | 0]);
  });
  ReactDOM.render(
    <MuiThemeProvider muiTheme={theme}>
      <VotingSessionComponent
        videos={videos}
        description={voteDescription}
        isBlind={!!blind}
        showResult={!!showVoteResult}
      />
    </MuiThemeProvider>,
    document.getElementById('analyzer-app'),
  );
} else if (local || pairs.length == 0) {
  ReactDOM.render(
    <MuiThemeProvider muiTheme={theme}>
      <LocalAnalyzerComponent />
    </MuiThemeProvider>,
    document.getElementById('analyzer-app'),
  );
} else if (download) {
  ReactDOM.render(
    <MuiThemeProvider muiTheme={theme}>
      <DownloadComponent video={pairs[0]} />
    </MuiThemeProvider>,
    document.getElementById('analyzer-app'),
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
        split={split}
        bench={bench}
      />
    </MuiThemeProvider>,
    document.getElementById('analyzer-app'),
  );
}
