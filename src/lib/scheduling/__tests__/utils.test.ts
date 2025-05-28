import { getWeekDateRange, mapDayOfWeekToDate } from '../utils';
import { DayOfWeek } from '../../../../supabase/types';

describe('getWeekDateRange', () => {
    it('should return the correct Monday-Sunday range for a Monday input', () => {
        const monday = new Date('2024-07-22T10:00:00.000Z'); // A Monday
        const expectedRange = [
            new Date('2024-07-22T00:00:00.000Z'),
            new Date('2024-07-23T00:00:00.000Z'),
            new Date('2024-07-24T00:00:00.000Z'),
            new Date('2024-07-25T00:00:00.000Z'),
            new Date('2024-07-26T00:00:00.000Z'),
            new Date('2024-07-27T00:00:00.000Z'),
            new Date('2024-07-28T00:00:00.000Z'),
        ];
        const result = getWeekDateRange(monday);
        expect(result).toEqual(expectedRange);
        expect(result.length).toBe(7);
        expect(result[0].getUTCDay()).toBe(1); // Monday check
        expect(result[6].getUTCDay()).toBe(0); // Sunday check
    });

    it('should return the correct Monday-Sunday range for a Sunday input', () => {
        const sunday = new Date('2024-07-28T15:30:00.000Z'); // A Sunday
        const expectedRange = [
            new Date('2024-07-22T00:00:00.000Z'), // Monday
            new Date('2024-07-23T00:00:00.000Z'),
            new Date('2024-07-24T00:00:00.000Z'),
            new Date('2024-07-25T00:00:00.000Z'),
            new Date('2024-07-26T00:00:00.000Z'),
            new Date('2024-07-27T00:00:00.000Z'),
            new Date('2024-07-28T00:00:00.000Z'), // Sunday
        ];
        const result = getWeekDateRange(sunday);
        expect(result).toEqual(expectedRange);
        expect(result.length).toBe(7);
        expect(result[0].getUTCDay()).toBe(1);
        expect(result[6].getUTCDay()).toBe(0);
    });

    it('should return the correct Monday-Sunday range for a Wednesday input', () => {
        const wednesday = new Date('2024-07-24T08:00:00.000Z'); // A Wednesday
        const expectedRange = [
            new Date('2024-07-22T00:00:00.000Z'),
            new Date('2024-07-23T00:00:00.000Z'),
            new Date('2024-07-24T00:00:00.000Z'),
            new Date('2024-07-25T00:00:00.000Z'),
            new Date('2024-07-26T00:00:00.000Z'),
            new Date('2024-07-27T00:00:00.000Z'),
            new Date('2024-07-28T00:00:00.000Z'),
        ];
        const result = getWeekDateRange(wednesday);
        expect(result).toEqual(expectedRange);
        expect(result.length).toBe(7);
    });

    it('should handle week crossing a month boundary', () => {
        const dateInWeek = new Date('2024-08-01T12:00:00.000Z'); // Thursday, Aug 1st
        const expectedRange = [
            new Date('2024-07-29T00:00:00.000Z'), // Monday, July 29th
            new Date('2024-07-30T00:00:00.000Z'),
            new Date('2024-07-31T00:00:00.000Z'),
            new Date('2024-08-01T00:00:00.000Z'),
            new Date('2024-08-02T00:00:00.000Z'),
            new Date('2024-08-03T00:00:00.000Z'),
            new Date('2024-08-04T00:00:00.000Z'), // Sunday, Aug 4th
        ];
        const result = getWeekDateRange(dateInWeek);
        expect(result).toEqual(expectedRange);
        expect(result.length).toBe(7);
    });

     it('should handle week crossing a year boundary', () => {
        const dateInWeek = new Date('2024-01-02T12:00:00.000Z'); // Tuesday, Jan 2nd 2024
        const expectedRange = [
            new Date('2024-01-01T00:00:00.000Z'), // Monday, Jan 1st 2024
            new Date('2024-01-02T00:00:00.000Z'),
            new Date('2024-01-03T00:00:00.000Z'),
            new Date('2024-01-04T00:00:00.000Z'),
            new Date('2024-01-05T00:00:00.000Z'),
            new Date('2024-01-06T00:00:00.000Z'),
            new Date('2024-01-07T00:00:00.000Z'), // Sunday, Jan 7th 2024
        ];
        const result = getWeekDateRange(dateInWeek);
        expect(result).toEqual(expectedRange);
        expect(result.length).toBe(7);
    });

     it('should handle week crossing a year boundary (end of year)', () => {
        const dateInWeek = new Date('2023-12-31T12:00:00.000Z'); // Sunday, Dec 31st 2023
        const expectedRange = [
            new Date('2023-12-25T00:00:00.000Z'), // Monday, Dec 25th 2023
            new Date('2023-12-26T00:00:00.000Z'),
            new Date('2023-12-27T00:00:00.000Z'),
            new Date('2023-12-28T00:00:00.000Z'),
            new Date('2023-12-29T00:00:00.000Z'),
            new Date('2023-12-30T00:00:00.000Z'),
            new Date('2023-12-31T00:00:00.000Z'), // Sunday, Dec 31st 2023
        ];
        const result = getWeekDateRange(dateInWeek);
        expect(result).toEqual(expectedRange);
        expect(result.length).toBe(7);
    });

    it('should ensure all dates have time set to 00:00:00.000', () => {
        const dateInWeek = new Date('2024-07-25T14:35:12.123Z'); // Thursday
        const result = getWeekDateRange(dateInWeek);
        result.forEach(date => {
            expect(date.getUTCHours()).toBe(0);
            expect(date.getUTCMinutes()).toBe(0);
            expect(date.getUTCSeconds()).toBe(0);
            expect(date.getUTCMilliseconds()).toBe(0);
        });
    });
});

describe('mapDayOfWeekToDate', () => {
    // Use a fixed week range for consistent testing
    const weekDates = [
        new Date('2024-07-22T00:00:00.000Z'), // Mon
        new Date('2024-07-23T00:00:00.000Z'), // Tue
        new Date('2024-07-24T00:00:00.000Z'), // Wed
        new Date('2024-07-25T00:00:00.000Z'), // Thu
        new Date('2024-07-26T00:00:00.000Z'), // Fri
        new Date('2024-07-27T00:00:00.000Z'), // Sat
        new Date('2024-07-28T00:00:00.000Z'), // Sun
    ];

    it('should map "monday" to the first date', () => {
        expect(mapDayOfWeekToDate('monday', weekDates)).toEqual(weekDates[0]);
    });

    it('should map "wednesday" to the third date', () => {
        expect(mapDayOfWeekToDate('wednesday', weekDates)).toEqual(weekDates[2]);
    });

    it('should map "sunday" to the last date', () => {
        expect(mapDayOfWeekToDate('sunday', weekDates)).toEqual(weekDates[6]);
    });

    it('should throw error for weekDates array with less than 7 dates', () => {
        const shortWeekDates = weekDates.slice(0, 6);
        expect(() => mapDayOfWeekToDate('monday', shortWeekDates))
            .toThrow('weekDates array must contain exactly 7 Date objects.');
    });

    it('should throw error for weekDates array with more than 7 dates', () => {
        const longWeekDates = [...weekDates, new Date()];
        expect(() => mapDayOfWeekToDate('monday', longWeekDates))
            .toThrow('weekDates array must contain exactly 7 Date objects.');
    });

    it('should throw error for invalid DayOfWeek string', () => {
        // Use type assertion to bypass TypeScript check for the test
        const invalidDay = 'funday' as DayOfWeek; 
        expect(() => mapDayOfWeekToDate(invalidDay, weekDates))
            .toThrow('Invalid DayOfWeek string: funday');
    });
}); 