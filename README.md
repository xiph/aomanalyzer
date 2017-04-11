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
- `--frames` number of frames to decode, by default this is set to `4`

### To build electron packages use:

- `npm run package-darwin`
- `npm run package-linux`
- `npm run package-win32`
