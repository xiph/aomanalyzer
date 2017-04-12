# [AOM Analyzer](http://aomanalyzer.org)

## Install & Build

```
npm install && npm run build-release
```

## Development Setup

To build AOM Analyzer automatically whenever a file changes run:

```
npm run build-watch
```

## Electron

You can run the analyzer using `electron` from the command line using:

```
electron . decoder1 video1 decoder2 video2 video3 ...
```

The `decoder` and `video` parameters can point either to a local file or a remote url.

### Command Line Options

- `--zoomFactor` sets the default zoom level, if you feel that the UI elements are too large, use `0.75` or `0.5`.
- `--dev` opens up electron dev tools by default.
- `--frames` number of frames to decode, by default this is set to `4`.
- `--split` side by side comparison. This requires that you specify at least two videos to compare. The split view does not show any analyzer layers which makes decoding a bit faster.
  - `1`: Left (first video)
  - `2`: Right (second video)
  - `3`: Vertical Split (first video on the left, second video on the right)
  - `4`: Horizontal Split (first video on the top, second video on the bottom)

### To build electron packages use:

- `npm run package-darwin`
- `npm run package-linux`
- `npm run package-win32`

## Toolbar

![GitHub Logo](/img/toolbar.png)

### Video Tabs

The very top tabs let you toggle between videos. You can also use the number keys to toggle between videos.

### Current Video Quick Info

The red bar provides quick info about the current frame.

### Commands

- `Toggle Layers`: Toggles a variety of layers on/off. To understand what the color values mean in each of the layers, you have to click on individual blocks and inspect their value in the `Block Info` tab.
- `Save Image`: Save current image to a `.png` file.
- `Reset Analyzer`: Resets the analyzer state to the first frame and clears all layers.
- `Previous Frame`
- `Play / Pause`
- `Next Frame`
- `Zoom Out`
- `Zoom In`: Zooming in the entire video can slow things down quite a bit. Use the Zoom tab instead.
- `Decode 30 More Frames`: Decode 30 more frames in a background thread. This may take a while but you should still be able to use the analyzer while that is happening.
- `Share`: Creates a shortened URL to your analyzer state.

### Tabs

- `Zoom`: Click anywhere on the decoded image to zoom in on it.

- `Histograms`:
  - `Bits`: Number of bits spent.
  - `Symbols`: % of bits spent on each symbol type.
  - `Block Size`: % of pixels within a block size.
  - `Transform Size`: % of pixels within a transform size.
  - `Transform Type`: % of pixels within a transform type.
  - `Prediction Mode`: % of pixels within a prediction mode.
  - `Skip`: % of pixels skipped.

- `Block Info`: Per selected block information and accounting. (When you click on the decoded image, you'll see a orange rectangle that highlights the selected block.)
- `Frame Info`: Per frame information and accounting.

## Accounting

Both the `Block Info` and `Frame Info` tabs have an accounting section. Accounting information keeps track of the number of bits spent on each symbol in the bit stream. The accounting tables show the symbol name, the number of bits spent on that symbol within a block (or frame), the percentage relative to the total number of bits spent in the block (or frame) and the number or samples (or the number of symbols read.)
