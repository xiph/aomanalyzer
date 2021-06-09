import * as React from 'react';

import Paper from 'material-ui/Paper';
import Dialog from 'material-ui/Dialog';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import Checkbox from 'material-ui/Checkbox';
import {
  grey900,
  grey800,
  grey100,
  grey200,
  red100,
  red500,
  red600,
  red700,
  red800,
  red900,
  deepOrange500,
} from 'material-ui/styles/colors';
import { assert, clamp, downloadFile, Decoder, AnalyzerFrame, FrameImage } from './analyzerTools';
import LinearProgress from 'material-ui/LinearProgress';
import CircularProgress from 'material-ui/CircularProgress';
import RaisedButton from 'material-ui/RaisedButton';
import FlatButton from 'material-ui/FlatButton';
import { Table, TableBody, TableHeader, TableHeaderColumn, TableRow, TableRowColumn } from 'material-ui/Table';

import TextField from 'material-ui/TextField';
import { YUVCanvas } from '../YUVCanvas';
import { PlayerComponent } from './Player';
import { CalibrateComponent } from './Calibrate';

declare const Mousetrap;

import { Step, Stepper, StepLabel, StepContent } from 'material-ui/Stepper';

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
interface PlayerSplitComponentProps {
  videos: { decoderUrl: string; videoUrl: string; decoderName: string }[];
  isVotingEnabled: boolean;
  onVoted?: (vote: any) => void;
}

declare global {
  interface Document {
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => Promise<void>;
    mozFullScreenElement?: Element;
    msFullscreenElement?: Element;
    webkitFullscreenElement?: Element;
  }

  interface HTMLElement {
    msRequestFullscreen?: () => Promise<void>;
    mozRequestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  }
}

function generateUUID() {
  // Public Domain/MIT
  let d = new Date().getTime();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    d += performance.now(); //use high-precision timer if available
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, function (c) {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    })
    .toUpperCase();
}

function isUUID(uuid: string) {
  if (uuid.length != 36) {
    return false;
  }
  return true;
}

export class PlayerSplitComponent extends React.Component<
  PlayerSplitComponentProps,
  {
    scale: number;
    shouldFitWidth: boolean;
    isFullScreen: boolean;
    playing: boolean;
    focus: number;
    scrollTop: number;
    scrollLeft: number;
    voteIndex: number;
    showVoterIDDialog: boolean;
    voterID: string;
    voterEmail: String;
    isLooping: boolean;
    playersInitialized: boolean[];
    directionsStepIndex: number;
  }
> {
  startTime = performance.now();
  // Metrics are submitted along with the vote.
  metrics = {
    date: new Date(),
    time: 0,
    playCount: 0,
    zoomCount: 0,
    stepForwardCount: 0,
    stepBackwardCount: 0,
    focusCount: 0,
    resetCount: 0,
    drag: 0,
    devicePixelRatio: undefined,
    state: undefined,
    playerDecodeStats: undefined,
  };
  constructor() {
    super();
    if (!localStorage['voterID']) {
      localStorage['voterID'] = generateUUID();
    }
    this.metrics.state = this.state = {
      scale: 1 / window.devicePixelRatio,
      playing: false,
      focus: -1,
      scrollTop: 0,
      scrollLeft: 0,
      showVoterIDDialog: false,
      voterID: localStorage['voterID'],
      voterEmail: localStorage['voterEmail'] || '',
      isLooping: true,
      shouldFitWidth: false,
      directionsStepIndex: localStorage['directionsStepIndex'] | 0,
      voteIndex: -1,
      isFullScreen: false,
      playersInitialized: [],
    };
  }
  players: PlayerComponent[] = [];
  playerInterval: number;
  componentWillUnmount() {
    this.pauseIfPlaying();
  }
  pauseIfPlaying() {
    if (this.playerInterval) {
      clearInterval(this.playerInterval);
      this.playerInterval = 0;
    }
  }
  playPause() {
    let frameRate = 30;
    if (this.players.length && this.players[0].decoder) {
      frameRate = this.players[0].decoder.frameRate;
    }
    this.setState({ playing: !this.state.playing } as any);
    if (this.playerInterval) {
      this.pauseIfPlaying();
      return;
    }
    const self = this;
    this.playerInterval = window.setInterval(() => {
      if (!this.players.every((player) => player.canAdvanceOffsetWithoutLooping(true))) {
        if (this.state.isLooping) {
          this.players.forEach((player) => player.resetFrameOffset());
        }
        return;
      }
      this.players.forEach((player) => player.advanceOffset(true, false));
    }, 1000 / frameRate);
    this.metrics.playCount++;
  }
  advanceOffset(forward: boolean, userTriggered = true) {
    if (!this.players.every((player) => player.canAdvanceOffsetWithoutLooping(forward))) {
      if (this.state.isLooping) {
        this.players.forEach((player) => player.resetFrameOffset());
      }
      return;
    }
    this.pauseIfPlaying();
    this.players.forEach((player) => {
      player.advanceOffset(forward, userTriggered);
      this.setState({ playing: false } as any);
    });
    if (forward) {
      this.metrics.stepForwardCount++;
    } else {
      this.metrics.stepBackwardCount++;
    }
  }
  resetFrameOffset() {
    this.players.forEach((player) => player.resetFrameOffset());
    this.metrics.resetCount++;
  }
  toggleShouldFitWidth() {
    this.setState({ shouldFitWidth: !this.state.shouldFitWidth } as any);
  }
  toggleIsLooping() {
    this.setState({ isLooping: !this.state.isLooping } as any);
  }
  toggleFullScreen() {
    function exitFullscreen() {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    function launchIntoFullscreen(element) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
    }
    if (this.state.isFullScreen) {
      exitFullscreen();
    } else {
      launchIntoFullscreen(document.documentElement);
    }
    this.setState({ isFullScreen: !this.state.isFullScreen } as any);
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
      this.toggleShouldFitWidth();
    });
    Mousetrap.bind([']'], () => {
      this.zoom(2);
    });
    Mousetrap.bind(['['], () => {
      this.zoom(0.5);
    });
    Mousetrap.bind(['`'], () => {
      setFocus(-1);
    });
    Mousetrap.bind(['s'], () => {
      setFocus(-1);
    });
    Mousetrap.bind(['k'], () => {
      localStorage.clear();
      console.log('Cleared Local Storage');
    });
    const keyboardScrollSpeed = 64;
    Mousetrap.bind(['right'], (e) => {
      let { scrollLeft } = this.state;
      scrollLeft += keyboardScrollSpeed;
      // TODO: Clamp right.
      this.setState({ scrollLeft } as any);
      e.preventDefault();
    });
    Mousetrap.bind(['left'], (e) => {
      let { scrollLeft } = this.state;
      scrollLeft -= keyboardScrollSpeed;
      if (scrollLeft < 0) scrollLeft = 0;
      this.setState({ scrollLeft } as any);
      e.preventDefault();
    });
    Mousetrap.bind(['up'], (e) => {
      let { scrollTop } = this.state;
      scrollTop -= keyboardScrollSpeed;
      if (scrollTop < 0) scrollTop = 0;
      this.setState({ scrollTop } as any);
      e.preventDefault();
    });
    Mousetrap.bind(['down'], (e) => {
      let { scrollTop } = this.state;
      scrollTop += keyboardScrollSpeed;
      // TODO: Clamp down.
      this.setState({ scrollTop } as any);
      e.preventDefault();
    });
    const self = this;
    function setFocus(focus: number) {
      self.setState({ focus } as any);
      self.metrics.focusCount++;
    }
    for (let i = 1; i <= this.props.videos.length; i++) {
      Mousetrap.bind([String(i), ABC[i - 1].toLowerCase()], setFocus.bind(this, i - 1));
    }
  }
  zoom(multiplier: number) {
    const scale = this.state.scale;
    const newScale = Math.max(0.25, Math.min(32, scale * multiplier));
    const ratio = newScale / scale;
    this.setState({
      scale: newScale,
      shouldFitWidth: false,
      scrollTop: this.state.scrollTop * ratio,
      scrollLeft: this.state.scrollLeft * ratio,
    } as any);
    this.metrics.zoomCount++;
  }
  mountPlayer(index: number, player: PlayerComponent) {
    this.players[index] = player;
  }
  onScroll(index: number, top: number, left: number) {
    this.setState({ scrollTop: top, scrollLeft: left } as any);
  }
  onVote(index: number) {
    this.setState({ voteIndex: index, showVoterIDDialog: true } as any);
  }

  handleNext() {
    const { directionsStepIndex } = this.state;
    this.setState({
      directionsStepIndex: directionsStepIndex + 1,
    } as any);
    localStorage['directionsStepIndex'] = directionsStepIndex + 1;
  }
  handlePrev() {
    const { directionsStepIndex } = this.state;
    if (directionsStepIndex > 0) {
      this.setState({ directionsStepIndex: directionsStepIndex - 1 } as any);
    }
    localStorage['directionsStepIndex'] = directionsStepIndex - 1;
  }

  renderStepActions(step) {
    const { directionsStepIndex } = this.state;
    return (
      <div style={{ margin: '12px 0' }}>
        {step > 0 && (
          <FlatButton
            label="Back"
            disabled={directionsStepIndex === 0}
            disableTouchRipple={true}
            disableFocusRipple={true}
            onTouchTap={this.handlePrev.bind(this)}
            style={{ marginRight: 12 }}
          />
        )}
        <RaisedButton
          label={directionsStepIndex >= 3 ? 'Finish' : 'Next'}
          disableTouchRipple={true}
          disableFocusRipple={true}
          primary={true}
          onTouchTap={this.handleNext.bind(this)}
        />
      </div>
    );
  }
  showDirections() {
    this.setState({ directionsStepIndex: 0 } as any);
    localStorage['directionsStepIndex'] = 0;
  }
  onVoterIDChange(event, value: string) {
    this.setState({ voterID: value } as any);
    localStorage['voterID'] = value;
  }
  onVoterEmailChange(event, value: string) {
    this.setState({ voterEmail: value } as any);
    localStorage['voterEmail'] = value;
  }
  onSubmitVote() {
    this.setState({ showVoterIDDialog: false } as any);
    const vote = {
      id: generateUUID(),
      voter: this.state.voterID || generateUUID(),
      videos: [],
      metrics: this.metrics,
    };
    this.props.videos.forEach((video) => {
      vote.videos.push({ decoder: video.decoderUrl, video: video.videoUrl });
    });
    if (this.state.voteIndex >= 0) {
      vote.videos[this.state.voteIndex].selected = true;
    }
    vote.metrics.time = performance.now() - this.startTime;
    vote.metrics.devicePixelRatio = window.devicePixelRatio;
    vote.metrics.playerDecodeStats = this.players.map((player) => player.getAllFrameDecodeStats());
    function sendRequest(object: any, ok: any, error: any) {
      const self = this;
      const xhr = new XMLHttpRequest();
      xhr.addEventListener('load', function () {
        ok.call(this);
      });
      xhr.addEventListener('error', function (e) {
        error.call(this);
      });
      xhr.open('POST', '/subjective/vote', true);
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      xhr.send(JSON.stringify(object));
    }
    sendRequest(
      vote,
      () => {
        console.log('Sent');
      },
      (e) => {
        console.error('Something went wrong while submitting your vote.');
      },
    );
    if (this.props.onVoted) {
      this.props.onVoted(vote);
    }
  }
  onInitialized(i: number) {
    const { playersInitialized } = this.state;
    playersInitialized[i] = true;
    this.setState({ playersInitialized } as any);
  }
  render() {
    const panes = this.props.videos.map((video, i) => {
      return (
        <div
          key={i}
          className="playerSplitVerticalContent"
          style={{ display: this.state.focus >= 0 && this.state.focus != i ? 'none' : '' }}
        >
          <PlayerComponent
            ref={(self: any) => this.mountPlayer(i, self)}
            onScroll={this.onScroll.bind(this, i)}
            video={video}
            bench={0}
            areDetailsVisible={false}
            shouldFitWidth={this.state.shouldFitWidth}
            scale={this.state.scale}
            scrollTop={this.state.scrollTop}
            scrollLeft={this.state.scrollLeft}
            labelPrefix={ABC[i]}
            isLooping={this.state.isLooping}
            onInitialized={this.onInitialized.bind(this, i)}
          />
        </div>
      );
    });
    let voteButtons = null;
    const buttonStyle = {
      marginLeft: 4,
      marginRight: 4,
    };
    if (this.props.isVotingEnabled) {
      voteButtons = this.props.videos.map((video, i) => {
        return (
          <RaisedButton
            disabled={!this.state.playersInitialized[i]}
            style={buttonStyle}
            key={i}
            label={ABC[i]}
            onTouchTap={this.onVote.bind(this, i)}
          />
        );
      });
      let allInitialized = true;
      this.props.videos.forEach((video, i) => {
        if (!this.state.playersInitialized[i]) {
          allInitialized = false;
        }
      });
      voteButtons.push(
        <RaisedButton
          disabled={!allInitialized}
          style={buttonStyle}
          key="tie"
          label={'Tie'}
          onTouchTap={this.onVote.bind(this, -1)}
        />,
      );
    }
    const toggleButtons = this.props.videos.map((video, i) => {
      return (
        <RaisedButton
          style={buttonStyle}
          primary={this.state.focus === i}
          key={i}
          label={ABC[i]}
          onTouchTap={() => this.setState({ focus: i } as any)}
        />
      );
    });
    toggleButtons.push(
      <RaisedButton
        style={buttonStyle}
        primary={this.state.focus === -1}
        key="split"
        label={'Split'}
        onTouchTap={(event, focus) => this.setState({ focus: -1 } as any)}
      />,
    );

    const customContentStyle = {
      width: '1200px',
      maxWidth: 'none',
    };
    return (
      <div className="maxWidthAndHeight">
        <Dialog
          bodyStyle={{ backgroundColor: 'black' }}
          contentStyle={customContentStyle}
          modal={true}
          title="Directions"
          open={this.state.directionsStepIndex < 4}
        >
          <Stepper width={1024} activeStep={this.state.directionsStepIndex}>
            <Step>
              <StepLabel style={{ color: 'white' }}>Introduction</StepLabel>
            </Step>
            <Step>
              <StepLabel style={{ color: 'white' }}>Calibrate</StepLabel>
            </Step>
            <Step>
              <StepLabel style={{ color: 'white' }}>Comparing Videos</StepLabel>
            </Step>
            <Step>
              <StepLabel style={{ color: 'white' }}>Submit your vote</StepLabel>
            </Step>
          </Stepper>
          {this.state.directionsStepIndex === 0 && (
            <div className="playerStep">
              <p>
                This tool helps engineers understand how various compression techniques affect perceived image quality.
              </p>
              {this.renderStepActions(0)}
            </div>
          )}
          {this.state.directionsStepIndex === 1 && (
            <div className="playerStep">
              <p>
                All squares should be distinguishable from the background. Increase your screen&#39;s brightness level
                or use a different monitor.
              </p>
              <CalibrateComponent width={1100} height={256} />
              {this.renderStepActions(1)}
            </div>
          )}
          {this.state.directionsStepIndex === 2 && (
            <div className="playerStep">
              <p>
                Two or more videos will be loaded side by side. Please note that the videos may take a while to fully
                download and decompress. You can pan / zoom and step through frames backwards and forwards. We recommend
                that you get familiar with the keyboard shortcuts to navigate.
              </p>
              <div>
                <span className="playerShortcut">{'<'}</span>, <span className="playerShortcut">{'>'}</span> Step
                Backwards and Forwards
              </div>
              <div>
                <span className="playerShortcut">R</span> Rewind
              </div>
              <div>
                <span className="playerShortcut">SPACE</span> Play/Pause
              </div>
              <div>
                <span className="playerShortcut">1</span>, <span className="playerShortcut">2</span> or{' '}
                <span className="playerShortcut">A</span>, <span className="playerShortcut">B</span> Toggle Between
                Videos
              </div>
              <div>
                <span className="playerShortcut">~</span> or <span className="playerShortcut">S</span> Split Screen
              </div>
              <div>
                <span className="playerShortcut">F</span> Fit Width
              </div>
              <div>
                <span className="playerShortcut">[</span> , <span className="playerShortcut">]</span> Zoom Out / In
              </div>
              <div>
                <span className="playerShortcut">Arrow Keys</span> Pan
              </div>
              {this.renderStepActions(2)}
            </div>
          )}
          {this.state.directionsStepIndex === 3 && (
            <div className="playerStep">
              <p>
                After carefully inspecting the videos, please vote on which you prefer more. If you have no preference,
                select <span className="playerShortcut">TIE</span>. Click the Information button on the bottom left to
                return to this panel.
              </p>
              {this.renderStepActions(3)}
            </div>
          )}
        </Dialog>
        <Dialog
          modal={true}
          title="Voter ID"
          open={this.state.showVoterIDDialog}
          actions={[
            <FlatButton label="Cancel" onTouchTap={() => this.setState({ showVoterIDDialog: false } as any)} />,
            <FlatButton
              label={this.state.voterID ? 'Vote' : 'Vote Anonymously'}
              primary={true}
              onTouchTap={this.onSubmitVote.bind(this)}
            />,
          ]}
        >
          <TextField
            floatingLabelText="Voter ID"
            floatingLabelFixed={true}
            name="voterID"
            value={this.state.voterID}
            onChange={this.onVoterIDChange.bind(this)}
            style={{ width: '100%' }}
          />
        </Dialog>
        <div className="playerSplitVerticalContainer">{panes}</div>
        <Toolbar>
          <ToolbarGroup firstChild={true}>
            <IconButton onClick={this.showDirections.bind(this)} tooltip="Help" tooltipPosition="top-center">
              <FontIcon className="material-icons md-24">info_outline</FontIcon>
            </IconButton>
            <IconButton onClick={this.resetFrameOffset.bind(this)} tooltip="Replay: r" tooltipPosition="top-center">
              <FontIcon className="material-icons md-24">replay</FontIcon>
            </IconButton>
            <IconButton
              onClick={this.advanceOffset.bind(this, false)}
              tooltip="Previous: ,"
              tooltipPosition="top-center"
            >
              <FontIcon className="material-icons md-24">skip_previous</FontIcon>
            </IconButton>
            <IconButton onClick={this.playPause.bind(this)} tooltip={'Play / Pause'} tooltipPosition="top-right">
              <FontIcon className="material-icons md-24">{this.state.playing ? 'stop' : 'play_arrow'}</FontIcon>
            </IconButton>
            <IconButton onClick={this.advanceOffset.bind(this, true)} tooltip="Next: ." tooltipPosition="top-center">
              <FontIcon className="material-icons md-24">skip_next</FontIcon>
            </IconButton>
            <IconButton onClick={this.zoom.bind(this, 1 / 2)} tooltip="Zoom Out: [" tooltipPosition="top-center">
              <FontIcon className="material-icons md-24">zoom_out</FontIcon>
            </IconButton>
            <IconButton onClick={this.zoom.bind(this, 2)} tooltip="Zoom In: ]" tooltipPosition="top-center">
              <FontIcon className="material-icons md-24">zoom_in</FontIcon>
            </IconButton>
            <IconButton onClick={() => this.toggleIsLooping()} tooltip="Loop" tooltipPosition="top-center">
              <FontIcon color={this.state.isLooping ? deepOrange500 : undefined} className="material-icons md-24">
                loop
              </FontIcon>
            </IconButton>
            <IconButton onClick={() => this.toggleShouldFitWidth()} tooltip="Fit Width" tooltipPosition="top-center">
              <FontIcon color={this.state.shouldFitWidth ? deepOrange500 : undefined} className="material-icons md-24">
                aspect_ratio
              </FontIcon>
            </IconButton>
            <IconButton onClick={() => this.toggleFullScreen()} tooltip="Full Screen" tooltipPosition="top-center">
              <FontIcon color={this.state.isFullScreen ? deepOrange500 : undefined} className="material-icons md-24">
                {this.state.isFullScreen ? 'fullscreen_exit' : 'fullscreen'}
              </FontIcon>
            </IconButton>
          </ToolbarGroup>
          <ToolbarGroup>
            <ToolbarTitle text="View" />
            {toggleButtons}
          </ToolbarGroup>
          <ToolbarGroup>
            <ToolbarTitle text="Vote" />
            {voteButtons}
          </ToolbarGroup>
        </Toolbar>
      </div>
    );
  }
}
