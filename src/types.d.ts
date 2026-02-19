/**
 * Configuration interface for Live Sync
 */
export interface Config {
    enabled: boolean;
    targetBuffer: number;
    checkInterval: number;
    debugLogging: boolean;
}

/**
 * Latency information for a video element
 */
export interface LatencyInfo {
    edge: number;
    current: number;
    latency: number;
}

/**
 * Status information returned by getStatus()
 */
export interface LiveSyncStatus {
    enabled: boolean;
    dvrMode: boolean;
    targetBuffer: number;
    debugLogging: boolean;
    currentLatency: number | null;
    isLive: boolean;
}

/**
 * Public API exposed via window.LiveSync
 */
export interface LiveSyncAPI {
    /**
     * Enable the live sync functionality
     */
    enable: () => void;

    /**
     * Disable the live sync functionality
     */
    disable: () => void;

    /**
     * Set the target buffer in seconds
     * @param seconds - The target buffer in seconds (must be a positive number)
     */
    setBuffer: (seconds: number) => void;

    /**
     * Get the current status of the live sync
     * @returns The current status object
     */
    getStatus: () => LiveSyncStatus;

    /**
     * Manually exit DVR mode
     */
    exitDvr: () => void;

    /**
     * Toggle debug logging
     */
    toggleDebug: () => void;
}

/**
 * YouTube player API interface (minimal subset)
 */
export interface YouTubePlayer {
    getVideoData: () => {
        video_id: string;
        isLive: boolean;
    };
}

/**
 * Augment the Window interface
 */
declare global {
    interface Window {
        /**
         * Public API for controlling Live Sync
         */
        LiveSync: LiveSyncAPI;

        /**
         * Flag to prevent multiple initializations
         */
        _liveSyncInitialized?: boolean;
    }
}

export {};
