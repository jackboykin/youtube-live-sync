// ==UserScript==
// @name         YouTube & YouTube TV Live Edge Auto-Sync
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Automatically minimizes latency on YouTube livestreams and YouTube TV live content.
// @author       jackboykin
// @author       Claude (Anthropic)
// @match        https://www.youtube.com/*
// @match        https://tv.youtube.com/*
// @exclude      https://www.youtube.com/live_chat*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/jackboykin/youtube-live-sync/main/yt-actual-live.user.js
// @downloadURL  https://raw.githubusercontent.com/jackboykin/youtube-live-sync/main/yt-actual-live.user.js
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
  function getConfig() {
    try {
      const stored = localStorage.getItem("liveSyncConfig");
      return stored ? { ...DEFAULT_CONFIG, ...JSON.parse(stored) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  function saveConfig(config) {
    localStorage.setItem("liveSyncConfig", JSON.stringify(config));
  }
  function log(...args) {
    if (getConfig().debugLogging) {
      console.log("[Live Sync]", ...args);
    }
  }
  let dvrModeActive = false;
  let lastVideoId = null;
  let lastKnownTime = 0;
  let lastSyncTime = 0;
  function attachSeekListener(video) {
    if (video._liveSyncSeekListener)
      return;
    video._liveSyncSeekListener = true;
    video.addEventListener("timeupdate", () => {
      const currentTime = video.currentTime;
      const timeSinceSync = Date.now() - lastSyncTime;
      if (timeSinceSync > 1000 && lastKnownTime - currentTime > 5) {
        dvrModeActive = true;
        log(`DVR mode activated (jumped back ${(lastKnownTime - currentTime).toFixed(1)}s)`);
      }
      lastKnownTime = currentTime;
    });
  }
  function markSyncTime() {
    lastSyncTime = Date.now();
  }
  function getCurrentVideoId() {
    if (isStandardYouTube()) {
      const player = document.getElementById("movie_player");
      if (player && typeof player.getVideoData === "function") {
        return player.getVideoData().video_id;
      }
    }
    return window.location.href;
  }
  function checkVideoChange() {
    const currentId = getCurrentVideoId();
    if (currentId && currentId !== lastVideoId) {
      lastVideoId = currentId;
      lastKnownTime = 0;
      if (dvrModeActive) {
        dvrModeActive = false;
        log("DVR mode reset (video changed)");
      }
    }
  }
  window.LiveSync = {
    enable: () => {
      const config = getConfig();
      config.enabled = true;
      saveConfig(config);
      dvrModeActive = false;
      log("Enabled (DVR mode reset)");
    },
    disable: () => {
      const config = getConfig();
      config.enabled = false;
      saveConfig(config);
      log("Disabled");
    },
    setBuffer: (seconds) => {
      if (typeof seconds !== "number" || seconds < 0) {
        console.error("[Live Sync] setBuffer requires a positive number");
        return;
      }
      const config = getConfig();
      config.targetBuffer = seconds;
      saveConfig(config);
      log("Target buffer set to", seconds, "seconds");
    },
    getStatus: () => {
      const config = getConfig();
      const video = getActiveVideo();
      const info = video ? getLatencyInfo(video) : null;
      return {
        enabled: config.enabled,
        dvrMode: dvrModeActive,
        targetBuffer: config.targetBuffer,
        debugLogging: config.debugLogging,
        currentLatency: info ? info.latency : null,
        isLive: isLiveContent()
      };
    },
    exitDvr: () => {
      dvrModeActive = false;
      log("DVR mode manually exited");
    },
    toggleDebug: () => {
      const config = getConfig();
      config.debugLogging = !config.debugLogging;
      saveConfig(config);
      console.log("[Live Sync] Debug logging", config.debugLogging ? "enabled" : "disabled");
    }
  };
  function getActiveVideo() {
    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      if (v.src && v.src.startsWith("blob:") && v.readyState >= 2 && !v.paused) {
        return v;
      }
    }
    for (const v of videos) {
      if (v.readyState >= 2 && !v.paused) {
        return v;
      }
    }
    return null;
  }
  function getLatencyInfo(video) {
    if (video.buffered.length === 0)
      return null;
    const edge = video.buffered.end(video.buffered.length - 1);
    const current = video.currentTime;
    if (edge <= current)
      return null;
    return {
      edge,
      current,
      latency: edge - current
    };
  }
  function isYouTubeTV() {
    return window.location.hostname === "tv.youtube.com";
  }
  function isStandardYouTube() {
    return window.location.hostname === "www.youtube.com";
  }
  function isLiveContent() {
    if (isStandardYouTube()) {
      const player = document.getElementById("movie_player");
      return player && typeof player.getVideoData === "function" && player.getVideoData().isLive;
    }
    return isYouTubeTV();
  }
  function handleStandardYouTube() {
    const config = getConfig();
    const player = document.getElementById("movie_player");
    if (!player || typeof player.getVideoData !== "function")
      return;
    if (!player.getVideoData().isLive)
      return;
    const video = getActiveVideo();
    if (!video)
      return;
    attachSeekListener(video);
    if (dvrModeActive) {
      log("Skipping sync - DVR mode active");
      return;
    }
    const info = getLatencyInfo(video);
    if (!info)
      return;
    if (info.latency > config.targetBuffer + 1) {
      markSyncTime();
      video.currentTime = info.edge - config.targetBuffer;
      log(`Synced. Latency was: ${info.latency.toFixed(2)}s`);
    }
  }
  function handleYouTubeTV() {
    const config = getConfig();
    const video = getActiveVideo();
    if (!video) {
      log("No active video found");
      return;
    }
    attachSeekListener(video);
    if (dvrModeActive) {
      log("Skipping sync - DVR mode active");
      return;
    }
    const info = getLatencyInfo(video);
    if (!info) {
      log("No buffer data");
      return;
    }
    log(`Latency: ${info.latency.toFixed(2)}s`);
    if (info.latency > config.targetBuffer + 1) {
      markSyncTime();
      video.currentTime = info.edge - config.targetBuffer;
      log(`Synced from ${info.latency.toFixed(2)}s`);
    }
  }
  setTimeout(() => {
    log("Starting interval checks");
    setInterval(() => {
      const config = getConfig();
      if (!config.enabled)
        return;
      checkVideoChange();
      if (isStandardYouTube()) {
        handleStandardYouTube();
      } else if (isYouTubeTV()) {
        handleYouTubeTV();
      }
    }, getConfig().checkInterval);
  }, 5000);
})();
