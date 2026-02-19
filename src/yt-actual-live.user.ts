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
            // Video events don't bubble — use capture phase
            document.addEventListener('timeupdate', this.onTimeUpdate, true);
            document.addEventListener('seeking', this.onSeeking, true);
            document.addEventListener('seeked', this.onSeeked, true);
            setTimeout(() => this.runSyncLoop(), 5000);
        }

        private loadConfig(): Config {
            try {
                const stored = localStorage.getItem('liveSyncConfig');
                return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG;
            } catch {
                return DEFAULT_CONFIG;
            }
        }

        private updateConfig(patch: Partial<Config>): void {
            Object.assign(this.config, patch);
            localStorage.setItem('liveSyncConfig', JSON.stringify(this.config));
        }

        private log(...args: unknown[]): void {
            if (this.config.debugLogging) {
                console.log('[Live Sync]', ...args);
            }
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
            const latency = edge - video.currentTime;
            return latency > 0 ? { edge, latency } : null;
        }

        private getYTPlayer(): YouTubePlayer | null {
            if (!this.isStandardYT) return null;
            const el = document.getElementById('movie_player') as YouTubePlayer | null;
            return el && typeof el.getVideoData === 'function' ? el : null;
        }

        private isLiveContent(video?: HTMLVideoElement | null): boolean {
            const player = this.getYTPlayer();
            if (player) return player.getVideoData().isLive;
            return this.isYTTV && !!video && video.duration > 21600;
        }

        private getCurrentVideoId(): string {
            return this.getYTPlayer()?.getVideoData().video_id ?? window.location.href;
        }

        private checkVideoChange(): void {
            const currentId = this.getCurrentVideoId();
            if (currentId && currentId !== this.lastVideoId) {
                this.lastVideoId = currentId;
                this.lastKnownTime = 0;
                this.dvrModeActive = false;
            }
        }

        private handleSync(): void {
            const video = this.getActiveVideo();
            if (!video || !this.isLiveContent(video)) return;

            this.checkVideoChange();

            const info = this.getLatencyInfo(video);
            if (!info) return;

            const threshold = this.config.targetBuffer + 1.0;

            if (this.dvrModeActive) {
                if (info.latency > threshold) return;
                this.dvrModeActive = false;
                this.log('DVR mode auto-exited (near live edge)');
            }

            if (info.latency <= threshold) {
                this.syncCooldown = false;
                return;
            }
            if (this.syncCooldown) {
                this.syncCooldown = false;
                return;
            }
            this.lastSyncTime = Date.now();
            this.syncCooldown = true;
            video.currentTime = info.edge - this.config.targetBuffer;
            this.log(`Synced: ${info.latency.toFixed(1)}s → ${this.config.targetBuffer}s`);
        }

        private runSyncLoop(): void {
            if (this.config.enabled) {
                this.handleSync();
            }
            setTimeout(() => this.runSyncLoop(), this.config.checkInterval);
        }

        // Public API
        enable(): void {
            this.updateConfig({ enabled: true });
            this.dvrModeActive = false;
        }

        disable(): void {
            this.updateConfig({ enabled: false });
        }

        setBuffer(seconds: number): void {
            if (typeof seconds !== 'number' || seconds < 0) return;
            this.updateConfig({ targetBuffer: seconds });
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
            this.updateConfig({ debugLogging: !this.config.debugLogging });
            console.log('[Live Sync] Debug', this.config.debugLogging ? 'on' : 'off');
        }
    }

    window.LiveSync = new LiveSyncManager();
})();
