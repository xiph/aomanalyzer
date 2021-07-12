import * as React from 'react';

import { theme } from '../theme';
import { LineCanvas, Serie } from '@nivo/line';

export class LineGraph extends React.Component<
  {
    width: number;
    height: number;
    data: Serie[];
  },
  {}
> {
  public static defaultProps = {
    width: 500,
    height: 512,
  };

  constructor(props) {
    super(props);
  }

  render() {
    return (
      <div>
        <LineCanvas
          height={512}
          width={500}
          margin={{
            top: 20,
            right: 150,
            bottom: 60,
            left: 80,
          }}
          yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: true, reverse: false }}
          axisBottom={{
            tickValues: [0, 55, 105, 155, 205, 255],
            tickSize: 5,
            tickPadding: 5,
            tickRotation: 0,
            legend: 'Pixel Value (0-255)',
            legendOffset: 36,
            legendPosition: 'middle',
          }}
          gridXValues={[0, 55, 105, 155, 205, 255]}
          legends={[
            {
              anchor: 'bottom-right',
              direction: 'column',
              justify: false,
              translateX: 90,
              translateY: 0,
              itemsSpacing: 2,
              itemDirection: 'left-to-right',
              itemWidth: 80,
              itemHeight: 12,
              itemOpacity: 0.75,
              symbolSize: 12,
              symbolShape: 'circle',
              symbolBorderColor: 'rgba(0, 0, 0, .5)',
              effects: [
                {
                  on: 'hover',
                  style: {
                    itemBackground: 'rgba(0, 0, 0, .03)',
                    itemOpacity: 1,
                  },
                },
              ],
            },
          ]}
          data={this.props.data}
          curve="monotoneX"
          isInteractive={true}
          colors={{ scheme: 'dark2' }}
          theme={{
            background: theme.palette.grey[900],
            textColor: theme.palette.text.secondary,
            fontSize: 14,
            tooltip: {
              container: {
                background: theme.palette.grey[700],
              },
            },
          }}
        />
      </div>
    );
  }
}
