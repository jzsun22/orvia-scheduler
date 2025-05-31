import {
    ShiftTemplate,
    ScheduledShift,
    ShiftAssignment,
    Worker,
    DayOfWeek 
} from '@/lib/types';
import { 
    formatDateToYYYYMMDD, 
    getDayOfWeekStringFromDate } from './utils'; 

/**
 * Manages the state of the schedule generation process in memory.
 * Tracks assigned shifts, fulfilled requirements (templates), worker hours,
 * daily conflicts, and lead slot fulfillment.
 */
export class ScheduleGenerationState {
    // Public properties for easy access by assigner modules
    public scheduledShifts: ScheduledShift[];
    public shiftAssignments: ShiftAssignment[];
    public filledTemplateSlots: Set<string>; // DEPRECATED: old logic
    public filledTemplateInstances: Map<string, Set<string>>; // NEW: templateId -> Set<YYYY-MM-DD>
    public workerHoursAssigned: Map<string, number>; // Map<workerId, assignedHours>

    // Set to track worker assignments per day for O(1) conflict checking
    // Format: "workerId-YYYY-MM-DD"
    private assignedWorkerDays: Set<string>; 

    // Stores existing shifts for workers from OTHER locations for conflict checking
    private existingCrossLocationShifts: ScheduledShift[];

    // Map to track if opening/closing leads are assigned per day
    // Format: "YYYY-MM-DD" -> { opening: boolean, closing: boolean }
    private leadSlotsFilledByDay: Map<string, { opening: boolean; closing: boolean }>;
    
    // Keep references to original requirements
    private readonly initialTemplates: ShiftTemplate[];
    private readonly templatesById: Map<string, ShiftTemplate>; // For easy lookup

    /**
     * Initializes the schedule generation state.
     * @param initialTemplates The list of all ShiftTemplate requirements for the week/location.
     * @param allWorkers The list of all potentially relevant workers to initialize the hours map.
     * @param allWorkerShiftsForWeek OPTIONAL: Pre-fetched shifts for allWorkers across all locations for the current week.
     */
    constructor(initialTemplates: ShiftTemplate[], allWorkers: Worker[], allWorkerShiftsForWeek?: ScheduledShift[]) {
        this.scheduledShifts = [];
        this.shiftAssignments = [];
        this.filledTemplateSlots = new Set<string>(); // DEPRECATED
        this.filledTemplateInstances = new Map<string, Set<string>>(); // NEW
        this.assignedWorkerDays = new Set<string>(); 
        this.leadSlotsFilledByDay = new Map(); // Initialize lead tracker
        this.existingCrossLocationShifts = allWorkerShiftsForWeek ? [...allWorkerShiftsForWeek] : []; // Store pre-fetched shifts
        
        // Store initial templates and create lookup map
        this.initialTemplates = [...initialTemplates]; // Store a copy
        this.templatesById = new Map<string, ShiftTemplate>();
        initialTemplates.forEach(template => {
            this.templatesById.set(template.id, template);
        });

        // Initialize worker hours map
        this.workerHoursAssigned = new Map<string, number>();
        allWorkers.forEach(worker => {
            this.workerHoursAssigned.set(worker.id, 0);
        });
    }

    /**
     * Records a successful shift assignment in the state.
     * Updates scheduled shifts, assignments, filled templates, worker hours,
     * daily conflict tracker, and lead slot fulfillment tracker.
     */
    public addAssignment(
        shift: ScheduledShift,
        assignment: ShiftAssignment,
        templateId: string, 
        shiftDurationHours: number
    ): void {
        // Add shift and assignment
        this.scheduledShifts.push(shift);
        this.shiftAssignments.push(assignment);

        // Update worker hours
        const currentHours = this.workerHoursAssigned.get(assignment.worker_id) ?? 0;
        this.workerHoursAssigned.set(assignment.worker_id, currentHours + shiftDurationHours);

        // Mark template as filled
        this.filledTemplateSlots.add(templateId); // DEPRECATED
        // NEW: Mark template-date instance as filled
        if (!this.filledTemplateInstances.has(templateId)) {
            this.filledTemplateInstances.set(templateId, new Set<string>());
        }
        this.filledTemplateInstances.get(templateId)!.add(shift.shift_date);

        // Update daily conflict tracker
        if (shift.worker_id) { 
            const key = `${shift.worker_id}-${shift.shift_date}`;
            this.assignedWorkerDays.add(key);
        }

        // Update lead slot fulfillment tracker
        const template = this.templatesById.get(templateId);
        if (template && assignment.assignment_type === 'lead') {
            // Use shift.shift_date directly as it's already formatted
            const dateKey = shift.shift_date; 
            const dayEntry = this.leadSlotsFilledByDay.get(dateKey) ?? { opening: false, closing: false };

            if (template.lead_type === 'opening') {
                dayEntry.opening = true;
            } else if (template.lead_type === 'closing') {
                dayEntry.closing = true;
            }
            // Ensure we only set if lead_type is defined and matches
            if (template.lead_type) {
                 this.leadSlotsFilledByDay.set(dateKey, dayEntry);
            }
        }
    }

    /**
     * Retrieves the total hours currently assigned to a specific worker.
     */
    public getWorkerHours(workerId: string): number {
        return this.workerHoursAssigned.get(workerId) ?? 0;
    }

    /**
     * Checks if a specific shift requirement (template) has already been fulfilled for a specific date.
     * If no date is provided, returns true if any instance is filled (backward compatibility).
     */
    public isTemplateSlotFilled(templateId: string, date?: Date | string): boolean {
        if (!date) {
            return this.filledTemplateInstances.has(templateId) && 
                   this.filledTemplateInstances.get(templateId)!.size > 0;
        }
        const dateStr = date instanceof Date ? formatDateToYYYYMMDD(date) : date;
        return this.filledTemplateInstances.has(templateId) && 
               this.filledTemplateInstances.get(templateId)!.has(dateStr);
    }
    
    /**
     * Checks if an opening lead assignment has been made for a specific date.
     */
    public hasOpeningLead(date: Date): boolean {
        // Use the imported helper
        const dateKey = formatDateToYYYYMMDD(date); 
        return this.leadSlotsFilledByDay.get(dateKey)?.opening ?? false;
    }

    /**
     * Checks if a closing lead assignment has been made for a specific date.
     */
    public hasClosingLead(date: Date): boolean {
        // Use the imported helper
        const dateKey = formatDateToYYYYMMDD(date);
        return this.leadSlotsFilledByDay.get(dateKey)?.closing ?? false;
    }

    /**
     * Gets the list of original shift requirements (templates) that 
     * have not been fulfilled during the generation process.
     */
    public getUnfilledTemplates(): ShiftTemplate[] {
        // Return a copy to prevent modification of the internal list reference
        return this.initialTemplates.filter(template => 
            !this.filledTemplateSlots.has(template.id)
        );
    }

    /**
     * Efficiently checks if a worker already has any assignment on a specific date,
     * considering both shifts being generated for the current location AND pre-existing
     * shifts from other locations for that week.
     */
    public isWorkerAssignedOnDate(workerId: string, date: Date): boolean {
        const dateStr = formatDateToYYYYMMDD(date); 
        
        // Check shifts being generated for the current location
        const keyForCurrentLocation = `${workerId}-${dateStr}`;
        if (this.assignedWorkerDays.has(keyForCurrentLocation)) {
            return true;
        }

        // Check pre-existing shifts from other locations
        // Note: This checks ANY shift on that day. The `scheduled_shifts.location_id` would be different
        // from the current generation context's locationId if it's a true cross-location conflict.
        // The original problem was that the dashboard showed Megan at two locations. This check prevents that.
        for (const shift of this.existingCrossLocationShifts) {
            if (shift.worker_id === workerId && shift.shift_date === dateStr) {
                // A shift exists for this worker on this date.
                // We don't even need to check if shift.location_id is different,
                // because `this.assignedWorkerDays` handles same-location conflicts.
                // If it's in `existingCrossLocationShifts` and not for the current location,
                // it's a conflict. If it *was* for the current location, it would have been
                // (or should be) part of the data used to populate `assignedWorkerDays`
                // if we were, for example, regenerating a week that already had some shifts.
                // However, current logic in scheduleGenerator clears and rebuilds.
                // This ensures they aren't scheduled AT ALL elsewhere on that day.
                return true; 
            }
        }
        return false;
    }

    /**
     * Returns all unfilled template-date instances for the week.
     * Each result is { template, date: YYYY-MM-DD, dayOfWeek }
     */
    public getUnfilledTemplateInstances(weekDates: Date[]): { template: ShiftTemplate, date: string, dayOfWeek: DayOfWeek }[] {
        const results: { template: ShiftTemplate, date: string, dayOfWeek: DayOfWeek }[] = [];
        for (const template of this.initialTemplates) {
            if (template.days_of_week && template.days_of_week.length > 0) {
                for (const dayOfWeek of template.days_of_week) {
                    // Find the date for this dayOfWeek in weekDates
                    const dateObj = weekDates.find(d => getDayOfWeekStringFromDate(d) === dayOfWeek);
                    if (!dateObj) continue;
                    const dateStr = formatDateToYYYYMMDD(dateObj);
                    if (!this.isTemplateSlotFilled(template.id, dateStr)) {
                        results.push({ template, date: dateStr, dayOfWeek });
                    }
                }
            }
        }
        return results;
    }
} 