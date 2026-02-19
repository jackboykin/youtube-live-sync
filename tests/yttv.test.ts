import { describe, it, expect } from 'bun:test';

const YTTV_LIVE_DURATION_THRESHOLD = 21600; // 6 hours in seconds

/**
 * Mirrors the YTTV branch of isLiveContent():
 *   return !!video && video.duration > 21600;
 */
function isYTTVLive(duration: number | null): boolean {
    if (duration === null) return false;
    return duration > YTTV_LIVE_DURATION_THRESHOLD;
}

describe('YTTV Live Detection (duration threshold)', () => {
    it('should detect YTTV live stream with typical DVR duration (~14h)', () => {
        // Real observed value from YTTV live stream
        expect(isYTTVLive(50390.10291156499)).toBe(true);
    });

    it('should detect YTTV live stream with ~7h duration', () => {
        expect(isYTTVLive(25200)).toBe(true);
    });

    it('should NOT detect a 2-hour VOD as live', () => {
        expect(isYTTVLive(7200)).toBe(false);
    });

    it('should NOT detect a 3-hour movie as live', () => {
        expect(isYTTVLive(10800)).toBe(false);
    });

    it('should NOT detect a 5-hour VOD as live', () => {
        expect(isYTTVLive(18000)).toBe(false);
    });

    it('should NOT detect a 6-hour VOD as live (boundary)', () => {
        expect(isYTTVLive(21600)).toBe(false);
    });

    it('should detect content just over the threshold as live', () => {
        expect(isYTTVLive(21601)).toBe(true);
    });

    it('should NOT detect null/missing video as live', () => {
        expect(isYTTVLive(null)).toBe(false);
    });

    it('should NOT detect NaN duration as live', () => {
        expect(isYTTVLive(NaN)).toBe(false);
    });

    it('should handle Infinity duration as live', () => {
        // Spec-compliant live streams that DO report Infinity
        expect(isYTTVLive(Infinity)).toBe(true);
    });
});

describe('Sync Cooldown', () => {
    /**
     * Mirrors the sync decision + cooldown logic from handleSync():
     *
     *   if (latency > targetBuffer + 1.0) {
     *       if (syncCooldown) { syncCooldown = false; return 'cooldown'; }
     *       syncCooldown = true; return 'synced';
     *   }
     *   return 'no-sync';
     */
    function simulateSyncTick(
        latency: number,
        targetBuffer: number,
        syncCooldown: boolean
    ): { action: 'synced' | 'cooldown' | 'no-sync'; syncCooldown: boolean } {
        const threshold = 1.0;
        if (latency > targetBuffer + threshold) {
            if (syncCooldown) {
                return { action: 'cooldown', syncCooldown: false };
            }
            return { action: 'synced', syncCooldown: true };
        }
        return { action: 'no-sync', syncCooldown: false };
    }

    it('should sync on first tick with high latency', () => {
        const result = simulateSyncTick(12.74, 5.0, false);
        expect(result.action).toBe('synced');
        expect(result.syncCooldown).toBe(true);
    });

    it('should cooldown on second tick if latency still high', () => {
        // Simulates: tick 1 synced (cooldown=true), tick 2 latency still high
        const result = simulateSyncTick(15.66, 5.0, true);
        expect(result.action).toBe('cooldown');
        expect(result.syncCooldown).toBe(false);
    });

    it('should allow re-sync on third tick after cooldown clears', () => {
        // Simulates: tick 3, cooldown was cleared on tick 2, latency still high
        const result = simulateSyncTick(9.30, 5.0, false);
        expect(result.action).toBe('synced');
        expect(result.syncCooldown).toBe(true);
    });

    it('should not sync when latency is within threshold', () => {
        const result = simulateSyncTick(4.29, 5.0, false);
        expect(result.action).toBe('no-sync');
    });

    it('should clear cooldown when latency drops below threshold', () => {
        // Synced on previous tick, but latency settled by next tick
        const result = simulateSyncTick(5.5, 5.0, true);
        expect(result.action).toBe('no-sync');
        expect(result.syncCooldown).toBe(false);
    });

    it('should reproduce the full 4-tick YTTV pattern', () => {
        // Real observed latency sequence from YTTV logs
        const latencies = [12.74, 15.66, 9.30, 4.29];
        const expected: Array<'synced' | 'cooldown' | 'no-sync'> = ['synced', 'cooldown', 'synced', 'no-sync'];

        let cooldown = false;
        for (let i = 0; i < latencies.length; i++) {
            const result = simulateSyncTick(latencies[i]!, 5.0, cooldown);
            expect(result.action).toBe(expected[i]!);
            cooldown = result.syncCooldown;
        }
    });

    it('should not sync at exact threshold boundary', () => {
        // latency === targetBuffer + threshold exactly — should NOT sync
        const result = simulateSyncTick(6.0, 5.0, false);
        expect(result.action).toBe('no-sync');
    });

    it('should not have stale cooldown after latency settles then drifts back', () => {
        // Regression: cooldown flag from an old sync must not block a
        // legitimate sync after latency was fine for several ticks.
        // Real YTTV pattern: sync → settle for 3 ticks → natural drift above threshold
        const latencies = [13.08, 5.11, 4.14, 3.97, 7.10];
        const expected: Array<'synced' | 'cooldown' | 'no-sync'> =
            ['synced', 'no-sync', 'no-sync', 'no-sync', 'synced'];

        let cooldown = false;
        for (let i = 0; i < latencies.length; i++) {
            const result = simulateSyncTick(latencies[i]!, 5.0, cooldown);
            expect(result.action).toBe(expected[i]!);
            cooldown = result.syncCooldown;
        }
    });
});
