// Base types and enums
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type AvailabilityLabel = 'none' | 'morning' | 'afternoon' | 'all_day';

export type JobLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';

export type AssignmentType = 'lead' | 'training' | 'regular';

// Worker availability structure
export type WorkerAvailability = {
    [key in DayOfWeek]: AvailabilityLabel[];
};

// Time range helper type
export interface TimeRange {
    start_time: string;  // Format: "HH:mm"
    end_time: string;    // Format: "HH:mm"
}

// Database table interfaces
export interface Location {
    id: string;
    name: string;
}

export interface LocationOperatingHours {
    id: string;
    location_id: string;
    day_of_week: DayOfWeek;
    day_start: string;      // HH:mm:ss
    day_end: string;        // HH:mm:ss
    morning_cutoff: string;    // HH:mm:ss
}

export interface Worker {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    job_level: JobLevel;
    availability: WorkerAvailability;
    is_lead: boolean;
    preferred_hours_per_week: number | null;
    created_at: string;
    inactive?: boolean | null;
    // Align with aliases used in fetchWorkers from supabase.ts
    positions?: { position?: { id: string, name?: string } }[]; 
    locations?: { location?: { id: string, name?: string } }[];
}

export interface WorkerLocation {
    id: string;
    worker_id: string;
    location_id: string;
}

export interface WorkerPosition {
    id: string;
    worker_id: string;
    position_id: string;
}

export interface Position {
    id: string;
    name: string;
}

export interface ScheduledShift {
    id: string;
    shift_date: string;  // Format: "YYYY-MM-DD"
    template_id: string;
    worker_id?: string;  // Optional since shifts can be unassigned
    location_id: string;
    position_id: string;
    start_time: string;  // Format: "HH:mm"
    end_time: string;    // Format: "HH:mm"
    is_recurring_generated: boolean;
    created_at: string;
}

export interface ShiftTemplate {
    id: string;
    location_id: string;
    position_id: string;
    days_of_week: DayOfWeek[];  // Array of days this template applies to
    start_time: string;  // Format: "HH:mm"
    end_time: string;    // Format: "HH:mm"
    lead_type?: 'opening' | 'closing' | null;
}

export interface ShiftAssignment {
    id: string;
    scheduled_shift_id: string;
    worker_id: string;
    assignment_type: AssignmentType;
    is_manual_override: boolean;
    assigned_start?: string | null;  // Format: "HH:mm"
    assigned_end?: string | null;    // Format: "HH:mm"
    created_at: string;
}

export interface LocationPosition {
    id: string;
    location_id: string;
    position_id: string;
}

export interface RecurringShiftAssignment {
    id: string;
    worker_id: string;
    position_id: string;
    location_id: string;
    day_of_week: DayOfWeek;
    start_time: string;  // Format: "HH:mm"
    end_time: string;    // Format: "HH:mm"
    assignment_type: AssignmentType;
    created_at: string;
}

// Schedule generation state types
export interface ScheduleGenerationState {
    scheduledShifts: ScheduledShift[];
    shiftAssignments: ShiftAssignment[];
    filledTemplateSlots: Set<string>;
    workerHoursAssigned: Map<string, number>;
    unassignedSlots: ShiftTemplate[];
}

export interface ScheduleGenerationResult {
    success: boolean;
    warnings: string[];
    scheduledShifts: ScheduledShift[];
    shiftAssignments: ShiftAssignment[];
    unassignedSlots: ShiftTemplate[];
}

// Worker eligibility types for scheduling
export interface WorkerEligibility {
    worker: Worker;
    totalHoursAssigned: number;
    isAvailable: boolean;
    hasConflict: boolean;
    exceedsPreferredHours: boolean;
}

export interface LeadAssignmentPriority {
    worker: Worker;
    isPreviousLead: boolean;
    totalHoursAssigned: number;
    jobLevel: JobLevel;
}

// Job level comparison utilities
export const JOB_LEVEL_VALUES: Record<JobLevel, number> = {
    'L1': 1,
    'L2': 2,
    'L3': 3,
    'L4': 4,
    'L5': 5,
    'L6': 6,
    'L7': 7
};

export function getJobLevelValue(level: JobLevel): number {
    return JOB_LEVEL_VALUES[level];
}

export function compareJobLevels(a: JobLevel, b: JobLevel): number {
    return getJobLevelValue(a) - getJobLevelValue(b);
}

// Add new specific return types for refactored utils

// For fetchShiftDetailsForContext (used in getShiftContext)
// Extends your existing ScheduledShift type
export interface ShiftDetailsContext extends ScheduledShift {
  shift_templates: { // This structure comes from the Supabase join
    lead_type: 'opening' | 'closing' | null;
    location_id: string;
    position_id: string;
    locations: { // From locations table, as per Supabase join syntax
      id: string;
      name: string;
    };
    positions: { // From positions table, as per Supabase join syntax
      id: string;
      name: string;
    };
  } | null; // Though !inner in query should make it non-null
}

// For fetchAssignmentsForShiftContext (used in getShiftContext)
// Represents a ShiftAssignment joined with details from the workers table
export interface RawAssignmentWithWorkerDetails extends ShiftAssignment { 
  // worker_id is already in ShiftAssignment
  workers: { // This structure comes from the Supabase join
    id: string; // Worker's id
    first_name: string | null;
    last_name: string | null;
    preferred_name: string | null;
    is_lead: boolean;
  } | null; // Worker can be null if assignment.worker_id was null (though your ShiftAssignment type has worker_id as non-null)
            // If worker_id in ShiftAssignment is non-nullable, then `workers` here should also be non-nullable if join succeeds.
}

// For fetchWorkerDetailsForEligibility (used in isWorkerEligibleForAssignment)
// Uses your existing Worker type, but specifies the fields selected
export type WorkerEligibilityDetails = Pick<Worker, 'id' | 'is_lead' | 'availability'>;

// For fetchLocationHoursForDay (used in isWorkerEligibleForAssignment)
// Uses your existing LocationOperatingHours type, but specifies the fields selected
export type DayLocationOperatingHours = Pick<LocationOperatingHours, 'day_start' | 'day_end' | 'morning_cutoff'>;

// For fetchConflictingShiftsForWorker (used in isWorkerEligibleForAssignment)
export interface ConflictingScheduledShift {
  id: string; // scheduled_shift_id
  start_time: string;
  end_time: string;
  location_id: string;
  shift_assignments: { // From shift_assignments table, structure based on select query
    id: string; // shift_assignment id
    worker_id?: string; // Add worker_id here as it's used in the map keying logic
    assigned_start: string | null; // Corrected from assigned_start_time
    assigned_end: string | null;   // Corrected from assigned_end_time
  }[]; 
}

// Add any new specific types for table rows if not already present, e.g.:
// export interface Workers { ... }
// export interface Positions { ... }
// export interface Locations { ... }
// export interface ShiftTemplates { ... }
// export interface ScheduledShifts { ... }
// export interface ShiftAssignments { ... }
// export interface RecurringShiftAssignments { ... }
// export interface LocationHours { ... }
// export interface LocationPositions { ... }
// export interface WorkerLocations { ... }
// export interface WorkerPositions { ... }


// Generic Supabase error type
export interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Specific types for function arguments or return values if they are complex
// Example:
// export interface MyFunctionParams {
//   param1: string;
//   param2: number;
// }

export interface ShiftContext {
  scheduledShift: ScheduledShift;
  shiftTemplate: ShiftTemplate;
  currentAssignments: ShiftAssignment[];
  shiftType: 'opening-lead' | 'closing-lead' | 'non-lead';
  location: Location;
  position: Position;
}

// Types for getWorkerWithDetailsById
export interface WorkerWithDetails extends Worker {
  detailed_positions: Position[]; // Renamed to avoid conflict with Worker.positions
  // The original Worker.positions is: { position?: { id: string; name?: string; }; }[];
  // WorkerWithDetails provides a more direct list.
  detailed_locations: Location[]; // Renamed for consistency, assuming a similar enrichment pattern
  inactive?: boolean | null;
}

// Types for fetching from worker_positions and worker_locations directly if needed
export interface WorkerPositionDetail extends WorkerPosition {
  positions: Position;
}

export interface WorkerLocationDetail extends WorkerLocation {
  locations: Location;
}

export interface WorkerBasicInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  is_lead: boolean | null;
}

export interface ShiftAssignmentsWithWorker extends ShiftAssignment {
  workers: WorkerBasicInfo | null;
}

export interface EditableShiftDetails {
  scheduledShift: ScheduledShift;
  shiftTemplate: ShiftTemplate;
  currentAssignments: ShiftAssignmentsWithWorker[];
  shiftType: 'opening-lead' | 'closing-lead' | 'non-lead';
  location: Location;
  position: Position;
} 