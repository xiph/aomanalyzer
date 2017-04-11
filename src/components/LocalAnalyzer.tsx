import * as React from "react";
import { localFiles, localFileProtocol } from "./analyzerTools";
import { AnalyzerViewLoaderComponent } from "./Loader"
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import CircularProgress from 'material-ui/CircularProgress';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';
import SelectField from 'material-ui/SelectField';
import Paper from 'material-ui/Paper';
import IconButton from 'material-ui/IconButton';
import FontIcon from 'material-ui/FontIcon';
import { Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle } from 'material-ui/Toolbar';
import {grey900, grey800, grey100, grey200} from 'material-ui/styles/colors';

// let baseUrl = "https://beta.arewecompressedyet.com" + '/';
let baseUrl = "https://arewecompressedyet.com" + '/';

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
    let info = this.props.json.info;
    return <div className="runDetail">
      <div>Commit: {info.commit}</div>
      <div>Nick: {info.nick}</div>
      <div>Task: {info.task}</div>
      <div>Build Options: {info.build_options}</div>
      <div>Extra Options: {info.extra_options}</div>
    </div>
  }
}

export class LocalAnalyzerComponent extends React.Component<{

}, {
    listJson: any;
    slots: { runId: string, video: string, quality: number }[];
    pairs: any;
  }> {
  constructor() {
    super();
    this.state = {
      listJson: null,
      slots: [{ runId: "", video: "", quality: 0 }]
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
    this.loadXHR(baseUrl + "list.json").then((listJson: any) => {
      listJson.sort(function (a, b) {
        return (new Date(b.date) as any) - (new Date(a.date) as any);
      });
      listJson = listJson.filter(job => {
        return job.status === "completed";
      });
      listJson = listJson.slice(0, 100);

      // Say no to long names.
      listJson = listJson.filter(job => {
        return job.run_id.length < 64;
      });
      this.setState({ listJson } as any);
    });
  }
  handleAction(value) {

  }
  onChangeRun(slot, event, index, value) {
    let slots = this.state.slots;
    slots[slot].runId = value;
    this.setState({ slots } as any);
  }
  onChangeVideo(slot, event, index, value) {
    let slots = this.state.slots;
    slots[slot].video = value;
    this.setState({ slots } as any);
  }
  onChangeQuality(slot, event, index, value) {
    let slots = this.state.slots;
    slots[slot].quality = value;
    this.setState({ slots } as any);
  }
  onDeleteRun(slot) {
    let slots = this.state.slots;
    slots.splice(slot, 1);
    this.setState({ slots } as any);
  }
  onAddRun() {
    let slots = this.state.slots;
    slots.push({ runId: "", video: "", quality: 0 });
    this.setState({ slots } as any);
  }
  onSend() {
    let pairs = this.state.slots.map(slot => {
      let run = this.getRunById(slot.runId);
      let videoUrl = baseUrl + `runs/${run.run_id}/${run.info.task}/${slot.video}-${slot.quality}.ivf`;
      let decoderUrl = baseUrl + `runs/${run.run_id}/js/decoder.js`;
      return {decoderUrl, videoUrl};
    });
    this.setState({pairs} as any);
  }
  getRunById(runId) {
    return this.state.listJson.find(run => run.run_id === runId);
  }
  getMenuItemsForTask(task: string) {
    let array = tasks[task];
    if (!array) {
      return []
    }
    return array.map(video => <MenuItem key={video} value={video} primaryText={video} />)
  }
  getMenuItemsForQuality(quality: string) {
    let array = [20, 32, 43, 55, 63];
    if (quality) {
      array = quality.split(" ").map(q => parseInt(q));
    }
    return array.map(q => <MenuItem key={q} value={q} primaryText={String(q)} />)
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
  render() {
    // playbackFrameRate={playbackFrameRate}
    //   layers={layers}
    //   maxFrames={maxFrames}
    //   blind={blind}
    if (this.state.pairs) {
      return <AnalyzerViewLoaderComponent
        decoderVideoUrlPairs={this.state.pairs}
        maxFrames={4}
      />
    }
    if (!this.state.listJson) {
      return <Dialog title="Downloading AWCY Runs" modal={true} open={true}>
        <CircularProgress size={40} thickness={7} />
      </Dialog>;
    } else {
      let items = this.state.listJson.map(job => {
        return <MenuItem key={job.run_id} value={job.run_id} label={job.run_id} primaryText={job.run_id} />
      });

      const paperStyle = {
        padding: 10,
        marginTop: 10,
        marginBottom: 10,
        backgroundColor: grey900
      };

      return <Dialog title="Select AWCY Runs" modal={true} open={true}>
        {this.state.slots.map((_, i) => {
          let slot = this.state.slots[i];
          let run = this.getRunById(slot.runId);

          return <Paper key={i} style={paperStyle}><div key={i}>
            <SelectField fullWidth={true} floatingLabelText={"Run"} value={slot.runId} onChange={this.onChangeRun.bind(this, i)} >
              {items}
            </SelectField>
            {run && <RunDetails json={run} />}
            {run && <SelectField fullWidth={true} floatingLabelText={"Video"} value={slot.video} onChange={this.onChangeVideo.bind(this, i)} >
              {this.getMenuItemsForTask(run.info.task)}
            </SelectField>}
            {run && <SelectField fullWidth={true} floatingLabelText={"Quality"} value={slot.quality} onChange={this.onChangeQuality.bind(this, i)} >
              {this.getMenuItemsForQuality(run.info.quality)}
            </SelectField>}

            <IconButton onClick={this.onDeleteRun.bind(this, i)} tooltip="Delete run to compare.">
              <FontIcon className="material-icons md-24">remove_circle_outline</FontIcon>
            </IconButton>
          </div>
          </Paper>
        })
        }
        <Toolbar>
          <ToolbarGroup firstChild={true}>
            <IconButton onClick={this.onAddRun.bind(this)} tooltip="Add run to compare.">
              <FontIcon className="material-icons md-24">add_circle_outline</FontIcon>
            </IconButton>
          </ToolbarGroup>
          <ToolbarGroup>
            <IconButton disabled={this.cannotAnalyze()} onClick={this.onSend.bind(this)} tooltip="Analyze">
              <FontIcon className="material-icons md-24">send</FontIcon>
            </IconButton>
          </ToolbarGroup>
        </Toolbar>
      </Dialog>
    }
  }
}
