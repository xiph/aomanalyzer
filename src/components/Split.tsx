import * as React from 'react';

import { AnalyzerFrame } from './analyzerTools';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import Checkbox from 'material-ui/Checkbox';
import Drawer from 'material-ui/Drawer';
import SelectField from 'material-ui/SelectField';
import Paper from 'material-ui/Paper';
import { grey900, grey800, grey100, grey200 } from 'material-ui/styles/colors';
import { unreachable } from './analyzerTools';
import Dialog from 'material-ui/Dialog';

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
    super();
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
      return <Dialog open>Provide at least two videos to compare.</Dialog>;
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

    const iconStyles = {
      marginRight: 24,
    };
    let details = null;

    const paperStyle = {
      padding: 10,
      marginTop: 10,
      marginBottom: 10,
      backgroundColor: grey900,
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
          docked={false}
          width={512}
          open={this.state.showDetails}
          onRequestChange={(showDetails) => this.setState({ showDetails } as any)}
        >
          {details}
        </Drawer>
        {content}
        <Toolbar>
          <ToolbarGroup firstChild={true}>
            <IconButton onClick={this.toggleDetails.bind(this)} tooltip="Toggle Details: `" tooltipPosition="top-right">
              <FontIcon className="material-icons md-24" style={iconStyles}>
                list
              </FontIcon>
            </IconButton>
            <IconButton
              onClick={this.advanceView.bind(this)}
              tooltip="Toggle View Mode: tab"
              tooltipPosition="top-center"
            >
              <FontIcon className="material-icons md-24" style={iconStyles}>
                dashboard
              </FontIcon>
            </IconButton>
            <IconButton onClick={this.advanceFrame.bind(this, -1)} tooltip="Previous: ," tooltipPosition="top-center">
              <FontIcon className="material-icons md-24" style={iconStyles}>
                skip_previous
              </FontIcon>
            </IconButton>
            <IconButton onClick={this.playPause.bind(this)} tooltip="Pause / Play: space" tooltipPosition="top-center">
              <FontIcon className="material-icons md-24" style={iconStyles}>
                {!this.state.playInterval ? 'play_arrow' : 'stop'}
              </FontIcon>
            </IconButton>
            <IconButton onClick={this.advanceFrame.bind(this, 1)} tooltip="Next: ." tooltipPosition="top-center">
              <FontIcon className="material-icons md-24" style={iconStyles}>
                skip_next
              </FontIcon>
            </IconButton>
            <IconButton
              onClick={this.alertDecodeAdditionalFrames.bind(this, 30)}
              tooltip="Decode 30 Additional Frames"
              tooltipPosition="top-center"
            >
              <FontIcon className="material-icons md-24" style={iconStyles}>
                replay_30
              </FontIcon>
            </IconButton>
            <span className="splitTextContent" style={{ width: '256px' }}>
              Frame: {this.state.activeFrame + 1} of {this.props.groups[0].length}
            </span>
            <Checkbox
              label="Lock Scroll"
              checked={this.state.lockScroll}
              onCheck={(event, value) => this.setState({ lockScroll: value } as any)}
            />
          </ToolbarGroup>
        </Toolbar>
      </div>
    );
  }
}
