import { saveSchedule } from '../dataSaver';
import { supabase } from '../../../../supabase/supabase'; // Import the actual instance
import { ScheduledShift, ShiftAssignment } from '../../../../supabase/types';
import { formatDateToYYYYMMDD } from '../utils';

// Mock the entire supabase module
jest.mock('../../supabase');

// --- Define Mocks --- 
// Mocks for filters returning `this` (the builder)
const mockEq = jest.fn();
const mockLt = jest.fn();
const mockGte = jest.fn();
const mockLte = jest.fn();
// Mock for the final async operation triggered by awaiting the delete chain
const mockDeleteAsync = jest.fn();
// Mock for the insert operation
const mockInsertAsync = jest.fn();
// Mock for the .from() call
const mockFrom = jest.fn();

// Cast the mocked supabase client for TypeScript
const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

// Helper function (keep as is)
const getTestWeekDates = (startDate: string): Date[] => {
    const start = new Date(startDate + 'T00:00:00.000Z');
    return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(start.getTime());
        date.setUTCDate(start.getUTCDate() + i);
        return date;
    });
};

describe('saveSchedule', () => {
    let sampleShifts: Partial<ScheduledShift>[];
    let sampleAssignments: Partial<ShiftAssignment>[];
    let locationId: string;
    let weekDates: Date[];
    let startDateString: string;
    let endDateString: string;
    let cutoffDateString: string;

    beforeEach(() => {
        // --- Reset all mocks --- 
        jest.clearAllMocks();
        mockEq.mockReset();
        mockLt.mockReset();
        mockGte.mockReset();
        mockLte.mockReset();
        mockDeleteAsync.mockReset();
        mockInsertAsync.mockReset();
        mockFrom.mockReset();

        // --- Configure Mocks --- 
        // Configure the async results (default success)
        mockDeleteAsync.mockResolvedValue({ error: null });
        mockInsertAsync.mockResolvedValue({ error: null });

        // Configure the builder object that .delete() returns
        const deleteBuilder = {
            eq: mockEq,
            lt: mockLt,
            gte: mockGte,
            lte: mockLte,
            // Make the builder awaitable/thenable
            then: jest.fn((resolve, reject) => mockDeleteAsync().then(resolve, reject)),
            catch: jest.fn((reject) => mockDeleteAsync().catch(reject))
        };

        // Configure filter mocks to return the builder for chaining
        mockEq.mockReturnValue(deleteBuilder);
        mockLt.mockReturnValue(deleteBuilder);
        mockGte.mockReturnValue(deleteBuilder);
        mockLte.mockReturnValue(deleteBuilder);

        // Configure mockFrom
        mockFrom.mockReturnValue({
            delete: jest.fn().mockReturnValue(deleteBuilder),
            insert: mockInsertAsync // Insert directly returns the promise
        });
        mockedSupabase.from = mockFrom; // Assign mock implementation

        // --- Setup default test data --- 
        locationId = 'loc-123';
        weekDates = getTestWeekDates('2024-08-05');
        startDateString = '2024-08-05';
        endDateString = '2024-08-11';
        const cutoffDate = new Date(weekDates[0].getTime());
        cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 28);
        cutoffDateString = formatDateToYYYYMMDD(cutoffDate);
        sampleShifts = [
            { id: 's1', shift_date: '2024-08-05', location_id: locationId, template_id: 't1', worker_id: 'w1', start_time: '09:00', end_time: '17:00', created_at: 'some-iso-string' },
            { id: 's2', shift_date: '2024-08-06', location_id: locationId, template_id: 't2', worker_id: 'w2', start_time: '10:00', end_time: '18:00', created_at: 'some-iso-string' },
        ];
        sampleAssignments = [
            { id: 'a1', scheduled_shift_id: 's1', worker_id: 'w1', assignment_type: 'regular', created_at: 'some-iso-string' },
            { id: 'a2', scheduled_shift_id: 's2', worker_id: 'w2', assignment_type: 'regular', created_at: 'some-iso-string' },
        ];
    });

    // --- Test cases --- 

    it('should call delete for old shifts and target week shifts, then insert new data', async () => {
        await saveSchedule(sampleShifts as ScheduledShift[], sampleAssignments as ShiftAssignment[], locationId, weekDates);

        // Check .from() calls
        expect(mockFrom).toHaveBeenCalledWith('scheduled_shifts'); // Called for delete old, delete week, insert shifts
        expect(mockFrom).toHaveBeenCalledWith('shift_assignments'); // Called for insert assignments
        expect(mockFrom).toHaveBeenCalledTimes(4); 

        // Check delete chain filters
        expect(mockEq).toHaveBeenCalledWith('location_id', locationId); // Called twice
        expect(mockLt).toHaveBeenCalledWith('shift_date', cutoffDateString); // Called once
        expect(mockGte).toHaveBeenCalledWith('shift_date', startDateString); // Called once
        expect(mockLte).toHaveBeenCalledWith('shift_date', endDateString); // Called once

        // Check that the delete operation was awaited twice
        expect(mockDeleteAsync).toHaveBeenCalledTimes(2);

        // Check insert calls
        const expectedPreparedShifts = sampleShifts.map(({ id, created_at, ...rest }) => rest);
        const expectedPreparedAssignments = sampleAssignments.map(({ id, created_at, ...rest }) => rest);
        expect(mockInsertAsync).toHaveBeenNthCalledWith(1, expectedPreparedShifts); // First call is shifts
        expect(mockInsertAsync).toHaveBeenNthCalledWith(2, expectedPreparedAssignments); // Second call is assignments
        expect(mockInsertAsync).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during old shift deletion', async () => {
        const deleteError = new Error('DB delete old failed');
        mockDeleteAsync.mockRejectedValueOnce(deleteError); 

        // Expect the underlying error message directly
        await expect(saveSchedule(sampleShifts as ScheduledShift[], sampleAssignments as ShiftAssignment[], locationId, weekDates))
            .rejects.toThrow(deleteError.message);
        
        expect(mockInsertAsync).not.toHaveBeenCalled(); 
        expect(mockDeleteAsync).toHaveBeenCalledTimes(1); 
    });

    it('should handle errors during target week shift deletion', async () => {
        const deleteError = new Error('DB delete week failed');
        mockDeleteAsync.mockResolvedValueOnce({ error: null }) 
                       .mockRejectedValueOnce(deleteError);  

        // Expect the underlying error message directly
        await expect(saveSchedule(sampleShifts as ScheduledShift[], sampleAssignments as ShiftAssignment[], locationId, weekDates))
            .rejects.toThrow(deleteError.message);
        
        expect(mockInsertAsync).not.toHaveBeenCalled();
        expect(mockDeleteAsync).toHaveBeenCalledTimes(2); 
    });

     it('should handle errors during shift insertion', async () => {
        const insertError = new Error('DB insert shifts failed');
        mockInsertAsync.mockRejectedValueOnce(insertError);

        // Expect the underlying error message directly
        await expect(saveSchedule(sampleShifts as ScheduledShift[], sampleAssignments as ShiftAssignment[], locationId, weekDates))
            .rejects.toThrow(insertError.message);
        
        expect(mockDeleteAsync).toHaveBeenCalledTimes(2); 
        expect(mockInsertAsync).toHaveBeenCalledTimes(1); 
    });

     it('should handle errors during assignment insertion', async () => {
        const insertError = new Error('DB insert assigns failed');
        mockInsertAsync.mockResolvedValueOnce({ error: null }) 
                       .mockRejectedValueOnce(insertError); 

        // Expect the underlying error message directly
        await expect(saveSchedule(sampleShifts as ScheduledShift[], sampleAssignments as ShiftAssignment[], locationId, weekDates))
            .rejects.toThrow(insertError.message);

        expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
        expect(mockInsertAsync).toHaveBeenCalledTimes(2); 
    });

    it('should not call insert if input arrays are empty', async () => {
        await saveSchedule([], [], locationId, weekDates);
        expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
        expect(mockInsertAsync).not.toHaveBeenCalled();
    });

     it('should throw an error if weekDates is not 7 days', async () => {
        const shortWeekDates = weekDates.slice(0, 5);
        await expect(saveSchedule([], [], locationId, shortWeekDates))
            .rejects.toThrow("saveSchedule requires a weekDates array with exactly 7 days.");
    });
}); 