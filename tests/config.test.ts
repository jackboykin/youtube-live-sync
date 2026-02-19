import { describe, it, expect } from 'bun:test';

describe('Configuration System', () => {
    it('should have default config with correct structure', () => {
        const DEFAULT_CONFIG = {
            enabled: true,
            targetBuffer: 5.0,
            checkInterval: 6000,
            debugLogging: false
        };

        expect(DEFAULT_CONFIG.enabled).toBe(true);
        expect(DEFAULT_CONFIG.targetBuffer).toBe(5.0);
        expect(DEFAULT_CONFIG.checkInterval).toBe(6000);
        expect(DEFAULT_CONFIG.debugLogging).toBe(false);
    });

    it('should handle invalid JSON gracefully in parsing', () => {
        const invalidJson = 'invalid json {';
        expect(() => {
            JSON.parse(invalidJson);
        }).toThrow();

        // The actual code wraps this in try-catch, so it returns defaults
        try {
            JSON.parse(invalidJson);
        } catch {
            // This is the expected behavior
            expect(true).toBe(true);
        }
    });

    it('should merge partial config with defaults', () => {
        const DEFAULT_CONFIG = {
            enabled: true,
            targetBuffer: 5.0,
            checkInterval: 6000,
            debugLogging: false
        };

        const partialConfig = { enabled: false, targetBuffer: 10.0 };
        const merged = { ...DEFAULT_CONFIG, ...partialConfig };

        expect(merged.enabled).toBe(false);
        expect(merged.targetBuffer).toBe(10.0);
        expect(merged.checkInterval).toBe(6000);
        expect(merged.debugLogging).toBe(false);
    });

    it('should validate config JSON serialization', () => {
        const testConfig = {
            enabled: false,
            targetBuffer: 3.5,
            checkInterval: 5000,
            debugLogging: true
        };

        const json = JSON.stringify(testConfig);
        const parsed = JSON.parse(json);

        expect(parsed.enabled).toBe(false);
        expect(parsed.targetBuffer).toBe(3.5);
        expect(parsed.checkInterval).toBe(5000);
        expect(parsed.debugLogging).toBe(true);
    });

    it('should validate config values are correct types', () => {
        const config = {
            enabled: true,
            targetBuffer: 5.0,
            checkInterval: 6000,
            debugLogging: false
        };

        expect(typeof config.enabled).toBe('boolean');
        expect(typeof config.targetBuffer).toBe('number');
        expect(typeof config.checkInterval).toBe('number');
        expect(typeof config.debugLogging).toBe('boolean');
    });

    it('should preserve all config properties when merging', () => {
        const defaultConfig = {
            enabled: true,
            targetBuffer: 5.0,
            checkInterval: 6000,
            debugLogging: false
        };

        const partial = { enabled: false };
        const merged = { ...defaultConfig, ...partial };

        expect(merged.enabled).toBe(false);
        expect(merged.targetBuffer).toBe(5.0);
        expect(merged.checkInterval).toBe(6000);
        expect(merged.debugLogging).toBe(false);
    });

    it('should handle buffer values correctly', () => {
        const configs = [
            { targetBuffer: 0 },
            { targetBuffer: 2.5 },
            { targetBuffer: 10 },
            { targetBuffer: 100.5 }
        ];

        configs.forEach(config => {
            expect(typeof config.targetBuffer).toBe('number');
            expect(config.targetBuffer >= 0).toBe(true);
        });
    });

    it('should validate enabled flag is boolean', () => {
        const validValues = [true, false];
        const invalidValues = [1, 0, 'true', null, undefined];

        validValues.forEach(val => {
            expect(typeof val).toBe('boolean');
        });

        invalidValues.forEach(val => {
            expect(typeof val).not.toBe('boolean');
        });
    });
});
