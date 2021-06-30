import * as React from 'react';

import { assert, clamp, downloadFile, Decoder, AnalyzerFrame, FrameImage } from './analyzerTools';
import { YUVCanvas } from '../YUVCanvas';
import { PlayerComponent } from './Player';
import { CalibrateComponent } from './Calibrate';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import Stepper from '@material-ui/core/Stepper';
import Step from '@material-ui/core/Step';
import StepLabel from '@material-ui/core/StepLabel';
import TextField from '@material-ui/core/TextField';
import { DialogActions, DialogContent, DialogTitle, IconButton, Toolbar, Tooltip, Typography } from '@material-ui/core';
import { deepOrange } from '@material-ui/core/colors';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import ReplayIcon from '@material-ui/icons/Replay';
import SkipPreviousIcon from '@material-ui/icons/SkipPrevious';
import StopIcon from '@material-ui/icons/Stop';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import SkipNextIcon from '@material-ui/icons/SkipNext';
import ZoomOutIcon from '@material-ui/icons/ZoomOut';
import ZoomInIcon from '@material-ui/icons/ZoomIn';
import LoopIcon from '@material-ui/icons/Loop';
import AspectRatioIcon from '@material-ui/icons/AspectRatio';
import FullscreenIcon from '@material-ui/icons/Fullscreen';
import FullscreenExitIcon from '@material-ui/icons/FullscreenExit';

declare const Mousetrap;

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
  constructor(props) {
    super(props);
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
          <Button
            disabled={directionsStepIndex === 0}
            disableTouchRipple={true}
            disableFocusRipple={true}
            onClick={this.handlePrev.bind(this)}
            style={{ marginRight: 12 }}
          >
            Back
          </Button>
        )}
        <Button
          variant="contained"
          color="primary"
          disableTouchRipple={true}
          disableFocusRipple={true}
          onClick={this.handleNext.bind(this)}
        >
          {directionsStepIndex >= 3 ? 'Finish' : 'Next'}
        </Button>
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
          <Button
            variant="contained"
            disabled={!this.state.playersInitialized[i]}
            style={buttonStyle}
            key={i}
            onClick={this.onVote.bind(this, i)}
          >
            {ABC[i]}
          </Button>
        );
      });
      let allInitialized = true;
      this.props.videos.forEach((video, i) => {
        if (!this.state.playersInitialized[i]) {
          allInitialized = false;
        }
      });
      voteButtons.push(
        <Button
          variant="contained"
          disabled={!allInitialized}
          style={buttonStyle}
          key="tie"
          onClick={this.onVote.bind(this, -1)}
        >
          Tie
        </Button>,
      );
    }
    const toggleButtons = this.props.videos.map((video, i) => {
      return (
        <Button
          variant="contained"
          color={this.state.focus === i ? 'primary' : undefined}
          style={buttonStyle}
          key={i}
          onClick={() => this.setState({ focus: i } as any)}
        >
          {ABC[i]}
        </Button>
      );
    });
    toggleButtons.push(
      <Button
        variant="contained"
        color={this.state.focus === -1 ? 'primary' : undefined}
        style={buttonStyle}
        key="split"
        onClick={() => this.setState({ focus: -1 } as any)}
      >
        Split
      </Button>,
    );

    return (
      <div className="maxWidthAndHeight">
        <Dialog open={this.state.directionsStepIndex < 4} maxWidth={false}>
          <DialogTitle>Directions</DialogTitle>
          <DialogContent>
            <Stepper activeStep={this.state.directionsStepIndex}>
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
                  This tool helps engineers understand how various compression techniques affect perceived image
                  quality.
                </p>
                {this.renderStepActions(0)}
              </div>
            )}
            {this.state.directionsStepIndex === 1 && (
              <div className="playerStep">
                <p>
                  All squares should be distinguishable from the background. Increase your screen&apos;s brightness
                  level or use a different monitor.
                </p>
                <CalibrateComponent width={1100} height={256} />
                {this.renderStepActions(1)}
              </div>
            )}
            {this.state.directionsStepIndex === 2 && (
              <div className="playerStep">
                <p>
                  Two or more videos will be loaded side by side. Please note that the videos may take a while to fully
                  download and decompress. You can pan / zoom and step through frames backwards and forwards. We
                  recommend that you get familiar with the keyboard shortcuts to navigate.
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
                  After carefully inspecting the videos, please vote on which you prefer more. If you have no
                  preference, select <span className="playerShortcut">TIE</span>. Click the Information button on the
                  bottom left to return to this panel.
                </p>
                {this.renderStepActions(3)}
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={this.state.showVoterIDDialog}>
          <DialogTitle>Voter ID</DialogTitle>
          <DialogContent>
            <TextField
              label="Voter ID"
              name="voterID"
              value={this.state.voterID}
              onChange={this.onVoterIDChange.bind(this)}
              style={{ width: '100%' }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => this.setState({ showVoterIDDialog: false } as any)}>Cancel</Button>
            <Button color="primary" onClick={this.onSubmitVote.bind(this)}>
              {this.state.voterID ? 'Vote' : 'Vote Anonymously'}
            </Button>
          </DialogActions>
        </Dialog>
        <div className="playerSplitVerticalContainer">{panes}</div>
        <Toolbar>
          <div>
            <Tooltip title="Help" placement="top">
              <IconButton onClick={this.showDirections.bind(this)}>
                <InfoOutlinedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Replay: r" placement="top">
              <IconButton onClick={this.resetFrameOffset.bind(this)}>
                <ReplayIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Previous: ," placement="top">
              <IconButton onClick={this.advanceOffset.bind(this, false)}>
                <SkipPreviousIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Play / Pause" placement="top-end">
              <IconButton onClick={this.playPause.bind(this)}>
                {this.state.playing ? <StopIcon /> : <PlayArrowIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Next: ." placement="top">
              <IconButton onClick={this.advanceOffset.bind(this, true)}>
                <SkipNextIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Zoom Out: [" placement="top">
              <IconButton onClick={this.zoom.bind(this, 1 / 2)}>
                <ZoomOutIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Zoom In: ]" placement="top">
              <IconButton onClick={this.zoom.bind(this, 2)}>
                <ZoomInIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Loop" placement="top">
              <IconButton onClick={() => this.toggleIsLooping()}>
                <LoopIcon style={{ color: this.state.isLooping ? deepOrange[500] : undefined }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fit Width" placement="top">
              <IconButton onClick={() => this.toggleShouldFitWidth()}>
                <AspectRatioIcon style={{ color: this.state.shouldFitWidth ? deepOrange[500] : undefined }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Full Screen" placement="top">
              <IconButton onClick={() => this.toggleFullScreen()}>
                {this.state.isFullScreen ? (
                  <FullscreenExitIcon style={{ color: this.state.isFullScreen ? deepOrange[500] : undefined }} />
                ) : (
                  <FullscreenIcon style={{ color: this.state.isFullScreen ? deepOrange[500] : undefined }} />
                )}
              </IconButton>
            </Tooltip>
          </div>
          <div>
            <Typography variant="h6">View</Typography>
            {toggleButtons}
          </div>
          <div>
            <Typography variant="h6">Vote</Typography>
            {voteButtons}
          </div>
        </Toolbar>
      </div>
    );
  }
}
