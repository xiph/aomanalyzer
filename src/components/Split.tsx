import * as React from 'react';

import { AnalyzerFrame } from './analyzerTools';
import { unreachable } from './analyzerTools';
import {
  Checkbox,
  Dialog,
  DialogContent,
  Drawer,
  FormControlLabel,
  FormGroup,
  IconButton,
  Paper,
  Toolbar,
  Tooltip,
} from '@material-ui/core';
import { grey } from '@material-ui/core/colors';
import DashboardIcon from '@material-ui/icons/Dashboard';
import ListIcon from '@material-ui/icons/List';
import SkipPreviousIcon from '@material-ui/icons/SkipPrevious';
import StopIcon from '@material-ui/icons/Stop';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import SkipNextIcon from '@material-ui/icons/SkipNext';
import Replay30Icon from '@material-ui/icons/Replay30';

declare const Mousetrap;

enum SplitMode {
  // Left,
  // Right,
  Vertical,
  Horizontal,
  Last,
}

interface SplitViewProps {
  groups: AnalyzerFrame[][];
  groupNames?: string[];
  onDecodeAdditionalFrames: (count: number) => void;
  playbackFrameRate?: number;
  mode?: SplitMode;
}

export class SplitView extends React.Component<
  SplitViewProps,
  {
    activeFrame: number;
    mode: SplitMode;
    playInterval: any;
    lockScroll: boolean;
    showDetails: boolean;
  }
> {
  center: HTMLDivElement;
  left: HTMLDivElement;
  right: HTMLDivElement;
  top: HTMLDivElement;
  bottom: HTMLDivElement;

  public static defaultProps: SplitViewProps = {
    groups: [],
    groupNames: null,
    playbackFrameRate: 30,
    onDecodeAdditionalFrames: null,
    mode: SplitMode.Vertical,
  };

  constructor(props: SplitViewProps) {
    super(props);
    this.state = {
      activeFrame: 0,
      playInterval: null,
      lockScroll: false,
      mode: props.mode % SplitMode.Last,
      showDetails: false,
    };
  }
  componentDidMount() {
    this.installKeyboardShortcuts();
  }
  installKeyboardShortcuts() {
    Mousetrap.bind(['`'], (e) => {
      this.toggleDetails();
      e.preventDefault();
    });
    Mousetrap.bind(['tab'], (e) => {
      this.advanceView();
      e.preventDefault();
    });
    Mousetrap.bind(['space'], (e) => {
      this.playPause();
      e.preventDefault();
    });
    Mousetrap.bind(['.'], (e) => {
      this.advanceFrame(1);
      e.preventDefault();
    });
    Mousetrap.bind([','], () => {
      this.advanceFrame(-1);
    });
  }
  mountView(name, el: HTMLDivElement, group) {
    this[name] = el;
    const self = this;
    function lock(a, b) {
      if (self.state.lockScroll) {
        self[a].scrollTop = self[b].scrollTop;
        self[a].scrollLeft = self[b].scrollLeft;
      }
    }
    if (this[name]) {
      if (name === 'left') {
        el.onscroll = lock.bind(this, 'right', 'left');
      } else if (name === 'right') {
        el.onscroll = lock.bind(this, 'left', 'right');
      } else if (name === 'top') {
        el.onscroll = lock.bind(this, 'bottom', 'top');
      } else if (name === 'bottom') {
        el.onscroll = lock.bind(this, 'top', 'bottom');
      }
      if (el.lastChild) {
        el.removeChild(el.lastChild);
      }
      el.appendChild(this.props.groups[group][this.state.activeFrame].image);
    }
  }
  toggleDetails() {
    this.setState({ showDetails: !this.state.showDetails } as any);
  }
  advanceView() {
    let mode = this.state.mode;
    mode = (mode + 1) % SplitMode.Last;
    this.setState({ mode } as any);
  }
  advanceFrame(delta) {
    let activeFrame = this.state.activeFrame + delta;
    if (activeFrame < 0) {
      activeFrame += this.props.groups[0].length;
    }
    activeFrame = activeFrame % this.props.groups[0].length;
    this.setActiveFrame(activeFrame);
  }
  setActiveFrame(activeFrame) {
    this.setState({ activeFrame } as any);
  }
  playPause() {
    let playInterval = this.state.playInterval;
    if (!playInterval) {
      playInterval = setInterval(() => {
        this.advanceFrame(1);
      }, 1000 / this.props.playbackFrameRate);
    } else {
      clearInterval(playInterval);
      playInterval = 0;
    }
    this.setState({ playInterval } as any);
  }
  alertDecodeAdditionalFrames(count: number) {
    alert('Frames will be decoded in the background and may take a while.');
    if (this.props.onDecodeAdditionalFrames) {
      this.props.onDecodeAdditionalFrames(count);
    }
  }
  render() {
    if (this.props.groups.length < 2) {
      return (
        <Dialog open={true}>
          <DialogContent>Provide at least two videos to compare.</DialogContent>
        </Dialog>
      );
    }
    let content = null;
    switch (this.state.mode) {
      /*case SplitMode.Left:
        content = <div className="splitCenterContainer">
          <div ref={(self: any) => this.mountView("center", self, 0)} />
        </div>
        break;
      case SplitMode.Right:
        content = <div className="splitCenterContainer">
          <div ref={(self: any) => this.mountView("center", self, 1)} />
        </div>
        break;*/
      case SplitMode.Vertical:
        content = (
          <div className="splitVerticalContainer">
            <div className="splitVerticalContent" ref={(self: any) => this.mountView('left', self, 0)} />
            <div className="splitVerticalContent" ref={(self: any) => this.mountView('right', self, 1)} />
          </div>
        );
        break;
      case SplitMode.Horizontal:
        content = (
          <div className="splitHorizontalContainer">
            <div className="splitHorizontalContent" ref={(self: any) => this.mountView('top', self, 0)} />
            <div className="splitHorizontalContent" ref={(self: any) => this.mountView('bottom', self, 1)} />
          </div>
        );
        break;
    }

    let details = null;

    const paperStyle = {
      padding: 10,
      marginTop: 10,
      marginBottom: 10,
      backgroundColor: grey[900],
    };

    const self = this;
    function getLabel(i) {
      switch (self.state.mode) {
        // case SplitMode.Left: return ["Visible", "Hidden"][i];
        // case SplitMode.Right: return ["Hidden", "Visible"][i];
        case SplitMode.Vertical:
          return ['Left', 'Right', ''][i];
        case SplitMode.Horizontal:
          return ['Top', 'Bottom', ''][i];
        default:
          unreachable();
      }
    }
    function getGroupName(i) {
      const groupNames = self.props.groupNames;
      if (groupNames && groupNames.length) {
        return groupNames[i];
      }
      return 'Untitled ' + i;
    }
    if (this.props.groups) {
      details = (
        <div className="splitTextContent">
          {this.props.groups.map((name, i) => (
            <Paper key={i} style={paperStyle}>
              <div>
                {getLabel(i)} {getGroupName(i)}
              </div>
            </Paper>
          ))}
        </div>
      );
    }
    return (
      <div className="maxWidthAndHeight">
        <Drawer
          style={{ width: '512px' }}
          open={this.state.showDetails}
          onClose={() => this.setState((state) => ({ showDetails: !state.showDetails }))}
        >
          {details}
        </Drawer>
        {content}
        <Toolbar>
          <div>
            <Tooltip title="Toggle Details: `" placement="top-end">
              <IconButton onClick={this.toggleDetails.bind(this)}>
                <ListIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Toggle View Mode: tab" placement="top">
              <IconButton onClick={this.advanceView.bind(this)}>
                <DashboardIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Previous: ," placement="top">
              <IconButton onClick={this.advanceFrame.bind(this, -1)}>
                <SkipPreviousIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Pause / Play: space" placement="top">
              <IconButton onClick={this.playPause.bind(this)}>
                {!this.state.playInterval ? <PlayArrowIcon /> : <StopIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Next: ." placement="top">
              <IconButton onClick={this.advanceFrame.bind(this, 1)}>
                <SkipNextIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Decode 30 Additional Frames" placement="top">
              <IconButton onClick={this.alertDecodeAdditionalFrames.bind(this, 30)}>
                <Replay30Icon />
              </IconButton>
            </Tooltip>
            <span className="splitTextContent" style={{ width: '256px' }}>
              Frame: {this.state.activeFrame + 1} of {this.props.groups[0].length}
            </span>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={this.state.lockScroll}
                    onChange={(event) => this.setState({ lockScroll: event.target.checked })}
                  />
                }
                label="Lock Scroll"
              />
            </FormGroup>
          </div>
        </Toolbar>
      </div>
    );
  }
}
