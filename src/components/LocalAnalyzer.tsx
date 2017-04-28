import * as React from "react";
import { localFiles, localFileProtocol } from "./analyzerTools";
import { LoaderComponent } from "./Loader"
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';

import CircularProgress from 'material-ui/CircularProgress';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';
import SelectField from 'material-ui/SelectField';
import Paper from 'material-ui/Paper';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import {grey900, grey800, grey100, grey200} from 'material-ui/styles/colors';
import Checkbox from 'material-ui/Checkbox';
import Toggle from 'material-ui/Toggle';
import TextField from 'material-ui/TextField';
declare var require;
declare var shortenUrl;
var Select = require('react-select');


export interface Option {
  label: string;
  value: string;
  disabled?: boolean;
}

export function daysSince(date: Date) {
  var oneSecond = 1000;
  var oneMinute = 60 * oneSecond;
  var oneHour = 60 * oneMinute;
  var oneDay = 24 * oneHour;
  let diff = new Date().getTime() - date.getTime();
  return Math.round(Math.abs(diff / oneDay));
}

export function secondsSince(date: Date) {
  var oneSecond = 1000;
  let diff = new Date().getTime() - date.getTime();
  return Math.round(Math.abs(diff / oneSecond));
}

export function minutesSince(date: Date) {
  var oneSecond = 1000;
  var oneMinute = 60 * oneSecond;
  let diff = new Date().getTime() - date.getTime();
  return Math.round(Math.abs(diff / oneMinute));
}

export function timeSince(date: Date) {
  var oneSecond = 1000;
  var oneMinute = 60 * oneSecond;
  var oneHour = 60 * oneMinute;
  var oneDay = 24 * oneHour;
  let diff = new Date().getTime() - date.getTime();
  var days = Math.round(Math.abs(diff / oneDay));
  var hours = Math.round(Math.abs(diff % oneDay) / oneHour);
  var minutes = Math.round(Math.abs(diff % oneHour) / oneMinute);
  let s = [];
  if (days > 0) {
    s.push(`${days} day${days === 1 ? "" : "s"}`);
  }
  if (hours > 0) {
    s.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  if (minutes > 0) {
    s.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
  return s.join(", ") + " ago";
}

function unique<T>(array: Array<T>): Array<T> {
  let result = [];
  for (let i = 0; i < array.length; i++) {
    if (result.indexOf(array[i]) < 0) {
      result.push(array[i]);
    }
  }
  return result;
}

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let masterUrl = "https://arewecompressedyet.com" + '/';

let tasks = {
  "objective-1-fast": [
    "aspen_1080p_60f.y4m",
    "blue_sky_360p_60f.y4m",
    "dark70p_60f.y4m",
    "DOTA2_60f_420.y4m",
    "ducks_take_off_1080p50_60f.y4m",
    "gipsrestat720p_60f.y4m",
    "kirland360p_60f.y4m",
    "KristenAndSara_1280x720_60f.y4m",
    "life_1080p30_60f.y4m",
    "MINECRAFT_60f_420.y4m",
    "Netflix_Aerial_1920x1080_60fps_8bit_420_60f.y4m",
    "Netflix_Boat_1920x1080_60fps_8bit_420_60f.y4m",
    "Netflix_Crosswalk_1920x1080_60fps_8bit_420_60f.y4m",
    "Netflix_DrivingPOV_1280x720_60fps_8bit_420_60f.y4m",
    "Netflix_FoodMarket_1920x1080_60fps_8bit_420_60f.y4m",
    "Netflix_PierSeaside_1920x1080_60fps_8bit_420_60f.y4m",
    "Netflix_RollerCoaster_1280x720_60fps_8bit_420_60f.y4m",
    "Netflix_SquareAndTimelapse_1920x1080_60fps_8bit_420_60f.y4m",
    "Netflix_TunnelFlag_1920x1080_60fps_8bit_420_60f.y4m",
    "niklas360p_60f.y4m",
    "red_kayak_360p_60f.y4m",
    "rush_hour_1080p25_60f.y4m",
    "shields_640x360_60f.y4m",
    "speed_bag_640x360_60f.y4m",
    "STARCRAFT_60f_420.y4m",
    "thaloundeskmtg360p_60f.y4m",
    "touchdown_pass_1080p_60f.y4m",
    "vidyo1_720p_60fps_60f.y4m",
    "vidyo4_720p_60fps_60f.y4m",
    "wikipedia_420.y4m"
  ]
}
export class RunDetails extends React.Component<{
  json: any;
}, {

  }> {
  render() {
    let json = this.props.json;
    let info = json.info;
    return <div className="runDetail">
      <div>Commit: {info.commit}</div>
      <div>Nick: {info.nick}</div>
      <div>Task: {info.task}</div>
      <div>Build Options: {info.build_options}</div>
      <div>Extra Options: {info.extra_options}</div>
      <div>Date: {new Date(json.date).toString()}: ({timeSince(new Date(json.date))})</div>
    </div>
  }
}

export class LocalAnalyzerComponent extends React.Component<{

}, {
    listJson: any;
    slots: { runId: string, video: string, quality: number }[];
    pairs: any;
    vote: string;
    votingEnabled: boolean;
    filtersEnabled: boolean;
    showVoteResult: boolean;
    blind: boolean;
    voteMessage: string;
    shortURL: string;
    taskFilter: string;
    nickFilter: string;
    configFilter: Option [];
    commandLineFilter: Option [];
  }> {
  constructor() {
    super();
    this.state = {
      listJson: null,
      slots: [{ runId: "", video: "", quality: 0 }],
      vote: "",
      votingEnabled: false,
      showVoteResult: false,
      blind: true,
      voteMessage: "",
      shortURL: "",
      taskFilter: undefined,
      nickFilter: undefined,
      configFilter: [],
      commandLineFilter: []
    } as any;
  }
  loadXHR<T>(path: string, type = "json"): Promise<T> {
    return new Promise((resolve, reject) => {
      let xhr = new XMLHttpRequest();
      let self = this;
      xhr.open("GET", path, true);
      xhr.responseType = "text";
      xhr.send();
      xhr.addEventListener("load", function () {
        if (xhr.status != 200) {
          console.error("Failed to load XHR: " + path);
          reject();
          return;
        }
        console.info("Loaded XHR: " + path);
        let response = this.responseText;
        if (type === "json") {
          response = response.replace(/NaN/g, "null");
          try {
            response = response ? JSON.parse(response) : null;
          } catch (x) {
            reject();
          }
        }
        resolve(response);
      });
    });
  }
  componentDidMount() {
    // let listJson = [
    //   {run_id: "ABC", info: { task: "objective-1-fast", nick: "mbx", build_options: "--enable-xyz --enable-aaa", extra_options: "--enable-xyz --enable-aaa" }},
    //   {run_id: "DEF", info: { task: "objective-2-fast", nick: "jmx", build_options: "--enable-aaa", extra_options: "--enable-xyz --enable-aaa" }},
    //   {run_id: "GHI", info: { task: "objective-3-fast", nick: "derf", build_options: "--enable-xyz", extra_options: "--enable-xyz --enable-aaa" }},
    //   {run_id: "JKL", info: { task: "objective-1-fast", nick: "jmx", build_options: "--enable-bbb", extra_options: "--enable-xyz --enable-aaa" }}
    // ];
    // this.setState({ listJson } as any);
    // return;

    this.loadXHR(masterUrl + "list.json").then((listJson: any) => {
      listJson.sort(function (a, b) {
        return (new Date(b.date) as any) - (new Date(a.date) as any);
      });
      listJson = listJson.filter(job => {
        return job.status === "completed";
      });
      listJson = listJson.slice(0, 1000);

      // Say no to long names.
      listJson = listJson.filter(job => {
        return job.run_id.length < 64;
      });
      this.setState({ listJson } as any);
    });
  }
  handleAction(value) {

  }
  resetURL() {
    this.setState({shortURL: ""} as any);
  }
  onChangeTaskFilter(option) {
    let taskFilter = option ? option.value : undefined;
    this.setState({ taskFilter } as any);
  }
  onChangeNickFilter(option) {
    let nickFilter = option ? option.value : undefined;
    this.setState({ nickFilter } as any);
  }
  onChangeConfigFilter(option) {
    let configFilter = option || [];
    this.setState({ configFilter } as any);
  }
  onChangeCommandLineFilter(option) {
    let commandLineFilter = option || [];
    this.setState({ commandLineFilter } as any);
  }
  onChangeRun(slot, option) {
    let slots = this.state.slots;
    slots[slot].runId = option ? option.value : undefined;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onChangeVideo(slot, option) {
    let slots = this.state.slots;
    slots[slot].video = option ? option.value : undefined;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onChangeQuality(slot, option) {
    let slots = this.state.slots;
    slots[slot].quality = option ? option.value : undefined;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onChangeVote(option, value: string) {
    this.setState({vote: value} as any);
    this.resetURL();
  }
  onDeleteRun(slot) {
    let slots = this.state.slots;
    slots.splice(slot, 1);
    this.setState({ slots } as any);
    this.resetURL();
  }
  onDuplicateRun(slot) {
    let slots = this.state.slots;
    let oldSlot = slots[slot];
    let newSlot = { runId: oldSlot.runId, video: oldSlot.video, quality: oldSlot.quality };
    slots.splice(slot, 0, newSlot);
    this.setState({ slots } as any);
    this.resetURL();
  }
  onMoveRun(slot, offset) {
    if (slot + offset < 0) return;
    let slots = this.state.slots;
    if (slot + offset >= slots.length) return;
    let tmp = slots[slot + offset];
    slots[slot + offset] = slots[slot];
    slots[slot] = tmp;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onAddRun() {
    let slots = this.state.slots;
    slots.push({ runId: "", video: "", quality: 0 });
    this.setState({ slots } as any);
    this.resetURL();
  }
  onVoteMessageChange(event, value: string) {
    this.setState({voteMessage: value} as any);
    this.resetURL();
  }
  makePairs(): any {
    return this.state.slots.map(slot => {
      let run = this.getRunById(slot.runId);
      let videoUrl = masterUrl + `runs/${run.run_id}/${run.info.task}/${slot.video}-${slot.quality}.ivf`;
      let decoderUrl = masterUrl + `runs/${run.run_id}/js/decoder.js`;
      return {decoderUrl, videoUrl};
    });
  }
  onSend() {
    window.open(this.createURL(), "_blank");
  }
  getRunById(runId) {
    return this.state.listJson.find(run => run.run_id === runId);
  }
  getOptionsForTask(task: string) {
    let array = tasks[task];
    if (!array) {
      return [];
    }
    return array.map(video => { return { value: video, label: video }; })
  }
  getOptionsForQuality(quality: string) {
    let array = [20, 32, 43, 55, 63];
    if (quality) {
      array = quality.split(" ").map(q => parseInt(q));
    }
    return array.map(q => { return { value: q, label: q }; })
  }
  cannotAnalyze() {
    let slots = this.state.slots;
    if (slots.length == 0) {
      return true;
    }
    for (let i = 0; i < slots.length; i++) {
      let slot = slots[i];
      if (!slot.quality || !slot.runId || !slot.video) {
        return true;
      }
    }
    return false;
  }
  createURL() {
    try {
      let pairs = this.makePairs();
      let url = window.location.href + "?";
      let vote = this.state.vote;
      if (vote) {
        vote = this.state.vote.split(",").map(x => x.split(":").map((y: any) => y|0).join(":")).join(",");
        url += `vote=${vote}&`;
      }
      if (this.state.voteMessage) {
        url += `voteDescription=${this.state.voteMessage}&`;
      }
      if (this.state.showVoteResult) {
        url += `showVoteResult=${1}&`;
      }
      if (this.state.vote && this.state.blind) {
        url += `blind=${1}&`;
      }
      if (!this.state.vote) {
        url += `maxFrames=${4}&`;
      }
      return url + pairs.map(pair => `decoder=${pair.decoderUrl}&file=${pair.videoUrl}`).join("&");
    } catch(e) {
      return "";
    }
  }
  onShortenURL() {
    shortenUrl(this.createURL(), (shortURL) => {
      this.setState({shortURL} as any);
    });
  }
  getVoteErrorText() {
    if (!this.state.vote) {
      return "Required";
    }
    let vote = [];
    try {
      vote = this.state.vote.split(",").map(x => {
        return x.split(":").map((y: any) => {
          if (y != (y|0)) {
            throw `Cannot parse ${y}.`;
          }
          return parseInt(y)
        });
      });
    } catch (e) {
      return `Syntax Error: ${e}`;
    }
    for (let i = 0; i < vote.length; i++) {
      for (let j = 0; j < vote[i].length; j++) {
        let run = vote[i][j];
        if (!this.state.slots[run]) {
          return `Run ${run} is missing.`;
        }
      }
    }
    return undefined;
  }
  render() {
    function logChange(val) {
      console.log("Selected: " + val);
    }
    let listJson = this.state.listJson;
    if (!listJson) {
      return <Dialog title="Downloading AWCY Runs" modal={true} open={true}>
        <CircularProgress size={40} thickness={7} />
      </Dialog>;
    } else {
      let filtersEnabled = this.state.filtersEnabled;
      let runOptions = listJson.filter(run => {
        if (!this.state.filtersEnabled) {
          return true;
        }
        let pass = true;
        if (pass && this.state.taskFilter && run.info.task !== this.state.taskFilter) {
          pass = false;
        }
        if (pass && this.state.nickFilter && run.info.nick !== this.state.nickFilter) {
          pass = false;
        }
        if (pass && this.state.configFilter.length) {
          let buildOptions = run.info.build_options.split(" ").filter(x => !!x);
          pass = this.state.configFilter.every(option => {
            return buildOptions.indexOf(option.value) >= 0;
          });
        }
        if (pass && this.state.commandLineFilter.length) {
          let commandLineOptions = run.info.extra_options.split(" ").filter(x => !!x);
          pass = this.state.commandLineFilter.every(option => {
            return commandLineOptions.indexOf(option.value) >= 0;
          });
        }
        return pass;
      }).map(run => {
        return { value: run.run_id, label: run.run_id }
      });

      let taskFilterOptions = !filtersEnabled ? [] : unique(listJson.map(run => run.info.task)).map(task => {
        return { value: task, label: task }
      });

      let nickFilterOptions = !filtersEnabled ? [] : unique(listJson.map(run => run.info.nick)).map(nick => {
        return { value: nick, label: nick }
      });

      let configFilterOptions = !filtersEnabled ? [] : unique(listJson.map(run => run.info.build_options.split(" ").filter(x => !!x)).reduce((a, b) => a.concat(b))).map(option => {
        return {value: option, label: option}
      });

      let commandLineFilterOptions = !filtersEnabled ? [] : unique(listJson.map(run => run.info.extra_options.split(" ").filter(x => !!x)).reduce((a, b) => a.concat(b))).map(option => {
        return {value: option, label: option}
      });

      return <div>
        <div className="builderSection">
          <div>
            <Toggle
              style={{width: "300px"}}
              label="Filter Runs"
              labelPosition="right"
              toggled={this.state.filtersEnabled}
              onToggle={(event, value) => {
                this.setState({ filtersEnabled: value } as any);
                this.resetURL();
              }}
            />
          </div>
        </div>
        { this.state.filtersEnabled &&
          <div>
            <div className="builderContainer">
              <div style={{width: "200px"}}>
                <Select
                  placeholder="Task Filter"
                  value={this.state.taskFilter}
                  options={taskFilterOptions}
                  onChange={this.onChangeTaskFilter.bind(this)}
                />
              </div>
              <div style={{width: "200px"}}>
                <Select
                  placeholder="Nick Filter"
                  value={this.state.nickFilter}
                  options={nickFilterOptions}
                  onChange={this.onChangeNickFilter.bind(this)}
                />
              </div>
            </div>
            <div className="builderContainer">
              <div style={{width: "50%"}}>
                <Select multi
                  placeholder="Config Filter"
                  value={this.state.configFilter}
                  options={configFilterOptions}
                  onChange={this.onChangeConfigFilter.bind(this)}
                />
              </div>
              <div style={{width: "50%"}}>
                <Select multi
                  placeholder="Command Line Filter"
                  value={this.state.commandLineFilter}
                  options={commandLineFilterOptions}
                  onChange={this.onChangeCommandLineFilter.bind(this)}
                />
              </div>
            </div>
          </div>
        }
        <div className="builderSection">
          Runs ({runOptions.length})
        </div>
        {this.state.slots.map((_, i) => {
          let slot = this.state.slots[i];
          let run = this.getRunById(slot.runId);

          return <div key={i} className="builderVideoContainer">
            <div className="builderContainer">
              <div style={{width: "32px"}} className="videoSelectionLabel">
                {i}
              </div>
              <div style={{width: "400px"}}>
                <Select
                  placeholder="Run"
                  value={slot.runId}
                  options={runOptions}
                  onChange={this.onChangeRun.bind(this, i)}
                />
              </div>
              <div style={{width: "200px"}}>
                <Select
                disabled={!run}
                  placeholder="Video"
                  value={slot.video}
                  options={run ? this.getOptionsForTask(run.info.task) : []}
                  onChange={this.onChangeVideo.bind(this, i)}
                />
              </div>
              <div style={{width: "80px"}}>
                <Select
                  disabled={!run}
                  placeholder="QP"
                  value={slot.quality}
                  options={run ? this.getOptionsForQuality(run.info.quality) : []}
                  onChange={this.onChangeQuality.bind(this, i)}
                />
              </div>
              <div>
                <RaisedButton
                  label="Remove"
                  disableTouchRipple={true}
                  disableFocusRipple={true}
                  onTouchTap={this.onDeleteRun.bind(this, i)}
                  style={{marginRight: 8}}
                />
                <RaisedButton
                  label="Duplicate"
                  disableTouchRipple={true}
                  disableFocusRipple={true}
                  onTouchTap={this.onDuplicateRun.bind(this, i)}
                  style={{marginRight: 8}}
                />
                <RaisedButton
                  label="Up"
                  disabled={i - 1 < 0}
                  disableTouchRipple={true}
                  disableFocusRipple={true}
                  onTouchTap={this.onMoveRun.bind(this, i, -1)}
                  style={{marginRight: 8}}
                />
                <RaisedButton
                  label="Down"
                  disabled={i + 1 >= this.state.slots.length}
                  disableTouchRipple={true}
                  disableFocusRipple={true}
                  onTouchTap={this.onMoveRun.bind(this, i, 1)}
                />
              </div>
            </div>
            <div className="builderContainer" style={{paddingLeft: "40px"}}>
              {run && <RunDetails json={run} />}
            </div>
          </div>
        })
        }
        <div className="builderSection">
          <div>
            <Toggle
              style={{width: "300px"}}
              label="Enable Voting"
              labelPosition="right"
              toggled={this.state.votingEnabled}
              onToggle={(event, value) => {
                this.setState({ votingEnabled: value } as any);
                this.resetURL();
              }}
            />
          </div>
        </div>
        {this.state.votingEnabled &&
          <div>
            <div className="builderContainer">
              <div style={{width: "1000px"}}>
                <TextField errorText={this.getVoteErrorText()} multiLine={false} floatingLabelText="Vote Configuration: 0:1,2:3:4, ..." floatingLabelFixed={true} name="message" value={this.state.vote} style={{width: "1000px"}} onChange={this.onChangeVote.bind(this)}/>
              </div>
            </div>
            <div className="builderContainer">
              <div>
              <Checkbox
                style={{width: "300px"}}
                label="Show Vote Results"
                checked={this.state.showVoteResult}
                onCheck={(event, value) => {
                  this.setState({ showVoteResult: value } as any);
                  this.resetURL();
                }}
              />
              </div>
              <div className="builderCaption">
                Show vote results at the end of the voting session.
              </div>
            </div>
            <div className="builderContainer">
              <div>
              <Checkbox
                style={{width: "300px"}}
                label="Blind"
                checked={this.state.blind}
                onCheck={(event, value) => {
                  this.setState({ blind: value } as any);
                  this.resetURL();
                }}
              />
              </div>
              <div className="builderCaption">
                Randomize runs when comparing them.
              </div>
            </div>
            <div className="builderContainer">
              <TextField multiLine={false} floatingLabelText="Vote Intro Message" floatingLabelFixed={true} name="message" value={this.state.voteMessage} style={{width: "1000px"}} onChange={this.onVoteMessageChange.bind(this)}/>
            </div>
          </div>
        }
        <div className="builderContainer">
          <div>
            <RaisedButton
              label="Add Run"
              disableTouchRipple={true}
              disableFocusRipple={true}
              onTouchTap={this.onAddRun.bind(this)}
              style={{marginRight: 8}}
            />
            <RaisedButton
              label="Shorten URL"
              disableTouchRipple={true}
              disableFocusRipple={true}
              onTouchTap={this.onShortenURL.bind(this)}
              style={{marginRight: 8}}
            />
            <RaisedButton
              label="Open"
              disabled={this.cannotAnalyze()}
              disableTouchRipple={true}
              disableFocusRipple={true}
              onTouchTap={this.onSend.bind(this)}
            />
          </div>
        </div>
        <div className="builderSection">
          Analyzer Link
        </div>
        <div className="builderContainer">
          <div className="builderURL">
            {this.state.shortURL || this.createURL()}
          </div>
        </div>
      </div>
    }
  }
}
