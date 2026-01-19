# YouTube Live Sync

Userscript that automatically minimizes latency on YouTube livestreams and YouTube TV live content by skipping to the live edge when buffer drift exceeds a threshold.

## Installation

1. Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/)
2. Click [youtube-live-sync.user.js](youtube-live-sync.user.js) → Raw → Install

## Configuration

Edit these values in the script:

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_BUFFER` | 5.0 | Seconds behind live edge to maintain |
| `CHECK_INTERVAL` | 3000 | Milliseconds between latency checks |

Lower `TARGET_BUFFER` = closer to live but higher rebuffer risk.

## Compatibility

- YouTube livestreams (youtube.com)
- YouTube TV live content (tv.youtube.com)
- Firefox + Violentmonkey (tested)
- Chrome + Tampermonkey (should work)

## License

MIT
