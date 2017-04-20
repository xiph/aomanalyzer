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
import { YUVCanvas } from '../YUVCanvas';
import { PlayerComponent } from './Player';

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
interface PlayerSplitComponentProps {
  videos: { decoderUrl: string, videoUrl: string, decoderName: string }[]
  isVotingEnabled: boolean
}

export class PlayerSplitComponent extends React.Component<PlayerSplitComponentProps, {
  scale: number;
  shouldFitWidth: boolean;
  playing: boolean;
  focus: number;
  scrollTop: number;
  scrollLeft: number;
  showVoterIDDialog: boolean;
  voterID: string;
  isLooping: boolean;
}> {
  constructor() {
    super();
    this.state = {
      scale: 1,
      playing: false,
      focus: -1,
      scrollTop: 0,
      scrollLeft: 0,
      showVoterIDDialog: false,
      voterID: "XYZ",
      isLooping: false,
      shouldFitWidth: true
    };
  }
  players: PlayerComponent[] = [];
  playPause() {
    this.setState({ playing: !this.state.playing } as any);
    this.players.forEach(player => player.playPause());
  }
  advanceOffset(forward: boolean, userTriggered = true) {
    this.players.forEach(player => {
      player.advanceOffset(forward, userTriggered)
      player.pauseIfPlaying();
      this.setState({ playing: false } as any);
    });
  }
  resetFrameOffset() {
    this.players.forEach(player => player.resetFrameOffset());
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
      this.setState({ shouldFitWidth: !this.state.shouldFitWidth } as any);
    });
    Mousetrap.bind([']'], () => {
      this.zoom(1);
    });
    Mousetrap.bind(['['], () => {
      this.zoom(-1)
    });
    Mousetrap.bind(['`'], () => {
      setFocus(-1);
    });
    let self = this;
    function setFocus(focus: number) {
      self.setState({ focus } as any);
    }
    for (let i = 1; i <= this.props.videos.length; i++) {
      Mousetrap.bind([String(i)], setFocus.bind(this, i - 1));
    }
  }
  zoom(delta: number) {
    let scale = this.state.scale;
    let newScale = Math.max(1, Math.min(32, scale + delta));
    let ratio = newScale / scale;
    this.setState({
      scale: newScale,
      scrollTop: this.state.scrollTop * ratio,
      scrollLeft: this.state.scrollLeft * ratio
    } as any);
  }
  mountPlayer(index: number, player: PlayerComponent) {
    this.players[index] = player;
  }
  onScroll(index: number, top: number, left: number) {
    this.setState({ scrollTop: top, scrollLeft: left } as any);
  }
  onVote(index: number) {
    this.setState({showVoterIDDialog: true} as any);
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
        title="Voter ID"
        open={this.state.showVoterIDDialog}
        actions={[<FlatButton
          label="Ok"
          primary={true}
          onTouchTap={() => { this.setState({showVoterIDDialog: false} as any) }}
        />]}
      >
      <TextField defaultValue={this.state.voterID} style={{width: "100%"}}/>
      </Dialog>
      <div className="playerSplitVerticalContainer">
        {panes}
      </div>
      <Toolbar>
        <ToolbarGroup firstChild={true}>
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
          <IconButton onClick={this.zoom.bind(this, -1)} tooltip="Zoom Out: [" tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">zoom_out</FontIcon>
          </IconButton>
          <IconButton onClick={this.zoom.bind(this, +1)} tooltip="Zoom In: ]" tooltipPosition="top-center">
            <FontIcon className="material-icons md-24">zoom_in</FontIcon>
          </IconButton>
          <Toggle style={{maxWidth: 120}} labelPosition="right" toggled={this.state.shouldFitWidth} onToggle={(event, shouldFitWidth) => this.setState({shouldFitWidth} as any)}
            label="Fit Width"
          />
          <Toggle style={{maxWidth: 120}} labelPosition="right" toggled={this.state.isLooping} onToggle={(event, isLooping) => this.setState({isLooping} as any)}
            label="Loop"
          />
          {toggleButtons}
          {/*<span className="splitTextContent" style={{ width: "256px" }}>
            Frame: {this.state.activeFrame + 1} of {this.props.groups[0].length}
          </span>*/}
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarTitle text="Vote" />
          {voteButtons}
        </ToolbarGroup>
      </Toolbar>
    </div>
  }
}