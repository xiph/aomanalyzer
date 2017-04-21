import * as React from "react";

import { PlayerSplitComponent } from "./PlayerSplit";
import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';

interface VotingSessionComponentProps {
  videos: { decoderUrl: string, videoUrl: string, decoderName: string }[][]
}

export class VotingSessionComponent extends React.Component<VotingSessionComponentProps, {
  index: number
}> {
  constructor() {
    super();
    this.state = {
      index: -1
    };
  }
  next() {
    this.setState({index: this.state.index + 1});
  }
  render() {
    let customContentStyle = {
      width: '1200',
      maxWidth: 'none'
    };
    let index = this.state.index;
    let videos = this.props.videos;
    if (index < 0) {
      return <Dialog
        repositionOnUpdate={false}
        contentStyle={customContentStyle}
        modal={true}
        title="Vote"
        open={true}
        actions={[<FlatButton
          label="Let's Begin"
          onTouchTap={() => this.next()}
        />]}
      >
      <p>
        You will be presented with {videos.length} set(s) of videos.
      </p>
      </Dialog>
    }

    if (index < videos.length) {
      return <PlayerSplitComponent key={this.state.index} videos={videos[index]} isVotingEnabled={true} isBlind={true} onVoted={() => {
        this.next();
      }}/>
    };

    return <Dialog
      repositionOnUpdate={false}
      contentStyle={customContentStyle}
      modal={true}
      title="Thank You"
      open={true}
    >
    <p>
      Your vote counts!
    </p>
    </Dialog>
  }

}