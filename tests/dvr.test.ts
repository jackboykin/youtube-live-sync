import { describe, it, expect } from 'bun:test';

/**
 * Mirrors the seeking + seeked DVR detection from the source:
 *
 * onSeeking: seekStartTime = lastKnownTime
 * onSeeked:
 *   if (now - lastSyncTime < 1000) → ignore (our own sync)
 *   jumpBack = seekStartTime - currentTime
 *   if (jumpBack > 5) → dvrModeActive = true
 */
function detectDvr(
    lastKnownTime: number,
    seekTargetTime: number,
    msSinceLastSync: number
): { dvrActivated: boolean; jumpBack: number } {
    // Ignore seeks within 1s of our own sync
    if (msSinceLastSync < 1000) {
        return { dvrActivated: false, jumpBack: 0 };
    }

    const jumpBack = lastKnownTime - seekTargetTime;
    return {
        dvrActivated: jumpBack > 5,
        jumpBack
    };
}

/**
 * Mirrors DVR auto-exit logic in handleSync():
 *   if (dvrModeActive && latency <= targetBuffer + 1.0) → exit DVR
 *   if (dvrModeActive && latency > targetBuffer + 1.0) → stay in DVR, skip sync
 */
function dvrSyncDecision(
    dvrModeActive: boolean,
    latency: number | null,
    targetBuffer: number
): { action: 'sync-check' | 'dvr-exit-then-sync-check' | 'dvr-skip'; dvrModeActive: boolean } {
    if (!dvrModeActive) {
        return { action: 'sync-check', dvrModeActive: false };
    }

    if (latency !== null && latency <= targetBuffer + 1.0) {
        return { action: 'dvr-exit-then-sync-check', dvrModeActive: false };
    }

    return { action: 'dvr-skip', dvrModeActive: true };
}

describe('DVR Detection (seeking + seeked)', () => {
    it('should activate DVR on large backward jump', () => {
        // User drags scrubber back 30 seconds
        const result = detectDvr(100, 70, 5000);
        expect(result.dvrActivated).toBe(true);
        expect(result.jumpBack).toBe(30);
    });

    it('should activate DVR on jump back just over 5s', () => {
        const result = detectDvr(100, 94.9, 5000);
        expect(result.dvrActivated).toBe(true);
    });

    it('should NOT activate DVR on jump back of exactly 5s', () => {
        const result = detectDvr(100, 95, 5000);
        expect(result.dvrActivated).toBe(false);
        expect(result.jumpBack).toBe(5);
    });

    it('should NOT activate DVR on small backward jump', () => {
        // Small backward jump (e.g. user clicked back a few seconds)
        const result = detectDvr(100, 97, 5000);
        expect(result.dvrActivated).toBe(false);
        expect(result.jumpBack).toBe(3);
    });

    it('should NOT activate DVR on forward seek', () => {
        // User seeks forward toward live edge
        const result = detectDvr(100, 110, 5000);
        expect(result.dvrActivated).toBe(false);
        expect(result.jumpBack).toBe(-10);
    });

    it('should NOT activate DVR on seek to same position', () => {
        const result = detectDvr(100, 100, 5000);
        expect(result.dvrActivated).toBe(false);
        expect(result.jumpBack).toBe(0);
    });

    it('should ignore seek within sync grace period', () => {
        // Our sync just set currentTime — seeked fires within 1s
        const result = detectDvr(100, 50, 500);
        expect(result.dvrActivated).toBe(false);
    });

    it('should ignore seek at exactly 1s after sync', () => {
        // Boundary: < 1000ms means ignore, so exactly 999ms is ignored
        const result = detectDvr(100, 50, 999);
        expect(result.dvrActivated).toBe(false);
    });

    it('should detect seek at 1s after sync', () => {
        // 1000ms is NOT < 1000, so it should be evaluated
        const result = detectDvr(100, 50, 1000);
        expect(result.dvrActivated).toBe(true);
    });

    it('should NOT activate DVR on internal MSE buffer seek (small jump)', () => {
        // YTTV fires seeked events for internal buffer management
        // These are typically tiny or forward jumps
        const result = detectDvr(46800, 46799.5, 5000);
        expect(result.dvrActivated).toBe(false);
        expect(result.jumpBack).toBeCloseTo(0.5, 1);
    });

    it('should handle YTTV-scale timestamps', () => {
        // Real YTTV timestamps are in the tens of thousands
        const result = detectDvr(46820, 46780, 5000);
        expect(result.dvrActivated).toBe(true);
        expect(result.jumpBack).toBe(40);
    });
});

describe('DVR Auto-Exit', () => {
    it('should exit DVR when latency drops near live edge', () => {
        const result = dvrSyncDecision(true, 5.5, 5.0);
        expect(result.action).toBe('dvr-exit-then-sync-check');
        expect(result.dvrModeActive).toBe(false);
    });

    it('should exit DVR at exactly targetBuffer + 1.0', () => {
        const result = dvrSyncDecision(true, 6.0, 5.0);
        expect(result.action).toBe('dvr-exit-then-sync-check');
        expect(result.dvrModeActive).toBe(false);
    });

    it('should stay in DVR when latency is above threshold', () => {
        const result = dvrSyncDecision(true, 8.0, 5.0);
        expect(result.action).toBe('dvr-skip');
        expect(result.dvrModeActive).toBe(true);
    });

    it('should stay in DVR just above threshold', () => {
        const result = dvrSyncDecision(true, 6.01, 5.0);
        expect(result.action).toBe('dvr-skip');
        expect(result.dvrModeActive).toBe(true);
    });

    it('should stay in DVR when latency info is null', () => {
        const result = dvrSyncDecision(true, null, 5.0);
        expect(result.action).toBe('dvr-skip');
        expect(result.dvrModeActive).toBe(true);
    });

    it('should proceed to sync check when DVR is not active', () => {
        const result = dvrSyncDecision(false, 12.0, 5.0);
        expect(result.action).toBe('sync-check');
        expect(result.dvrModeActive).toBe(false);
    });

    it('should proceed to sync check when DVR is off and latency is low', () => {
        const result = dvrSyncDecision(false, 3.0, 5.0);
        expect(result.action).toBe('sync-check');
        expect(result.dvrModeActive).toBe(false);
    });
});

describe('DVR Full Scenarios', () => {
    it('should handle: user rewinds → DVR blocks sync → user returns to live edge → DVR exits', () => {
        // Step 1: User rewinds 30 seconds
        const seek = detectDvr(46820, 46790, 5000);
        expect(seek.dvrActivated).toBe(true);

        // Step 2: Sync loop runs — DVR is active, latency is high → skip
        const tick1 = dvrSyncDecision(true, 35.0, 5.0);
        expect(tick1.action).toBe('dvr-skip');

        // Step 3: User clicks "live" button, latency drops → DVR exits
        const tick2 = dvrSyncDecision(true, 4.0, 5.0);
        expect(tick2.action).toBe('dvr-exit-then-sync-check');
        expect(tick2.dvrModeActive).toBe(false);
    });

    it('should handle: our sync fires → seeked ignored → no DVR activation', () => {
        // Our sync just fired (200ms ago)
        const seek = detectDvr(46820, 46815, 200);
        expect(seek.dvrActivated).toBe(false);
    });

    it('should handle: internal MSE seek during high latency → no DVR', () => {
        // YTTV MSE player fires a small internal seek while latency is 12s
        // The old broken logic would activate DVR here based on latency alone
        // The correct logic only checks the jump distance
        const seek = detectDvr(46800, 46799, 5000);
        expect(seek.dvrActivated).toBe(false);
    });
});
