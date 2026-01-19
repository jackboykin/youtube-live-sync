// ==UserScript==
// @name         YouTube & YouTube TV Live Edge Auto-Sync
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Automatically minimizes latency on YouTube livestreams and YouTube TV live content.
// @author       jackboykin (with assistance from Claude, Anthropic)
// @match        https://www.youtube.com/*
// @match        https://tv.youtube.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/jackboykin/youtube-live-sync/main/yt-actual-live.user.js
// @downloadURL  https://raw.githubusercontent.com/jackboykin/youtube-live-sync/main/yt-actual-live.user.js
// ==/UserScript==

(function() {
    'use strict';
    
    if (window._liveSyncInitialized) return;
    window._liveSyncInitialized = true;
    
    if (navigator.connection) {
        Object.defineProperty(navigator.connection, 'downlink', { value: 100 });
        Object.defineProperty(navigator.connection, 'effectiveType', { value: '4g' });
    }
    
    const TARGET_BUFFER = 5.0;
    const CHECK_INTERVAL = 6000;
    
    console.log('[Live Sync] Script loaded on: ' + window.location.hostname);
    
    function getActiveVideo() {
        const videos = document.querySelectorAll('video');
        for (const v of videos) {
            if (v.src && v.src.startsWith('blob:') && v.readyState >= 2 && !v.paused) {
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
        if (video.buffered.length > 0) {
            const edge = video.buffered.end(video.buffered.length - 1);
            return {
                edge: edge,
                current: video.currentTime,
                latency: edge - video.currentTime
            };
        }
        return null;
    }
    
    function isYouTubeTV() {
        return window.location.hostname === 'tv.youtube.com';
    }
    
    function isStandardYouTube() {
        return window.location.hostname === 'www.youtube.com';
    }
    
    function handleStandardYouTube() {
        const player = document.getElementById('movie_player');
        if (!player || typeof player.getVideoData !== 'function') return;
        if (!player.getVideoData().isLive) return;
        
        const video = getActiveVideo();
        if (!video) return;
        
        const info = getLatencyInfo(video);
        if (!info) return;
        
        if (info.latency > TARGET_BUFFER + 0.5) {
            video.currentTime = info.edge - TARGET_BUFFER;
            console.log(`[YT Live Sync] Skipped. Latency was: ${info.latency.toFixed(2)}s`);
        }
    }
    
    function handleYouTubeTV() {
        const video = getActiveVideo();
        if (!video) {
            console.log('[YTTV Live Sync] No active video found');
            return;
        }
        
        const info = getLatencyInfo(video);
        if (!info) {
            console.log('[YTTV Live Sync] No buffer data');
            return;
        }
        
        console.log(`[YTTV Live Sync] Latency: ${info.latency.toFixed(2)}s`);
        
        if (info.latency > TARGET_BUFFER + 1.0) {
            video.currentTime = info.edge - TARGET_BUFFER;
            console.log(`[YTTV Live Sync] Skipped ahead from ${info.latency.toFixed(2)}s`);
        }
    }
    
    setTimeout(() => {
        console.log('[Live Sync] Starting interval checks');
        setInterval(() => {
            if (isStandardYouTube()) {
                handleStandardYouTube();
            } else if (isYouTubeTV()) {
                handleYouTubeTV();
            }
        }, CHECK_INTERVAL);
    }, 5000);
})();