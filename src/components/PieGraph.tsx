import * as React from 'react';

import { theme } from '../theme';
import { Pie } from '@nivo/pie';

export class PieGraph extends React.Component<{
  width: number;
  height: number;
  data: any[];
  paletteColor?: {
    [id: string]: string;
  };
}> {
  public static defaultProps = {
    width: 500,
    height: 512,
  };

  constructor(props) {
    super(props);
  }

  render() {
    const getColor = !!this.props.paletteColor
      ? (dataValue) => {
          return dataValue.id in this.props.paletteColor ? this.props.paletteColor[dataValue.id] : `blue`;
        }
      : undefined;
    return (
      <div>
        <Pie
          height={this.props.height}
          width={this.props.width}
          margin={{
            top: 140,
            right: 140,
            bottom: 140,
            left: 20,
          }}
          data={this.props.data}
          innerRadius={0.6}
          padAngle={0.7}
          cornerRadius={3}
          fit={true}
          colors={getColor}
          activeOuterRadiusOffset={8}
          borderColor={{ from: 'color', modifiers: [['darker', 0.6]] }}
          arcLinkLabelsSkipAngle={16}
          //   arcLinkLabelsTextColor={theme.palette.text.primary}
          //   arcLinkLabelsOffset={1}
          //   arcLinkLabelsThickness={2}
          //   arcLinkLabelsColor={{ from: 'color' }}
          enableArcLabels={false}
          enableArcLinkLabels={false}
          legends={[
            {
              anchor: 'right',
              direction: 'column',
              justify: false,
              translateX: 50,
              translateY: 0,
              itemsSpacing: 2,
              itemWidth: 60,
              itemHeight: 14,
              itemTextColor: '#999',
              itemDirection: 'left-to-right',
              itemOpacity: 1,
              symbolSize: 14,
              symbolShape: 'circle',
            },
          ]}
          theme={{
            background: theme.palette.grey[900],
            textColor: theme.palette.text.primary,
            fontSize: 10,
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
