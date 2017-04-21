import * as React from "react";

import FlatButton from 'material-ui/FlatButton';
import Dialog from 'material-ui/Dialog';
import LinearProgress from 'material-ui/LinearProgress';
import {PlayerSplitComponent} from "./PlayerSplit";
import {deepOrangeA400} from 'material-ui/styles/colors';

interface VotingSessionComponentProps {
  /**
   * Sets of videos to vote on.
   */
  videos : {
    decoderUrl: string,
    videoUrl: string,
    decoderName: string
  }[][];
  /**
   * Description to show on the first screen.
   */
  description?: string;
}

/**
 * Walks through a sequence of votes.
 */
export class VotingSessionComponent extends React.Component < VotingSessionComponentProps, {
  index : number
} > {
  constructor() {
    super();
    this.state = {
      index: -1
    };
  }
  next() {
    this.setState({
      index: this.state.index + 1
    });
  }
  render() {
    let index = this.state.index;
    let videos = this.props.videos;
    let body;
    if (index < 0) {
      body = <Dialog
        repositionOnUpdate={true}
        modal={true}
        title="Vote"
        open={true}
        actions={[< FlatButton label = "Let's Begin" onTouchTap = {
          () => this.next()
        } />]}>
        <p>
          You will be asked to vote on {videos.length} set(s) of videos. {' '}
          {this.props.description}
        </p>
      </Dialog>
    } else if (index < videos.length) {
      body = <PlayerSplitComponent
        key={this.state.index}
        videos={videos[index]}
        isVotingEnabled={true}
        isBlind={true}
        onVoted={() => {
        this.next();
      }}/>
    } else {
      body = <Dialog repositionOnUpdate={true} modal={true} title="Thank You" open={true}>
        <p>
          Your vote counts!
        </p>
      </Dialog>
    }
    return <div className="votingSessionContainer">
      <LinearProgress
        color={deepOrangeA400}
        mode="determinate"
        value={this.state.index}
        max={videos.length}/> {body}
    </div>
  }
}