import * as React from 'react';
import { localFiles, localFileProtocol } from './analyzerTools';
import { LoaderComponent } from './Loader';
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
import { grey900, grey800, grey100, grey200 } from 'material-ui/styles/colors';
import Checkbox from 'material-ui/Checkbox';
import Toggle from 'material-ui/Toggle';
import TextField from 'material-ui/TextField';
import Select from 'react-select';
declare let require;
declare let shortenUrl;

export interface Option {
  label: string;
  value: string;
  disabled?: boolean;
}

export function daysSince(date: Date) {
  const oneSecond = 1000;
  const oneMinute = 60 * oneSecond;
  const oneHour = 60 * oneMinute;
  const oneDay = 24 * oneHour;
  const diff = new Date().getTime() - date.getTime();
  return Math.round(Math.abs(diff / oneDay));
}

export function secondsSince(date: Date) {
  const oneSecond = 1000;
  const diff = new Date().getTime() - date.getTime();
  return Math.round(Math.abs(diff / oneSecond));
}

export function minutesSince(date: Date) {
  const oneSecond = 1000;
  const oneMinute = 60 * oneSecond;
  const diff = new Date().getTime() - date.getTime();
  return Math.round(Math.abs(diff / oneMinute));
}

export function timeSince(date: Date) {
  const oneSecond = 1000;
  const oneMinute = 60 * oneSecond;
  const oneHour = 60 * oneMinute;
  const oneDay = 24 * oneHour;
  const diff = new Date().getTime() - date.getTime();
  const days = Math.round(Math.abs(diff / oneDay));
  const hours = Math.round(Math.abs(diff % oneDay) / oneHour);
  const minutes = Math.round(Math.abs(diff % oneHour) / oneMinute);
  const s = [];
  if (days > 0) {
    s.push(`${days} day${days === 1 ? '' : 's'}`);
  }
  if (hours > 0) {
    s.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  }
  if (minutes > 0) {
    s.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }
  return s.join(', ') + ' ago';
}

function unique<T>(array: Array<T>): Array<T> {
  const result = [];
  for (let i = 0; i < array.length; i++) {
    if (result.indexOf(array[i]) < 0) {
      result.push(array[i]);
    }
  }
  return result;
}

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
declare let process;
let masterUrl = window.location.origin + '/';
if (window.location.origin.startsWith('file://') || window.location.origin.startsWith('http://localhost')) {
  masterUrl = 'https://arewecompressedyet.com/';
}

export class RunDetails extends React.Component<
  {
    json: any;
  },
  {}
> {
  render() {
    const json = this.props.json;
    const info = json.info;
    return (
      <div className="runDetail">
        <div>Commit: {info.commit}</div>
        <div>Nick: {info.nick}</div>
        <div>Task: {info.task}</div>
        <div>Build Options: {info.build_options}</div>
        <div>Extra Options: {info.extra_options}</div>
        <div>
          Date: {new Date(json.date).toString()}: ({timeSince(new Date(json.date))})
        </div>
      </div>
    );
  }
}

export class LocalAnalyzerComponent extends React.Component<
  {},
  {
    listJson: any;
    setsJson: any;
    slots: { runId: string; video: string; quality: number }[];
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
    configFilter: Option[];
    statusFilter: Option[];
    commandLineFilter: Option[];
  }
> {
  constructor() {
    super();
    this.state = {
      listJson: null,
      setsJson: null,
      slots: [{ runId: '', video: '', quality: 0 }],
      vote: '',
      votingEnabled: false,
      showVoteResult: false,
      blind: true,
      voteMessage: '',
      shortURL: '',
      taskFilter: undefined,
      nickFilter: undefined,
      configFilter: [],
      statusFilter: [
        {
          label: 'completed',
          value: 'completed',
        },
      ],
      commandLineFilter: [],
      filtersEnabled: true,
    } as any;
  }
  loadXHR<T>(path: string, type = 'json'): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const self = this;
      xhr.open('GET', path, true);
      xhr.responseType = 'text';
      xhr.send();
      xhr.addEventListener('load', function () {
        if (xhr.status != 200) {
          console.error('Failed to load XHR: ' + path);
          reject();
          return;
        }
        console.info('Loaded XHR: ' + path);
        let response = this.responseText;
        if (type === 'json') {
          response = response.replace(/NaN/g, 'null');
          try {
            response = response ? JSON.parse(response) : null;
          } catch (x) {
            reject();
          }
        }
        resolve(response as any);
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

    this.loadXHR(masterUrl + 'list.json').then((listJson: any) => {
      listJson.sort(function (a, b) {
        return (new Date(b.date) as any) - (new Date(a.date) as any);
      });
      // Don't filter completed jobs.
      // listJson = listJson.filter(job => {
      //   return job.status === "completed";
      // });
      listJson = listJson.slice(0, 5000);

      // Say no to long names.
      listJson = listJson.filter((job) => {
        return job.run_id.length < 128;
      });
      this.setState({ listJson } as any);
    });

    this.loadXHR(masterUrl + 'sets.json').then((setsJson: any) => {
      this.setState({ setsJson } as any);
    });
  }
  handleAction(value) {
    /* tslint:disable:no-empty */
  }
  resetURL() {
    this.setState({ shortURL: '' } as any);
  }
  onChangeTaskFilter(option) {
    const taskFilter = option ? option.value : undefined;
    this.setState({ taskFilter } as any);
  }
  onChangeNickFilter(option) {
    const nickFilter = option ? option.value : undefined;
    this.setState({ nickFilter } as any);
  }
  onChangeConfigFilter(option) {
    const configFilter = option || [];
    this.setState({ configFilter } as any);
  }
  onChangeStatusFilter(option) {
    const statusFilter = option || [];
    this.setState({ statusFilter } as any);
  }
  onChangeCommandLineFilter(option) {
    const commandLineFilter = option || [];
    this.setState({ commandLineFilter } as any);
  }
  onChangeRun(slot, option) {
    const slots = this.state.slots;
    slots[slot].runId = option ? option.value : undefined;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onChangeVideo(slot, option) {
    const slots = this.state.slots;
    slots[slot].video = option ? option.value : undefined;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onChangeQuality(slot, option) {
    const slots = this.state.slots;
    slots[slot].quality = option ? option.value : undefined;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onChangeVote(option, value: string) {
    this.setState({ vote: value } as any);
    this.resetURL();
  }
  onDeleteRun(slot) {
    const slots = this.state.slots;
    slots.splice(slot, 1);
    this.setState({ slots } as any);
    this.resetURL();
  }
  onDuplicateRun(slot) {
    const slots = this.state.slots;
    const oldSlot = slots[slot];
    const newSlot = { runId: oldSlot.runId, video: oldSlot.video, quality: oldSlot.quality };
    slots.splice(slot, 0, newSlot);
    this.setState({ slots } as any);
    this.resetURL();
  }
  onMoveRun(slot, offset) {
    if (slot + offset < 0) return;
    const slots = this.state.slots;
    if (slot + offset >= slots.length) return;
    const tmp = slots[slot + offset];
    slots[slot + offset] = slots[slot];
    slots[slot] = tmp;
    this.setState({ slots } as any);
    this.resetURL();
  }
  onAddRun() {
    const slots = this.state.slots;
    slots.push({ runId: '', video: '', quality: 0 });
    this.setState({ slots } as any);
    this.resetURL();
  }
  onVoteMessageChange(event, value: string) {
    this.setState({ voteMessage: value } as any);
    this.resetURL();
  }
  makePairs(): any {
    return this.state.slots.map((slot) => {
      const run = this.getRunById(slot.runId);
      const videoUrl = masterUrl + `runs/${run.run_id}/${run.info.task}/${slot.video}-${slot.quality}.ivf`;
      const decoderUrl = masterUrl + `runs/${run.run_id}/js/decoder.js`;
      return { decoderUrl, videoUrl };
    });
  }
  findLongestPrefix(pairs: { decoderUrl: string; videoUrl: string }[]): string {
    const list = [];
    pairs.forEach((pair) => {
      list.push(pair.decoderUrl);
      list.push(pair.videoUrl);
    });
    if (list.length == 0) {
      return '';
    }
    const first = list[0];
    let prefix = '';
    // Find longest prefix.
    for (let i = 0; i < first.length; i++) {
      const tmp = first.slice(0, i);
      const isCommon = list.every((s) => s.indexOf(tmp) == 0);
      if (!isCommon) {
        break;
      }
      prefix = tmp;
    }
    // Remove prefix.
    pairs.forEach((pair) => {
      pair.decoderUrl = pair.decoderUrl.slice(prefix.length);
      pair.videoUrl = pair.videoUrl.slice(prefix.length);
    });

    return prefix;
  }
  onSend() {
    window.open(this.createURL(), '_blank');
  }
  getRunById(runId) {
    return this.state.listJson.find((run) => run.run_id === runId);
  }
  getOptionsForTask(task: string) {
    if (!this.state.setsJson || !(task in this.state.setsJson)) {
      return [];
    }
    const array = this.state.setsJson[task].sources;
    if (!array) {
      return [];
    }
    return array.map((video) => {
      return { value: video, label: video };
    });
  }
  getOptionsForQuality(quality: string) {
    let array = [20, 32, 43, 55, 63];
    if (quality) {
      array = quality.split(' ').map((q) => parseInt(q));
    }
    return array.map((q) => {
      return { value: q, label: q };
    });
  }
  cannotAnalyze() {
    const slots = this.state.slots;
    if (slots.length == 0) {
      return true;
    }
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.quality || !slot.runId || !slot.video) {
        return true;
      }
    }
    return false;
  }
  createURL() {
    try {
      const pairs = this.makePairs();
      const prefix = this.findLongestPrefix(pairs);
      let url = window.location.origin + window.location.pathname + '?';
      if (this.state.votingEnabled) {
        let vote = this.state.vote;
        if (vote) {
          vote = this.state.vote
            .split(',')
            .map((x) =>
              x
                .split(':')
                .map((y: any) => y | 0)
                .join(':'),
            )
            .join(',');
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
      }
      if (!this.state.vote) {
        url += `maxFrames=${4}&`;
      }
      if (prefix) {
        url += `p=${prefix}&`;
      }
      return url + pairs.map((pair) => `d=${pair.decoderUrl}&f=${pair.videoUrl}`).join('&');
    } catch (e) {
      return '';
    }
  }
  onShortenURL() {
    shortenUrl(this.createURL(), (shortURL) => {
      this.setState({ shortURL } as any);
    });
  }
  getVoteErrorText() {
    if (!this.state.vote) {
      return 'Required';
    }
    let vote = [];
    try {
      vote = this.state.vote.split(',').map((x) => {
        return x.split(':').map((y: any) => {
          if (y != (y | 0)) {
            throw `Cannot parse ${y}.`;
          }
          return parseInt(y);
        });
      });
    } catch (e) {
      return `Syntax Error: ${e}`;
    }
    for (let i = 0; i < vote.length; i++) {
      for (let j = 0; j < vote[i].length; j++) {
        const run = vote[i][j];
        if (!this.state.slots[run]) {
          return `Run ${run} is missing.`;
        }
      }
    }
    return undefined;
  }
  render() {
    function logChange(val) {
      console.log('Selected: ' + val);
    }
    const listJson = this.state.listJson;
    if (!listJson) {
      return (
        <Dialog title="Downloading AWCY Runs" modal={true} open={true}>
          <CircularProgress size={40} thickness={7} />
        </Dialog>
      );
    } else {
      const filtersEnabled = this.state.filtersEnabled;
      const runOptions = listJson
        .filter((run) => {
          if (!this.state.filtersEnabled) {
            return true;
          }
          let pass = true;
          if (pass && this.state.statusFilter.length) {
            // Unlike other filters, this is an OR filter.
            pass = this.state.statusFilter.some((option) => {
              return run.status == option.value;
            });
          }
          if (pass && this.state.taskFilter && run.info.task !== this.state.taskFilter) {
            pass = false;
          }
          if (pass && this.state.nickFilter && run.info.nick !== this.state.nickFilter) {
            pass = false;
          }
          if (pass && this.state.configFilter.length) {
            const buildOptions = run.info.build_options.split(' ').filter((x) => !!x);
            pass = this.state.configFilter.every((option) => {
              return buildOptions.indexOf(option.value) >= 0;
            });
          }
          if (pass && this.state.commandLineFilter.length) {
            const commandLineOptions = run.info.extra_options.split(' ').filter((x) => !!x);
            pass = this.state.commandLineFilter.every((option) => {
              return commandLineOptions.indexOf(option.value) >= 0;
            });
          }
          return pass;
        })
        .map((run) => {
          return { value: run.run_id, label: run.run_id };
        })
        .slice(0, 1000);

      const taskFilterOptions = !filtersEnabled
        ? []
        : unique(listJson.map((run) => run.info.task)).map((task) => {
            return { value: task, label: task };
          });

      const nickFilterOptions = !filtersEnabled
        ? []
        : unique(listJson.map((run) => run.info.nick)).map((nick) => {
            return { value: nick, label: nick };
          });

      const configFilterOptions = !filtersEnabled
        ? []
        : unique(
            listJson.map((run) => run.info.build_options.split(' ').filter((x) => !!x)).reduce((a, b) => a.concat(b)),
          ).map((option) => {
            return { value: option, label: option };
          });

      const commandLineFilterOptions = !filtersEnabled
        ? []
        : unique(
            listJson.map((run) => run.info.extra_options.split(' ').filter((x) => !!x)).reduce((a, b) => a.concat(b)),
          ).map((option) => {
            return { value: option, label: option };
          });

      const statusFilterOptions = !filtersEnabled
        ? []
        : unique(listJson.map((run) => run.status)).map((status) => {
            return { value: status, label: status };
          });

      return (
        <div>
          <div className="builderSection">
            <div>
              <Toggle
                style={{ width: '300px' }}
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
          {this.state.filtersEnabled && (
            <div>
              <div className="builderContainer">
                <div style={{ width: '200px' }}>
                  <Select
                    placeholder="Task Filter"
                    value={this.state.taskFilter}
                    options={taskFilterOptions}
                    onChange={this.onChangeTaskFilter.bind(this)}
                  />
                </div>
                <div style={{ width: '200px' }}>
                  <Select
                    placeholder="Nick Filter"
                    value={this.state.nickFilter}
                    options={nickFilterOptions}
                    onChange={this.onChangeNickFilter.bind(this)}
                  />
                </div>
                <div style={{ width: '300px' }}>
                  <Select
                    multi
                    placeholder="State Filter"
                    value={this.state.statusFilter}
                    options={statusFilterOptions}
                    onChange={this.onChangeStatusFilter.bind(this)}
                  />
                </div>
              </div>
              <div className="builderContainer">
                <div style={{ width: '50%' }}>
                  <Select
                    multi
                    placeholder="Config Filter"
                    value={this.state.configFilter}
                    options={configFilterOptions}
                    onChange={this.onChangeConfigFilter.bind(this)}
                  />
                </div>
                <div style={{ width: '50%' }}>
                  <Select
                    multi
                    placeholder="Command Line Filter"
                    value={this.state.commandLineFilter}
                    options={commandLineFilterOptions}
                    onChange={this.onChangeCommandLineFilter.bind(this)}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="builderSection">Runs ({runOptions.length})</div>
          {this.state.slots.map((_, i) => {
            const slot = this.state.slots[i];
            const run = this.getRunById(slot.runId);

            return (
              <div key={i} className="builderVideoContainer">
                <div className="builderContainer">
                  <div style={{ width: '32px' }} className="videoSelectionLabel">
                    {i}
                  </div>
                  <div style={{ width: '360px' }}>
                    <Select
                      placeholder="Run"
                      value={slot.runId}
                      options={runOptions}
                      onChange={this.onChangeRun.bind(this, i)}
                    />
                  </div>
                  <div style={{ width: '360px' }}>
                    <Select
                      disabled={!run}
                      placeholder="Video"
                      value={slot.video}
                      options={run ? this.getOptionsForTask(run.info.task) : []}
                      onChange={this.onChangeVideo.bind(this, i)}
                    />
                  </div>
                  <div style={{ width: '60px' }}>
                    <Select
                      disabled={!run}
                      placeholder="QP"
                      value={slot.quality}
                      options={run ? this.getOptionsForQuality(run.info.qualities) : []}
                      onChange={this.onChangeQuality.bind(this, i)}
                    />
                  </div>
                  <div>
                    <RaisedButton
                      label="Remove"
                      disableTouchRipple={true}
                      disableFocusRipple={true}
                      onTouchTap={this.onDeleteRun.bind(this, i)}
                      style={{ marginRight: 8 }}
                    />
                    <RaisedButton
                      label="Duplicate"
                      disableTouchRipple={true}
                      disableFocusRipple={true}
                      onTouchTap={this.onDuplicateRun.bind(this, i)}
                      style={{ marginRight: 8 }}
                    />
                    <RaisedButton
                      label="Up"
                      disabled={i - 1 < 0}
                      disableTouchRipple={true}
                      disableFocusRipple={true}
                      onTouchTap={this.onMoveRun.bind(this, i, -1)}
                      style={{ marginRight: 8 }}
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
                <div className="builderContainer" style={{ paddingLeft: '40px' }}>
                  {run && <RunDetails json={run} />}
                </div>
              </div>
            );
          })}
          <div className="builderSection">
            <div>
              <Toggle
                style={{ width: '300px' }}
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
          {this.state.votingEnabled && (
            <div>
              <div className="builderContainer">
                <div style={{ width: '1000px' }}>
                  <TextField
                    errorText={this.getVoteErrorText()}
                    multiLine={false}
                    floatingLabelText="Vote Configuration: 0:1,2:3:4, ..."
                    floatingLabelFixed={true}
                    name="message"
                    value={this.state.vote}
                    style={{ width: '1000px' }}
                    onChange={this.onChangeVote.bind(this)}
                  />
                </div>
              </div>
              <div className="builderContainer">
                <div>
                  <Checkbox
                    style={{ width: '300px' }}
                    label="Show Vote Results"
                    checked={this.state.showVoteResult}
                    onCheck={(event, value) => {
                      this.setState({ showVoteResult: value } as any);
                      this.resetURL();
                    }}
                  />
                </div>
                <div className="builderCaption">Show vote results at the end of the voting session.</div>
              </div>
              <div className="builderContainer">
                <div>
                  <Checkbox
                    style={{ width: '300px' }}
                    label="Blind"
                    checked={this.state.blind}
                    onCheck={(event, value) => {
                      this.setState({ blind: value } as any);
                      this.resetURL();
                    }}
                  />
                </div>
                <div className="builderCaption">Randomize runs when comparing them.</div>
              </div>
              <div className="builderContainer">
                <TextField
                  multiLine={false}
                  floatingLabelText="Vote Intro Message"
                  floatingLabelFixed={true}
                  name="message"
                  value={this.state.voteMessage}
                  style={{ width: '1000px' }}
                  onChange={this.onVoteMessageChange.bind(this)}
                />
              </div>
            </div>
          )}
          <div className="builderContainer">
            <div>
              <RaisedButton
                label="Add Run"
                disableTouchRipple={true}
                disableFocusRipple={true}
                onTouchTap={this.onAddRun.bind(this)}
                style={{ marginRight: 8 }}
              />
              <RaisedButton
                label="Shorten URL"
                disableTouchRipple={true}
                disableFocusRipple={true}
                onTouchTap={this.onShortenURL.bind(this)}
                style={{ marginRight: 8 }}
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
          <div className="builderSection">Analyzer Link</div>
          <div className="builderContainer">
            <div className="builderURL">{this.state.shortURL || this.createURL()}</div>
          </div>
        </div>
      );
    }
  }
}
