export interface Config {
    enabled: boolean;
    targetBuffer: number;
    checkInterval: number;
    debugLogging: boolean;
}

export interface LatencyInfo {
    edge: number;
    latency: number;
}

export interface LiveSyncStatus {
    enabled: boolean;
    dvrMode: boolean;
    targetBuffer: number;
    debugLogging: boolean;
    currentLatency: number | null;
    isLive: boolean;
}

export interface LiveSyncAPI {
    enable: () => void;
    disable: () => void;
    /** @param seconds Must be >= 0 */
    setBuffer: (seconds: number) => void;
    getStatus: () => LiveSyncStatus;
    exitDvr: () => void;
    toggleDebug: () => void;
}

export interface YouTubePlayer {
    getVideoData: () => { video_id: string; isLive: boolean };
}

declare global {
    interface Window {
        LiveSync: LiveSyncAPI;
        _liveSyncInitialized?: boolean;
    }
}

export {};
