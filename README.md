# AOM Analyzer

## Install & Build

```
npm install && npm run build-release
```

## Development Setup

To build AOM Analyzer automatically whenever a file changes run:

```
npm run build-watch
```

## Using Electron

You can run tha analyzer using `electron` from the command line using the following command line:

```
electron . decoder_file/url video_file/url ...
```

### Packaging

#### OSX

```
npm run package-darwin
```

#### Linux

```
npm run package-linux
```

#### Windows

```
npm run package-win32
```