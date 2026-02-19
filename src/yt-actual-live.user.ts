import type { Config, LatencyInfo, LiveSyncStatus, LiveSyncAPI, YouTubePlayer } from './types';

(function(): void {
    'use strict';

    if (window.self !== window.top) return;
    if (window._liveSyncInitialized) return;
    window._liveSyncInitialized = true;

    const DEFAULT_CONFIG = {
        enabled: true,
        targetBuffer: 5.0,
        checkInterval: 6000,
        debugLogging: false
    } as const satisfies Config;

    class LiveSyncManager implements LiveSyncAPI {
        private readonly isStandardYT = window.location.hostname === 'www.youtube.com';
        private readonly isYTTV = window.location.hostname === 'tv.youtube.com';

        private config: Config;
        private dvrModeActive = false;
        private lastKnownTime = 0;
        private seekStartTime = 0;
        private lastSyncTime = 0;
        private syncCooldown = false;
        private lastVideoId: string | null = null;

        constructor() {
            this.config = this.loadConfig();
            this.attachEventListeners();
            setTimeout(() => {
                this.log('Starting sync loop');
                this.runSyncLoop();
            }, 5000);
        }

        private loadConfig(): Config {
            try {
                const stored = localStorage.getItem('liveSyncConfig');
                return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG;
            } catch {
                return DEFAULT_CONFIG;
            }
        }

        private saveConfig(config: Config): void {
            this.config = config;
            localStorage.setItem('liveSyncConfig', JSON.stringify(config));
        }

        private log(...args: unknown[]): void {
            if (this.config.debugLogging) {
                console.log('[Live Sync]', ...args);
            }
        }

        private attachEventListeners(): void {
            // Video events don't bubble — use capture phase for document-level delegation
            document.addEventListener('timeupdate', this.onTimeUpdate, true);
            document.addEventListener('seeking', this.onSeeking, true);
            document.addEventListener('seeked', this.onSeeked, true);
        }

        private onTimeUpdate = (e: Event): void => {
            if (e.target instanceof HTMLVideoElement) {
                this.lastKnownTime = e.target.currentTime;
            }
        };

        private onSeeking = (e: Event): void => {
            if (!(e.target instanceof HTMLVideoElement)) return;
            // Snapshot pre-seek position before timeupdate can overwrite it
            this.seekStartTime = this.lastKnownTime;
        };

        private onSeeked = (e: Event): void => {
            if (!(e.target instanceof HTMLVideoElement)) return;

            // Ignore seeks triggered by our own sync
            if (Date.now() - this.lastSyncTime < 1000) return;

            // Only activate DVR on true backward jumps (user dragged scrubber back)
            const jumpBack = this.seekStartTime - e.target.currentTime;
            if (jumpBack > 5) {
                this.dvrModeActive = true;
                this.log(`DVR mode activated (jumped back ${jumpBack.toFixed(1)}s)`);
            }
        };

        private getActiveVideo(): HTMLVideoElement | null {
            const videos = document.querySelectorAll('video');
            let fallback: HTMLVideoElement | null = null;
            for (const v of videos) {
                if (v.readyState >= 2 && !v.paused) {
                    if (v.src?.startsWith('blob:')) return v;
                    fallback ??= v;
                }
            }
            return fallback;
        }

        private getLatencyInfo(video: HTMLVideoElement): LatencyInfo | null {
            if (video.buffered.length === 0) return null;

            const edge = video.buffered.end(video.buffered.length - 1);
            const current = video.currentTime;

            if (edge <= current) return null;

            return { edge, current, latency: edge - current };
        }

        private isLiveContent(video?: HTMLVideoElement | null): boolean {
            if (this.isStandardYT) {
                const player = document.getElementById('movie_player') as YouTubePlayer | null;
                return !!player && typeof player.getVideoData === 'function' && player.getVideoData().isLive;
            }
            if (this.isYTTV) {
                // YTTV sets a large finite duration for live DVR streams
                // (e.g. ~50000s) instead of Infinity. VODs are rarely > 6 hours.
                return !!video && video.duration > 21600;
            }
            return false;
        }

        private getCurrentVideoId(): string {
            if (this.isStandardYT) {
                const player = document.getElementById('movie_player') as YouTubePlayer | null;
                if (player && typeof player.getVideoData === 'function') {
                    return player.getVideoData().video_id;
                }
            }
            return window.location.href;
        }

        private checkVideoChange(): void {
            const currentId = this.getCurrentVideoId();
            if (currentId && currentId !== this.lastVideoId) {
                this.lastVideoId = currentId;
                this.lastKnownTime = 0;
                if (this.dvrModeActive) {
                    this.dvrModeActive = false;
                    this.log('DVR mode reset (video changed)');
                }
            }
        }

        private handleSync(): void {
            const video = this.getActiveVideo();
            if (!video || !this.isLiveContent(video)) return;

            this.checkVideoChange();

            if (this.dvrModeActive) {
                const info = this.getLatencyInfo(video);
                if (info && info.latency <= this.config.targetBuffer + 1.0) {
                    this.dvrModeActive = false;
                    this.log('DVR mode auto-exited (near live edge)');
                } else {
                    this.log('Skipping sync — DVR mode active');
                    return;
                }
            }

            const info = this.getLatencyInfo(video);
            if (!info) {
                this.log('No buffer data');
                return;
            }

            this.log(`Latency: ${info.latency.toFixed(2)}s`);

            if (info.latency > this.config.targetBuffer + 1.0) {
                // Skip one tick after syncing to let the MSE seek settle
                if (this.syncCooldown) {
                    this.syncCooldown = false;
                    this.log('Cooldown — waiting for previous sync to settle');
                    return;
                }
                this.lastSyncTime = Date.now();
                this.syncCooldown = true;
                video.currentTime = info.edge - this.config.targetBuffer;
                this.log(`Synced from ${info.latency.toFixed(2)}s`);
            } else {
                // Seek settled — clear cooldown so it doesn't go stale
                this.syncCooldown = false;
            }
        }

        private runSyncLoop(): void {
            if (this.config.enabled) {
                this.handleSync();
            }
            setTimeout(() => this.runSyncLoop(), this.config.checkInterval);
        }

        // Public API
        enable(): void {
            this.saveConfig({ ...this.config, enabled: true });
            this.dvrModeActive = false;
            this.log('Enabled (DVR mode reset)');
        }

        disable(): void {
            this.saveConfig({ ...this.config, enabled: false });
            this.log('Disabled');
        }

        setBuffer(seconds: number): void {
            if (typeof seconds !== 'number' || seconds < 0) {
                console.error('[Live Sync] setBuffer requires a positive number');
                return;
            }
            this.saveConfig({ ...this.config, targetBuffer: seconds });
            this.log('Target buffer set to', seconds, 'seconds');
        }

        getStatus(): LiveSyncStatus {
            const video = this.getActiveVideo();
            const info = video ? this.getLatencyInfo(video) : null;
            return {
                enabled: this.config.enabled,
                dvrMode: this.dvrModeActive,
                targetBuffer: this.config.targetBuffer,
                debugLogging: this.config.debugLogging,
                currentLatency: info ? info.latency : null,
                isLive: this.isLiveContent(video)
            };
        }

        exitDvr(): void {
            this.dvrModeActive = false;
            this.log('DVR mode manually exited');
        }

        toggleDebug(): void {
            const newDebug = !this.config.debugLogging;
            this.saveConfig({ ...this.config, debugLogging: newDebug });
            console.log('[Live Sync] Debug logging', newDebug ? 'enabled' : 'disabled');
        }
    }

    window.LiveSync = new LiveSyncManager();
})();
