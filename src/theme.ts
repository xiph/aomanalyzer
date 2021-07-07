import { createMuiTheme, PaletteType } from '@material-ui/core';
import { grey } from '@material-ui/core/colors';

const overrideTheme = {
  palette: {
    type: 'dark' as PaletteType,
    accent1Color: 'red',
  },
  tableRow: {
    height: 24,
  },
  tableRowColumn: {
    height: 24,
    spacing: 4,
  },
  tableHeaderColumn: {
    height: 32,
    spacing: 4,
  },
  toolbar: {
    backgroundColor: grey[900],
  },
  tabs: {
    backgroundColor: grey[800],
    textColor: grey[100],
    selectedTextColor: grey[200],
  },
  table: {
    backgroundColor: grey[900],
  },
};

export const theme = createMuiTheme(overrideTheme);
