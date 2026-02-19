// ==UserScript==
// @name         YouTube & YouTube TV Live Edge Auto-Sync
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Automatically minimizes latency on YouTube livestreams and YouTube TV live content.
// @author       jackboykin
// @author       Claude (Anthropic)
// @match        https://www.youtube.com/*
// @match        https://tv.youtube.com/*
// @exclude      https://www.youtube.com/live_chat*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/jackboykin/youtube-live-sync/main/dist/yt-actual-live.user.js
// @downloadURL  https://raw.githubusercontent.com/jackboykin/youtube-live-sync/main/dist/yt-actual-live.user.js
// ==/UserScript==

// src/yt-actual-live.user.ts
(function() {
  if (window.self !== window.top)
    return;
  if (window._liveSyncInitialized)
    return;
  window._liveSyncInitialized = true;
  const DEFAULT_CONFIG = {
    enabled: true,
    targetBuffer: 5,
    checkInterval: 6000,
    debugLogging: false
  };

  class LiveSyncManager {
    isStandardYT = window.location.hostname === "www.youtube.com";
    isYTTV = window.location.hostname === "tv.youtube.com";
    config;
    dvrModeActive = false;
    lastKnownTime = 0;
    seekStartTime = 0;
    lastSyncTime = 0;
    syncCooldown = false;
    lastVideoId = null;
    constructor() {
      this.config = this.loadConfig();
      document.addEventListener("timeupdate", this.onTimeUpdate, true);
      document.addEventListener("seeking", this.onSeeking, true);
      document.addEventListener("seeked", this.onSeeked, true);
      setTimeout(() => this.runSyncLoop(), 5000);
    }
    loadConfig() {
      try {
        const stored = localStorage.getItem("liveSyncConfig");
        return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG;
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    updateConfig(patch) {
      Object.assign(this.config, patch);
      localStorage.setItem("liveSyncConfig", JSON.stringify(this.config));
    }
    log(...args) {
      if (this.config.debugLogging) {
        console.log("[Live Sync]", ...args);
      }
    }
    onTimeUpdate = (e) => {
      if (e.target instanceof HTMLVideoElement) {
        this.lastKnownTime = e.target.currentTime;
      }
    };
    onSeeking = (e) => {
      if (!(e.target instanceof HTMLVideoElement))
        return;
      this.seekStartTime = this.lastKnownTime;
    };
    onSeeked = (e) => {
      if (!(e.target instanceof HTMLVideoElement))
        return;
      if (Date.now() - this.lastSyncTime < 1000)
        return;
      const jumpBack = this.seekStartTime - e.target.currentTime;
      if (jumpBack > 5) {
        this.dvrModeActive = true;
        this.log(`DVR mode activated (jumped back ${jumpBack.toFixed(1)}s)`);
      }
    };
    getActiveVideo() {
      const videos = document.querySelectorAll("video");
      let fallback = null;
      for (const v of videos) {
        if (v.readyState >= 2 && !v.paused) {
          if (v.src?.startsWith("blob:"))
            return v;
          fallback ??= v;
        }
      }
      return fallback;
    }
    getLatencyInfo(video) {
      if (video.buffered.length === 0)
        return null;
      const edge = video.buffered.end(video.buffered.length - 1);
      const latency = edge - video.currentTime;
      return latency > 0 ? { edge, latency } : null;
    }
    getYTPlayer() {
      if (!this.isStandardYT)
        return null;
      const el = document.getElementById("movie_player");
      return el && typeof el.getVideoData === "function" ? el : null;
    }
    isLiveContent(video) {
      const player = this.getYTPlayer();
      if (player)
        return player.getVideoData().isLive;
      return this.isYTTV && !!video && video.duration > 21600;
    }
    getCurrentVideoId() {
      return this.getYTPlayer()?.getVideoData().video_id ?? window.location.href;
    }
    checkVideoChange() {
      const currentId = this.getCurrentVideoId();
      if (currentId && currentId !== this.lastVideoId) {
        this.lastVideoId = currentId;
        this.lastKnownTime = 0;
        this.dvrModeActive = false;
      }
    }
    handleSync() {
      const video = this.getActiveVideo();
      if (!video || !this.isLiveContent(video))
        return;
      this.checkVideoChange();
      const info = this.getLatencyInfo(video);
      if (!info)
        return;
      const threshold = this.config.targetBuffer + 1;
      if (this.dvrModeActive) {
        if (info.latency > threshold)
          return;
        this.dvrModeActive = false;
        this.log("DVR mode auto-exited (near live edge)");
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
    runSyncLoop() {
      if (this.config.enabled) {
        this.handleSync();
      }
      setTimeout(() => this.runSyncLoop(), this.config.checkInterval);
    }
    enable() {
      this.updateConfig({ enabled: true });
      this.dvrModeActive = false;
    }
    disable() {
      this.updateConfig({ enabled: false });
    }
    setBuffer(seconds) {
      if (typeof seconds !== "number" || seconds < 0)
        return;
      this.updateConfig({ targetBuffer: seconds });
    }
    getStatus() {
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
    exitDvr() {
      this.dvrModeActive = false;
      this.log("DVR mode manually exited");
    }
    toggleDebug() {
      this.updateConfig({ debugLogging: !this.config.debugLogging });
      console.log("[Live Sync] Debug", this.config.debugLogging ? "on" : "off");
    }
  }
  window.LiveSync = new LiveSyncManager;
})();
