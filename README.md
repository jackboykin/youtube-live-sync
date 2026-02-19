# YouTube Live Sync

Userscript that automatically minimizes latency on YouTube livestreams and YouTube TV live content by skipping to the live edge when buffer drift exceeds a threshold.

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/)
2. [Click here to install](https://github.com/jackboykin/youtube-live-sync/raw/refs/heads/main/dist/yt-actual-live.user.js)

## Build

Requires [Bun](https://bun.sh/).

```sh
bun install
bun run build
```

Output is written to `dist/yt-actual-live.user.js`.

## Development

```sh
bun run dev          # watch mode
bun run typecheck    # type checking
bun test             # run tests
bun test --watch     # watch mode
```

## Configuration

Edit these values in the script:

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_BUFFER` | 5.0 | Seconds behind live edge to maintain |
| `CHECK_INTERVAL` | 6000 | Milliseconds between latency checks |

Lower `TARGET_BUFFER` = closer to live but higher rebuffer risk.

## Compatibility

- YouTube livestreams (youtube.com)
- YouTube TV live content (tv.youtube.com)
- Firefox + Violentmonkey (tested)
- Chrome + Tampermonkey (should work)

## License

MIT
