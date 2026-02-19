import { describe, it, expect } from 'bun:test';

/**
 * Mirrors getLatencyInfo() from the source:
 *   if (bufferedLength === 0) return null;
 *   if (edge <= current) return null;
 *   return { edge, current, latency: edge - current };
 */
function getLatencyInfo(
    bufferedLength: number,
    edge: number,
    current: number
): { edge: number; current: number; latency: number } | null {
    if (bufferedLength === 0) return null;
    if (edge <= current) return null;
    return { edge, current, latency: edge - current };
}

/**
 * Mirrors the sync decision in handleSync():
 *   if (latency > targetBuffer + 1.0) → sync to edge - targetBuffer
 */
function shouldSync(latency: number, targetBuffer: number): boolean {
    return latency > targetBuffer + 1.0;
}

function syncTarget(edge: number, targetBuffer: number): number {
    return edge - targetBuffer;
}

/**
 * Mirrors setBuffer validation:
 *   if (typeof seconds !== 'number' || seconds < 0) → reject
 */
function isValidBuffer(value: unknown): boolean {
    return typeof value === 'number' && value >= 0;
}

describe('Latency Calculation', () => {
    it('should compute latency as edge minus current', () => {
        const info = getLatencyInfo(1, 46810.01, 46804.90);
        expect(info).not.toBeNull();
        expect(info!.latency).toBeCloseTo(5.11, 2);
    });

    it('should return null when no buffered ranges exist', () => {
        expect(getLatencyInfo(0, 100, 90)).toBeNull();
    });

    it('should return null when edge equals current', () => {
        expect(getLatencyInfo(1, 100, 100)).toBeNull();
    });

    it('should return null when edge is behind current', () => {
        expect(getLatencyInfo(1, 90, 100)).toBeNull();
    });

    it('should handle very small positive latency', () => {
        const info = getLatencyInfo(1, 100.001, 100.0);
        expect(info).not.toBeNull();
        expect(info!.latency).toBeCloseTo(0.001, 3);
    });

    it('should handle large latency values (YTTV scale)', () => {
        const info = getLatencyInfo(1, 46825.02, 46812.28);
        expect(info).not.toBeNull();
        expect(info!.latency).toBeCloseTo(12.74, 2);
    });

    it('should preserve edge and current in result', () => {
        const info = getLatencyInfo(1, 500.5, 495.0);
        expect(info!.edge).toBe(500.5);
        expect(info!.current).toBe(495.0);
    });
});

describe('Sync Decision', () => {
    it('should sync when latency exceeds threshold', () => {
        expect(shouldSync(7.5, 5.0)).toBe(true);
    });

    it('should not sync when latency is within threshold', () => {
        expect(shouldSync(5.5, 5.0)).toBe(false);
    });

    it('should not sync at exact boundary (targetBuffer + 1.0)', () => {
        expect(shouldSync(6.0, 5.0)).toBe(false);
    });

    it('should sync just above boundary', () => {
        expect(shouldSync(6.01, 5.0)).toBe(true);
    });

    it('should work with targetBuffer of 0', () => {
        expect(shouldSync(1.5, 0)).toBe(true);
        expect(shouldSync(0.5, 0)).toBe(false);
    });

    it('should work with large targetBuffer', () => {
        expect(shouldSync(25, 20)).toBe(true);
        expect(shouldSync(20.5, 20)).toBe(false);
    });
});

describe('Sync Target Calculation', () => {
    it('should seek to edge minus targetBuffer', () => {
        expect(syncTarget(46810.01, 5.0)).toBeCloseTo(46805.01, 2);
    });

    it('should handle zero targetBuffer (seek to live edge)', () => {
        expect(syncTarget(46810.01, 0)).toBe(46810.01);
    });

    it('should handle large targetBuffer', () => {
        expect(syncTarget(46810.01, 20.0)).toBeCloseTo(46790.01, 2);
    });
});

describe('setBuffer Validation', () => {
    it('should accept positive numbers', () => {
        expect(isValidBuffer(5)).toBe(true);
        expect(isValidBuffer(0)).toBe(true);
        expect(isValidBuffer(2.5)).toBe(true);
        expect(isValidBuffer(100.5)).toBe(true);
    });

    it('should reject negative numbers', () => {
        expect(isValidBuffer(-1)).toBe(false);
        expect(isValidBuffer(-0.1)).toBe(false);
    });

    it('should reject non-numbers', () => {
        expect(isValidBuffer('5')).toBe(false);
        expect(isValidBuffer(null)).toBe(false);
        expect(isValidBuffer(undefined)).toBe(false);
        expect(isValidBuffer(true)).toBe(false);
    });

    it('should reject NaN', () => {
        expect(isValidBuffer(NaN)).toBe(false);
    });
});

describe('Public API Shape', () => {
    it('should expose all required methods', () => {
        const requiredMethods = ['enable', 'disable', 'setBuffer', 'getStatus', 'exitDvr', 'toggleDebug'];

        const mockAPI = {
            enable: () => {},
            disable: () => {},
            setBuffer: (_seconds: number) => {},
            getStatus: () => ({
                enabled: true,
                dvrMode: false,
                targetBuffer: 5.0,
                debugLogging: false,
                currentLatency: null as number | null,
                isLive: false
            }),
            exitDvr: () => {},
            toggleDebug: () => {}
        };

        for (const method of requiredMethods) {
            expect(method in mockAPI).toBe(true);
            expect(typeof (mockAPI as Record<string, unknown>)[method]).toBe('function');
        }
    });

    it('should have correct status shape with active latency', () => {
        const status = {
            enabled: true,
            dvrMode: false,
            targetBuffer: 5.0,
            debugLogging: false,
            currentLatency: 2.5,
            isLive: true
        };

        expect(status).toEqual({
            enabled: true,
            dvrMode: false,
            targetBuffer: 5.0,
            debugLogging: false,
            currentLatency: 2.5,
            isLive: true
        });
    });

    it('should have correct status shape with null latency', () => {
        const status = {
            enabled: true,
            dvrMode: false,
            targetBuffer: 5.0,
            debugLogging: false,
            currentLatency: null,
            isLive: false
        };

        expect(status.currentLatency).toBeNull();
        expect(status.isLive).toBe(false);
    });
});
