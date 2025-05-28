import '@testing-library/jest-dom';
import {
    Worker,
    ShiftTemplate,
    ScheduledShift,
    ShiftAssignment,
    Location,
    LocationOperatingHours,
    WorkerLocation,
    LocationPosition,
    RecurringShiftAssignment,
    JobLevel,
    DayOfWeek,
    AvailabilityLabel,
    AssignmentType,
    TimeRange,
    compareJobLevels,
    getJobLevelValue
} from '../../types';

describe('Database Interfaces', () => {
    test('Worker interface accepts valid data', () => {
        const worker: Worker = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            first_name: 'John',
            last_name: 'Doe',
            preferred_name: null,
            job_level: 'L1',
            availability: {
                monday: ['morning', 'none'],
                tuesday: ['all_day'],
                wednesday: ['morning', 'afternoon'],
                thursday: ['none'],
                friday: ['morning'],
                saturday: ['all_day'],
                sunday: ['none']
            },
            is_lead: false,
            preferred_hours_per_week: 40,
            created_at: '2024-03-21T00:00:00Z'
        };
        
        expect(worker).toBeDefined();
        expect(worker.job_level).toBe('L1');
        expect(worker.availability.monday).toContain('morning');
    });

    test('ShiftTemplate interface accepts valid data', () => {
        const template: ShiftTemplate = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            days_of_week: ['monday', 'tuesday', 'wednesday'],
            start_time: '09:00:00',
            end_time: '17:00:00',
            position_id: '123e4567-e89b-12d3-a456-426614174001',
            location_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
        };
        
        expect(template).toBeDefined();
        expect(template.days_of_week).toContain('monday');
        expect(template.start_time).toBe('09:00:00');
        expect(template.location_id).toBe('a1b2c3d4-e5f6-7890-1234-567890abcdef');
    });

    test('ScheduledShift interface accepts valid data', () => {
        const shift: ScheduledShift = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            template_id: '123e4567-e89b-12d3-a456-426614174001',
            worker_id: '123e4567-e89b-12d3-a456-426614174002',
            shift_date: '2024-03-21',
            location_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
            position_id: '123e4567-e89b-12d3-a456-426614174001',
            created_at: '2024-03-21T00:00:00Z',
            start_time: '09:00:00',
            end_time: '17:00:00',
            is_recurring_generated: true
        };
        
        expect(shift).toBeDefined();
        expect(shift.is_recurring_generated).toBe(true);
    });

    test('ShiftAssignment interface accepts valid data', () => {
        const assignment: ShiftAssignment = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            scheduled_shift_id: '123e4567-e89b-12d3-a456-426614174001',
            worker_id: '123e4567-e89b-12d3-a456-426614174002',
            assignment_type: 'lead',
            assigned_start: '09:00:00',
            assigned_end: '17:00:00',
            is_manual_override: false,
            created_at: '2024-03-21T00:00:00Z'
        };
        
        expect(assignment).toBeDefined();
        expect(assignment.assignment_type).toBe('lead');
    });

    test('Location interface accepts valid data', () => {
        const location: Location = {
            id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
            name: 'Sunnyvale'
        };
        expect(location).toBeDefined();
        expect(location.name).toBe('Sunnyvale');
    });

    test('LocationOperatingHours interface accepts valid data', () => {
        const hours: LocationOperatingHours = {
            id: 'b2c3d4e5-f6a7-8901-2345-678901bcdefa',
            location_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
            day_of_week: 'monday',
            day_start: '08:00:00',
            day_end: '22:00:00',
            morning_cutoff: '12:00:00'
        };
        expect(hours).toBeDefined();
        expect(hours.day_of_week).toBe('monday');
        expect(hours.morning_cutoff).toBe('12:00:00');
    });

    test('WorkerLocation interface accepts valid data', () => {
        const workerLocation: WorkerLocation = {
            id: 'c3d4e5f6-a7b8-9012-3456-789012cdefab',
            worker_id: '123e4567-e89b-12d3-a456-426614174000',
            location_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
        };
        expect(workerLocation).toBeDefined();
        expect(workerLocation.worker_id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    test('LocationPosition interface accepts valid data', () => {
        const locationPosition: LocationPosition = {
            id: 'd4e5f6a7-b8c9-0123-4567-890123defabc',
            location_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
            position_id: '123e4567-e89b-12d3-a456-426614174001'
        };
        expect(locationPosition).toBeDefined();
        expect(locationPosition.position_id).toBe('123e4567-e89b-12d3-a456-426614174001');
    });

    test('RecurringShiftAssignment interface accepts valid data', () => {
        const recurring: RecurringShiftAssignment = {
            id: 'e5f6a7b8-c9d0-1234-5678-901234efabcd',
            worker_id: '123e4567-e89b-12d3-a456-426614174000',
            position_id: '123e4567-e89b-12d3-a456-426614174001',
            location_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
            day_of_week: 'friday',
            start_time: '10:00:00',
            end_time: '18:00:00',
            assignment_type: 'regular',
            created_at: '2024-03-21T00:00:00Z'
        };
        expect(recurring).toBeDefined();
        expect(recurring.day_of_week).toBe('friday');
        expect(recurring.location_id).toBe('a1b2c3d4-e5f6-7890-1234-567890abcdef');
    });
});

describe('Type Constraints', () => {
    test('JobLevel only accepts valid levels', () => {
        const validLevels: JobLevel[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];
        validLevels.forEach(level => {
            expect(() => getJobLevelValue(level)).not.toThrow();
        });
    });

    test('DayOfWeek contains all required days', () => {
        const days: DayOfWeek[] = [
            'monday', 'tuesday', 'wednesday', 'thursday',
            'friday', 'saturday', 'sunday'
        ];
        const template: ShiftTemplate = {
            id: '123',
            days_of_week: days,
            start_time: '09:00:00',
            end_time: '17:00:00',
            position_id: '123',
            location_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
        };
        expect(template.days_of_week).toHaveLength(7);
    });

    test('AvailabilityLabel only accepts valid values', () => {
        const validLabels: AvailabilityLabel[] = ['none', 'morning', 'afternoon', 'all_day'];
        const worker: Worker = {
            id: '123',
            first_name: 'John',
            last_name: 'Doe',
            preferred_name: null,
            job_level: 'L1',
            availability: {
                monday: validLabels,
                tuesday: ['all_day'],
                wednesday: ['morning'],
                thursday: ['none'],
                friday: ['afternoon'],
                saturday: ['all_day'],
                sunday: ['none']
            },
            is_lead: false,
            preferred_hours_per_week: null,
            created_at: '2024-03-21T00:00:00Z'
        };
        expect(worker.availability.monday).toEqual(expect.arrayContaining(validLabels));
    });

    test('AssignmentType only accepts valid values', () => {
        const validTypes: AssignmentType[] = ['lead', 'training', 'regular'];
        validTypes.forEach(type => {
            const assignment: ShiftAssignment = {
                id: '123',
                scheduled_shift_id: '456',
                worker_id: '789',
                assignment_type: type,
                assigned_start: null,
                assigned_end: null,
                is_manual_override: false,
                created_at: '2024-03-21T00:00:00Z'
            };
            expect(assignment.assignment_type).toBe(type);
        });
    });
});

describe('Job Level Utilities', () => {
    test('compareJobLevels works correctly', () => {
        expect(compareJobLevels('L1', 'L2')).toBeLessThan(0);
        expect(compareJobLevels('L2', 'L1')).toBeGreaterThan(0);
        expect(compareJobLevels('L3', 'L3')).toBe(0);
        expect(compareJobLevels('L7', 'L1')).toBeGreaterThan(0);
    });

    test('getJobLevelValue returns correct values', () => {
        expect(getJobLevelValue('L1')).toBe(1);
        expect(getJobLevelValue('L4')).toBe(4);
        expect(getJobLevelValue('L7')).toBe(7);
    });
});

describe('Time Format Validation', () => {
    test('TimeRange accepts valid time strings', () => {
        const validRanges: TimeRange[] = [
            { start_time: '09:00:00', end_time: '17:00:00' },
            { start_time: '00:00:00', end_time: '23:59:59' },
            { start_time: '12:30:00', end_time: '13:30:00' }
        ];
        
        validRanges.forEach(range => {
            expect(range.start_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
            expect(range.end_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        });
    });
}); 