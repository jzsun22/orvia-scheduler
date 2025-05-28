import { parseTime, formatTime, timeRangeOverlaps, isTimeInRange } from '../time-utils';
import { TimeRange } from '../../../../supabase/types';

describe('parseTime', () => {
    it('should parse "HH:mm" format correctly', () => {
        const result = parseTime('14:30');
        expect(result.getHours()).toBe(14);
        expect(result.getMinutes()).toBe(30);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
    });

    it('should parse "HH:mm:ss" format correctly, ignoring seconds', () => {
        const result = parseTime('09:05:45');
        expect(result.getHours()).toBe(9);
        expect(result.getMinutes()).toBe(5);
        expect(result.getSeconds()).toBe(0); // Seconds are reset
        expect(result.getMilliseconds()).toBe(0);
    });

    it('should handle time "00:00"', () => {
        const result = parseTime('00:00');
        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
    });

    it('should handle time "23:59"', () => {
        const result = parseTime('23:59');
        expect(result.getHours()).toBe(23);
        expect(result.getMinutes()).toBe(59);
    });

     it('should handle time "00:00:00"', () => {
        const result = parseTime('00:00:00');
        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
    });

    it('should handle time "23:59:59"', () => {
        const result = parseTime('23:59:59');
        expect(result.getHours()).toBe(23);
        expect(result.getMinutes()).toBe(59);
    });

    it('should return a clone when given a Date object', () => {
        const inputDate = new Date();
        inputDate.setHours(10, 15, 20, 30);
        const result = parseTime(inputDate);
        expect(result).not.toBe(inputDate); // Should be a different object
        expect(result).toEqual(inputDate);  // But have the same value
        expect(result.getHours()).toBe(10);
        expect(result.getMinutes()).toBe(15);
        expect(result.getSeconds()).toBe(20); // Keeps original seconds if Date object is input
        expect(result.getMilliseconds()).toBe(30);
    });

    it('should throw error for invalid format (too few parts)', () => {
        expect(() => parseTime('14')).toThrow('Invalid time format: 14. Expected HH:mm or HH:mm:ss');
    });

    it('should throw error for invalid format (too many parts)', () => {
        expect(() => parseTime('14:30:15:10')).toThrow('Invalid time format: 14:30:15:10. Expected HH:mm or HH:mm:ss');
    });

    it('should throw error for invalid hour value', () => {
        expect(() => parseTime('25:30')).toThrow('Invalid time values: 25:30');
    });

    it('should throw error for invalid minute value', () => {
        expect(() => parseTime('14:65')).toThrow('Invalid time values: 14:65');
    });

    it('should throw error for non-numeric parts', () => {
        expect(() => parseTime('abc:def')).toThrow('Invalid time values: abc:def');
    });
});

// TODO: Add tests for formatTime, timeRangeOverlaps, isTimeInRange 