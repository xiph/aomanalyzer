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
// import Toggle from 'material-ui/Toggle';
import TextField from 'material-ui/TextField';
import { YUVCanvas } from '../YUVCanvas';
import { PlayerComponent } from './Player';

import {
  Step,
  Stepper,
  StepLabel,
  StepContent,
} from 'material-ui/Stepper';

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
interface PlayerSplitComponentProps {
  videos: { decoderUrl: string, videoUrl: string, decoderName: string }[]
  isVotingEnabled: boolean
  isBlind: boolean;
}

function generateUUID() { // Public Domain/MIT
  var d = new Date().getTime();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
    d += performance.now(); //use high-precision timer if available
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export class PlayerSplitComponent extends React.Component<PlayerSplitComponentProps, {
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
  isLooping: boolean;

  directionsStepIndex: number;
}> {
  startTime = performance.now();
  // Metrics are submitted along with the vote.
  metrics = {
    date: new Date(),
    time: 0,
    play: 0,
    zoom: 0,
    stepForward: 0,
    stepBackward: 0,
    focus: 0,
    reset: 0,
    drag: 0,
    devicePixelRatio: undefined,
    scale: undefined,
    isFullScreen: undefined
  };
  constructor() {
    super();
    this.state = {
      scale: 1 / window.devicePixelRatio,
      playing: false,
      focus: -1,
      scrollTop: 0,
      scrollLeft: 0,
      showVoterIDDialog: false,
      voterID: localStorage["voterID"] || generateUUID(),
      isLooping: true,
      shouldFitWidth: false,
      directionsStepIndex: localStorage["directionsStepIndex"] | 0,
      voteIndex: -1,
      isFullScreen: false
    };
  }
  players: PlayerComponent[] = [];
  playPause() {
    this.setState({ playing: !this.state.playing } as any);
    this.players.forEach(player => player.playPause());
    this.metrics.play ++;
  }
  advanceOffset(forward: boolean, userTriggered = true) {
    this.players.forEach(player => {
      player.advanceOffset(forward, userTriggered)
      player.pauseIfPlaying();
      this.setState({ playing: false } as any);
    });
    if (forward) {
      this.metrics.stepForward ++;
    } else {
      this.metrics.stepBackward ++;
    }
  }
  resetFrameOffset() {
    this.players.forEach(player => player.resetFrameOffset());
    this.metrics.reset ++;
  }
  toggleShouldFitWidth() {
    this.setState({ shouldFitWidth: !this.state.shouldFitWidth } as any);
  }
  toggleIsLooping() {
    this.setState({ isLooping: !this.state.isLooping } as any);
  }
  toggleFullScreen() {
    function exitFullscreen() {
      if(document.exitFullscreen) {
        document.exitFullscreen();
      } else if((document as any).mozCancelFullScreen) {
        (document as any).mozCancelFullScreen();
      } else if(document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
    function launchIntoFullscreen(element) {
      if(element.requestFullscreen) {
        element.requestFullscreen();
      } else if(element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if(element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if(element.msRequestFullscreen) {
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
      this.zoom(0.5)
    });
    Mousetrap.bind(['`'], () => {
      setFocus(-1);
    });
    Mousetrap.bind(['s'], () => {
      setFocus(-1);
    });
    Mousetrap.bind(['k'], () => {
      localStorage.clear();
      console.log("Cleared Local Storage");
    });
    let self = this;
    function setFocus(focus: number) {
      self.setState({ focus } as any);
      self.metrics.focus ++;
    }
    for (let i = 1; i <= this.props.videos.length; i++) {
      Mousetrap.bind([String(i), ABC[i - 1].toLowerCase()], setFocus.bind(this, i - 1));
    }
  }
  zoom(multiplier: number) {
    let scale = this.state.scale;
    let newScale = Math.max(0.25, Math.min(32, scale * multiplier));
    let ratio = newScale / scale;
    this.setState({
      scale: newScale,
      shouldFitWidth: false,
      scrollTop: this.state.scrollTop * ratio,
      scrollLeft: this.state.scrollLeft * ratio
    } as any);
    this.metrics.zoom ++;
  }
  mountPlayer(index: number, player: PlayerComponent) {
    this.players[index] = player;
  }
  onScroll(index: number, top: number, left: number) {
    this.setState({ scrollTop: top, scrollLeft: left } as any);
  }
  onVote(index: number) {
    this.setState({voteIndex: index, showVoterIDDialog: true} as any);
  }

  handleNext() {
    const {directionsStepIndex} = this.state;
    this.setState({
      directionsStepIndex: directionsStepIndex + 1
    } as any);
    localStorage["directionsStepIndex"] = directionsStepIndex + 1;
  };
  handlePrev() {
    const {directionsStepIndex} = this.state;
    if (directionsStepIndex > 0) {
      this.setState({directionsStepIndex: directionsStepIndex - 1} as any);
    }
    localStorage["directionsStepIndex"] = directionsStepIndex - 1;
  };

  renderStepActions(step) {
    const {directionsStepIndex} = this.state;
    return (
      <div style={{margin: '12px 0'}}>
        <RaisedButton
          label={directionsStepIndex >= 2 ? 'Finish' : 'Next'}
          disableTouchRipple={true}
          disableFocusRipple={true}
          primary={true}
          onTouchTap={this.handleNext.bind(this)}
          style={{marginRight: 12}}
        />
        {step > 0 && (
          <FlatButton
            label="Back"
            disabled={directionsStepIndex === 0}
            disableTouchRipple={true}
            disableFocusRipple={true}
            onTouchTap={this.handlePrev.bind(this)}
          />
        )}
      </div>
    );
  }
  showDirections() {
    this.setState({directionsStepIndex: 0} as any);
    localStorage["directionsStepIndex"] = 0;
  }
  onVoterIDChange(event, value: string) {
    this.setState({voterID: value} as any);
    localStorage["voterID"] = value;
  }
  onSubmitVote() {
    this.setState({showVoterIDDialog: false} as any);
    let vote = {
      id: this.state.voterID,
      videos: [], metrics: this.metrics
    };
    this.props.videos.forEach(video => {
      vote.videos.push({decoder: video.decoderName, video: video.videoUrl});
    })
    if (this.state.voteIndex >= 0) {
      vote.videos[this.state.voteIndex].selected = true;
    }
    vote.metrics.time = performance.now() - this.startTime;
    vote.metrics.devicePixelRatio = window.devicePixelRatio;
    vote.metrics.scale = this.state.scale;
    vote.metrics.isFullScreen = this.state.isFullScreen;
    function sendRequest(object: any, ok: (any), error: (any)) {
      var self = this;
      var xhr = new XMLHttpRequest();
      xhr.addEventListener("load", function () {
        ok.call(this);
      });
      xhr.addEventListener("error", function (e) {
        error.call(this);
      });
      xhr.open("POST", "//arewecompressedyet.com/subjective/vote", true);
      xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
      xhr.send(JSON.stringify(object));
    }
    sendRequest(vote, () => {
      console.log("Sent");
    }, (e) => {
      alert("Something went wrong while submitting your vote.");
    });
    console.log(vote);
  }
  render() {
    let panes = this.props.videos.map((video, i) => {
      return <div key={i} className="playerSplitVerticalContent" style={{ display: (this.state.focus >= 0 && this.state.focus != i) ? "none" : "" }}>
        <PlayerComponent ref={(self: any) => this.mountPlayer(i, self)}
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
        />
      </div>
    })
    let voteButtons = null;
    let buttonStyle = {
      marginLeft: 4,
      marginRight: 4
    }
    if (this.props.isVotingEnabled) {
      voteButtons = this.props.videos.map((video, i) => {
        return <RaisedButton style={buttonStyle} key={i} label={ABC[i]} onTouchTap={this.onVote.bind(this, i)} />
      })
      voteButtons.push(<RaisedButton style={buttonStyle} key="tie" label={"Tie"} onTouchTap={this.onVote.bind(this, -1)} />)
    }
    let toggleButtons = this.props.videos.map((video, i) => {
      return <RaisedButton style={buttonStyle} primary={this.state.focus === i} key={i} label={ABC[i]} onTouchTap={() => this.setState({ focus: i } as any)}/>
    });
    toggleButtons.push(<RaisedButton style={buttonStyle} primary={this.state.focus === -1} key="split" label={"Split"} onTouchTap={(event, focus) => this.setState({ focus: -1 } as any)} />);

    return <div className="maxWidthAndHeight">
      <Dialog modal={true}
        title="Directions"
        open={this.state.directionsStepIndex < 3}
      >
        <Stepper activeStep={this.state.directionsStepIndex} orientation="vertical">
            <Step>
              <StepLabel style={{color: "white"}}>Introduction</StepLabel>
              <StepContent className="playerStep">
                <p>
                  This tool helps us understand how various compression techniques affect perceptual image quality.
                </p>
                {this.renderStepActions(0)}
              </StepContent>
            </Step>
            <Step>
              <StepLabel style={{color: "white"}}>Comparing Videos</StepLabel>
              <StepContent className="playerStep">
                <p>
                  Two or more videos will be loaded side by side. Please not that the videos may take a while to fully download and decompress.
                  You can pan / zoom and step through frames backwards and forwards.
                  We recommend that you get familiar with the keyboard shortcuts to navigate.
                </p>
                <div>
                  <span className="playerShortcut">{'<'}</span>, <span className="playerShortcut">{'>'}</span> Step Backwards and Forwards
                </div>
                <div>
                  <span className="playerShortcut">R</span> Rewind
                </div>
                <div>
                  <span className="playerShortcut">SPACE</span> Play/Pause
                </div>
                <div>
                  <span className="playerShortcut">1</span>, <span className="playerShortcut">2</span> or <span className="playerShortcut">A</span>, <span className="playerShortcut">B</span> Toggle Between Videos
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
                {this.renderStepActions(1)}
              </StepContent>
            </Step>
            <Step>
              <StepLabel style={{color: "white"}}>Submit your vote</StepLabel>
              <StepContent className="playerStep">
                <p>
                  After carefully inspecting the videos, please vote on which you prefer more.
                  If you have no preference, select <span className="playerShortcut">TIE</span>.
                </p>
                {this.renderStepActions(2)}
              </StepContent>
            </Step>
          </Stepper>
      </Dialog>
      <Dialog modal={true}
        title="Voter ID"
        open={this.state.showVoterIDDialog}
        actions={[<FlatButton
          label="Cancel"
          onTouchTap={() => this.setState({showVoterIDDialog: false} as any)}
        />,
        <FlatButton
          label="Vote"
          primary={true}
          onTouchTap={this.onSubmitVote.bind(this)}
        />]}
      >
      <TextField name="voterID" value={this.state.voterID} onChange={this.onVoterIDChange.bind(this)} style={{width: "100%"}}/>
      </Dialog>
      <div className="playerSplitVerticalContainer">
        {panes}
      </div>
      <Toolbar>
        <ToolbarGroup firstChild={true}>
          <IconButton onClick={this.showDirections.bind(this)} tooltip="Help" tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">info_outline</FontIcon>
          </IconButton>
          <IconButton onClick={this.resetFrameOffset.bind(this)} tooltip="Replay: r" tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">replay</FontIcon>
          </IconButton>
          <IconButton onClick={this.advanceOffset.bind(this, false)} tooltip="Previous: ," tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">skip_previous</FontIcon>
          </IconButton>
          <IconButton onClick={this.playPause.bind(this)} tooltip={"Play / Pause"} tooltipPosition="top-right">
            <FontIcon className="material-icons md-24">{this.state.playing ? "stop" : "play_arrow"}</FontIcon>
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
            <FontIcon color={this.state.isLooping ? deepOrange500 : undefined } className="material-icons md-24">loop</FontIcon>
          </IconButton>
          <IconButton onClick={() => this.toggleShouldFitWidth()} tooltip="Fit Width" tooltipPosition="top-center">
            <FontIcon color={this.state.shouldFitWidth ? deepOrange500 : undefined } className="material-icons md-24">aspect_ratio</FontIcon>
          </IconButton>
          <IconButton onClick={() => this.toggleFullScreen()} tooltip="Full Screen" tooltipPosition="top-center">
            <FontIcon color={this.state.isFullScreen ? deepOrange500 : undefined } className="material-icons md-24">
              { this.state.isFullScreen ? "fullscreen_exit" : "fullscreen" }
            </FontIcon>
          </IconButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarTitle text="View" />
          {toggleButtons}
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarTitle text="Vote For" />
          {voteButtons}
        </ToolbarGroup>
      </Toolbar>
    </div>
  }
}