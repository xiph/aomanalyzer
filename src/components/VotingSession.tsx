import * as React from 'react';

import { PlayerSplitComponent } from './PlayerSplit';
import { Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress } from '@material-ui/core';
import Button from '@material-ui/core/Button';
import { deepOrange } from '@material-ui/core/colors';

function shuffle(array: any[], count: number) {
  // Shuffle Indices
  for (let j = 0; j < count; j++) {
    const a = (Math.random() * array.length) | 0;
    const b = (Math.random() * array.length) | 0;
    const t = array[a];
    array[a] = array[b];
    array[b] = t;
  }
  return array;
}

interface VotingSessionComponentProps {
  /**
   * Sets of videos to vote on.
   */
  videos: {
    decoderUrl: string;
    videoUrl: string;
    decoderName: string;
  }[][];

  /**
   * Description to show on the first screen.
   */
  description?: string;

  /**
   * Whether to randomize voting.
   */
  isBlind?: boolean;

  /**
   * Whether to show voting results.
   */
  showResult?: boolean;
}

/**
 * Walks through a sequence of votes.
 */
export class VotingSessionComponent extends React.Component<
  VotingSessionComponentProps,
  {
    index: number;
  }
> {
  public static defaultProps: VotingSessionComponentProps = {
    description: '',
    isBlind: true,
    showResult: false,
  } as any;
  votes: any[] = [];
  constructor(props) {
    super(props);
    this.state = {
      index: -1,
    };
  }
  next() {
    this.setState({
      index: this.state.index + 1,
    });
  }
  renderVoteResults() {
    const decoders = {};
    this.votes.forEach((vote) => {
      vote.videos.forEach((video) => {
        if (!(video.decoder in decoders)) {
          decoders[video.decoder] = 0;
        }
        if (video.selected) {
          decoders[video.decoder]++;
        }
      });
    });
    const decoderList = [];
    for (const k in decoders) {
      decoderList.push([k, decoders[k]]);
    }
    return (
      <div className="voteResult">
        {decoderList.map((pair, i) => (
          <div key={i}>
            <span>{pair[1]}</span>
            {': '}
            <span>{pair[0]}</span>
          </div>
        ))}
      </div>
    );
  }
  render() {
    const index = this.state.index;
    const videos = this.props.videos;
    let body;
    if (index < 0) {
      body = (
        <Dialog open={true}>
          <DialogTitle>Vote</DialogTitle>
          <DialogContent>
            <p>
              You will be asked to vote on {videos.length} sets of videos. {this.props.description}
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => this.next()}>Let&apos;s Begin</Button>
          </DialogActions>
        </Dialog>
      );
    } else if (index < videos.length) {
      let videosToVoteOn = videos[index];
      if (this.props.isBlind) {
        videosToVoteOn = shuffle(videosToVoteOn.slice(), 16);
      }
      body = (
        <PlayerSplitComponent
          key={this.state.index}
          videos={videosToVoteOn}
          isVotingEnabled={true}
          onVoted={(vote) => {
            this.votes.push(vote);
            this.next();
          }}
        />
      );
    } else {
      body = (
        <Dialog open={true}>
          <DialogTitle>Thank You</DialogTitle>
          <DialogContent>
            <p>Your vote counts!</p>
            {this.props.showResult && this.renderVoteResults()}
          </DialogContent>
        </Dialog>
      );
    }
    return (
      <div className="votingSessionContainer">
        <LinearProgress
          style={{ color: deepOrange['A400'] }}
          variant="determinate"
          value={(this.state.index * 100) / videos.length}
        />{' '}
        {body}
      </div>
    );
  }
}
