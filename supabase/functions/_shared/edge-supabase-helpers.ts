import { type SupabaseClient } from '@supabase/supabase-js';
import type {
    Location,
    LocationOperatingHours,
    WorkerLocation,
    Worker,
    ShiftTemplate,
    ScheduledShift,
    LocationPosition,
    Position,
    RecurringShiftAssignment,
    ShiftDetailsContext, 
    RawAssignmentWithWorkerDetails,
    ShiftAssignment,
    ShiftAssignmentsWithWorker,
    AvailabilityUpdate, // Assuming AvailabilityLabel is what was meant for AvailabilityUpdate
    WorkerAvailability,
    WorkerEligibilityDetails,
    DayLocationOperatingHours,
    ConflictingScheduledShift,
    DayOfWeek // Added DayOfWeek as it's used by fetchLocationHoursForDay
} from '../../../src/lib/types'; // Adjusted path for types

// Copied from src/lib/supabase.ts and ensured client is the first parameter

export const fetchShiftDetailsForContext = async (
  client: SupabaseClient,
  scheduledShiftId: string
): Promise<ShiftDetailsContext> => {
  const { data: rawData, error } = await client
    .from('scheduled_shifts')
    .select(`
      id,
      shift_date,
      start_time,
      end_time,
      worker_id,
      template_id,
      is_recurring_generated,
      created_at,
      shift_templates!inner (
        lead_type,
        location_id,
        position_id,
        locations!inner (id, name),
        positions!inner (id, name)
      )
    `)
    .eq('id', scheduledShiftId)
    .single();

  if (error) {
    console.error(`[edge-helpers] Error fetching shift details for context (ID: ${scheduledShiftId}):`, error.message);
    throw error;
  }
  if (!rawData) {
    throw new Error(`[edge-helpers] No shift details found for context (ID: ${scheduledShiftId}).`);
  }

  const typedShiftTemplates = rawData.shift_templates as any; 

  const result: ShiftDetailsContext = {
    id: rawData.id,
    shift_date: rawData.shift_date,
    start_time: rawData.start_time,
    end_time: rawData.end_time,
    worker_id: rawData.worker_id,
    template_id: rawData.template_id,
    location_id: typedShiftTemplates.location_id, 
    position_id: typedShiftTemplates.position_id,
    is_recurring_generated: rawData.is_recurring_generated,
    created_at: rawData.created_at,
    shift_templates: {
      lead_type: typedShiftTemplates.lead_type,
      location_id: typedShiftTemplates.location_id,
      position_id: typedShiftTemplates.position_id,
      locations: typedShiftTemplates.locations as { id: string; name: string; }, 
      positions: typedShiftTemplates.positions as { id: string; name: string; },
    },
  };
  return result;
};

export const fetchAssignmentsForShiftContext = async (
  client: SupabaseClient,
  scheduledShiftId: string
): Promise<RawAssignmentWithWorkerDetails[]> => {
  const { data: rawData, error } = await client
    .from('shift_assignments')
    .select(`
      id,
      scheduled_shift_id,
      worker_id,
      assignment_type,
      is_manual_override,
      assigned_start,
      assigned_end,
      created_at,
      workers (
        id,
        first_name,
        last_name,
        preferred_name,
        is_lead
      )
    `)
    .eq('scheduled_shift_id', scheduledShiftId);

  if (error) {
    console.error(`[edge-helpers] Error fetching assignments for shift context (ScheduledShiftID: ${scheduledShiftId}):`, error.message);
    throw error;
  }
  if (!rawData) {
    return [];
  }

  return rawData.map((item: any) => {
    const workerData = item.workers;
    const workerObject = Array.isArray(workerData) ? workerData[0] : workerData;
    return {
      id: item.id,
      scheduled_shift_id: item.scheduled_shift_id,
      worker_id: item.worker_id,
      assignment_type: item.assignment_type,
      is_manual_override: item.is_manual_override,
      assigned_start: item.assigned_start,
      assigned_end: item.assigned_end,
      created_at: item.created_at,
      workers: workerObject ? {
        id: workerObject.id,
        first_name: workerObject.first_name,
        last_name: workerObject.last_name,
        preferred_name: workerObject.preferred_name,
        is_lead: workerObject.is_lead,
      } : null,
    } as RawAssignmentWithWorkerDetails;
  });
};

export const fetchWorkerDetailsForEligibility = async (
  client: SupabaseClient,
  workerId: string
): Promise<WorkerEligibilityDetails | null> => {
  const { data, error } = await client
    .from('workers')
    .select('id, is_lead, availability, inactive')
    .eq('id', workerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error(`[edge-helpers] Error fetching worker details for eligibility (ID: ${workerId}):`, error.message);
    throw error;
  }
  return data as WorkerEligibilityDetails;
};

export const checkWorkerLocationLink = async (
  client: SupabaseClient,
  workerId: string,
  locationId: string
): Promise<boolean> => {
  const { count, error } = await client
    .from('worker_locations')
    .select('*' , { count: 'exact', head: true })
    .eq('worker_id', workerId)
    .eq('location_id', locationId);

  if (error) {
    console.error(`[edge-helpers] Error checking worker-location link (Worker: ${workerId}, Location: ${locationId}):`, error.message);
    throw error;
  }
  return (count ?? 0) > 0;
};

export const checkWorkerPositionLink = async (
  client: SupabaseClient,
  workerId: string,
  positionId: string
): Promise<boolean> => {
  const { count, error } = await client
    .from('worker_positions')
    .select('*' , { count: 'exact', head: true })
    .eq('worker_id', workerId)
    .eq('position_id', positionId);

  if (error) {
    console.error(`[edge-helpers] Error checking worker-position link (Worker: ${workerId}, Position: ${positionId}):`, error.message);
    throw error;
  }
  return (count ?? 0) > 0;
};

export const fetchLocationHoursForDay = async (
  client: SupabaseClient,
  locationId: string,
  dayOfWeek: string 
): Promise<DayLocationOperatingHours | null> => {
  const { data, error } = await client
    .from('location_hours')
    .select('day_start, day_end, morning_cutoff')
    .eq('location_id', locationId)
    .eq('day_of_week', dayOfWeek)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') { 
      return null;
    }
    console.error(`[edge-helpers] Error fetching location hours (Location: ${locationId}, Day: ${dayOfWeek}):`, error.message);
    throw error;
  }
  return data as DayLocationOperatingHours;
};

export const fetchConflictingShiftsForWorker = async (
  client: SupabaseClient,
  workerId: string,
  shiftDate: string
): Promise<ConflictingScheduledShift[]> => {
  const { data, error } = await client
    .from('scheduled_shifts')
    .select(`
      id,
      start_time,
      end_time,
      shift_assignments!inner (
        id,
        assigned_start,
        assigned_end
      )
    `)
    .eq('shift_date', shiftDate)
    .eq('shift_assignments.worker_id', workerId);

  if (error) {
    console.error(`[edge-helpers] Error fetching conflicting shifts (Worker: ${workerId}, Date: ${shiftDate}):`, error.message);
    throw error;
  }
  return (data || []) as ConflictingScheduledShift[];
};

export const updatePrimaryWorkerOnScheduledShift = async (
  client: SupabaseClient,
  scheduledShiftId: string,
  primaryWorkerId: string | null
): Promise<void> => {
  const { error } = await client
    .from('scheduled_shifts')
    .update({ worker_id: primaryWorkerId })
    .eq('id', scheduledShiftId);

  if (error) {
    console.error(`[edge-helpers] Error updating primary worker on scheduled_shift (ID: ${scheduledShiftId}):`, error.message);
    throw error;
  }
};

export const fetchWorkersByLocation = async (client: SupabaseClient, locationId: string): Promise<Pick<Worker, 'id' | 'first_name' | 'last_name' | 'preferred_name' | 'job_level' | 'inactive'>[]> => {
  const { data, error } = await client
    .from('workers')
    .select(`
      id,
      first_name,
      last_name,
      preferred_name,
      job_level,
      inactive,
      worker_locations!inner (location_id)
    `)
    .eq('worker_locations.location_id', locationId)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    console.error(`[edge-helpers] Error fetching workers for location ${locationId}:`, error.message);
    throw error;
  }
  return (data || []).map((w: any) => ({ 
    id: w.id,
    first_name: w.first_name,
    last_name: w.last_name,
    preferred_name: w.preferred_name,
    job_level: w.job_level,
    inactive: w.inactive,
  }));
};

export async function fetchMultipleWorkerDetailsForEligibility( 
  client: SupabaseClient,
  workerIds: string[]
): Promise<Map<string, { id: string; is_lead: boolean; availability: any; inactive: boolean | null }>> {
  if (workerIds.length === 0) return new Map();
  const { data, error } = await client
    .from('workers')
    .select('id, is_lead, availability, inactive')
    .in('id', workerIds);
  if (error) {
    console.error('[edge-helpers] Error fetching multiple worker details:', error);
    throw error;
  }
  const map = new Map<string, { id: string; is_lead: boolean; availability: any; inactive: boolean | null }>();
  (data || []).forEach(w => map.set(w.id, w));
  return map;
}

export async function fetchWorkerLocationLinksForMultipleWorkers(
  client: SupabaseClient,
  workerIds: string[],
  locationId: string
): Promise<Set<string>> {
  if (workerIds.length === 0) return new Set();
  const { data, error } = await client
    .from('worker_locations')
    .select('worker_id')
    .eq('location_id', locationId)
    .in('worker_id', workerIds);
  if (error) {
    console.error('[edge-helpers] Error fetching worker-location links for multiple workers:', error);
    throw error;
  }
  const set = new Set<string>();
  (data || []).forEach(link => set.add(link.worker_id));
  return set;
}

export async function fetchWorkerPositionLinksForMultipleWorkers(
  client: SupabaseClient,
  workerIds: string[],
  positionId: string
): Promise<Set<string>> {
  if (workerIds.length === 0) return new Set();
  const { data, error } = await client
    .from('worker_positions')
    .select('worker_id')
    .eq('position_id', positionId)
    .in('worker_id', workerIds);
  if (error) {
    console.error('[edge-helpers] Error fetching worker-position links for multiple workers:', error);
    throw error;
  }
  const set = new Set<string>();
  (data || []).forEach(link => set.add(link.worker_id));
  return set;
}

export async function fetchConflictingShiftsForMultipleWorkers(
  client: SupabaseClient,
  workerIds: string[],
  shiftDate: string
): Promise<Map<string, ConflictingScheduledShift[]>> {
  if (workerIds.length === 0) return new Map();

  const { data, error } = await client
    .from('scheduled_shifts')
    .select(`
      id,
      start_time,
      end_time,
      shift_assignments!inner (
        id,
        worker_id, 
        assigned_start, 
        assigned_end    
      )
    `)
    .eq('shift_date', shiftDate)
    .in('shift_assignments.worker_id', workerIds);

  if (error) {
    console.error('[edge-helpers] Error fetching conflicting shifts for multiple workers:', error);
    throw error;
  }

  const map = new Map<string, ConflictingScheduledShift[]>();
  (data || []).forEach(shift => {
    if (Array.isArray(shift.shift_assignments) && shift.shift_assignments.length > 0) {
      // Ensure shift_assignments is treated as an array of the correct type.
      const assignmentsArray = shift.shift_assignments as { id: string; worker_id: string; assigned_start: string; assigned_end: string }[];
      assignmentsArray.forEach((assignment) => {
        if (assignment.worker_id) {
          if (!map.has(assignment.worker_id)) {
            map.set(assignment.worker_id, []);
          }
          const conflictingShiftForWorker: ConflictingScheduledShift = {
            id: shift.id,
            start_time: shift.start_time,
            end_time: shift.end_time,
            shift_assignments: [ 
              { // Store only the relevant part of the assignment
                id: assignment.id,
                // worker_id: assignment.worker_id, // Not needed inside this nested structure per type
                assigned_start: assignment.assigned_start,
                assigned_end: assignment.assigned_end,
              }
            ]
          };
          map.get(assignment.worker_id)!.push(conflictingShiftForWorker);
        }
      });
    }
  });
  return map;
}

export const fetchLocationById = async (client: SupabaseClient, locationId: string): Promise<Location | null> => {
  const { data, error } = await client
    .from('locations')
    .select(`
      id,
      name 
    `)
    .eq('id', locationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // Not found
      return null;
    }
    console.error(`[edge-helpers] Error fetching location by ID (ID: ${locationId}):`, error.message);
    throw error;
  }
  return data as Location;
};

export const getPositionById = async (client: SupabaseClient, positionId: string): Promise<Position | null> => {
  const { data, error } = await client
    .from('positions')
    .select(`
      id,
      name
    `)
    .eq('id', positionId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') { // Not found
      return null;
    }
    console.error(`[edge-helpers] Error fetching position by ID (ID: ${positionId}):`, error.message);
    throw error;
  }
  return data as Position;
};

export const getScheduledShiftById = async (client: SupabaseClient, scheduledShiftId: string): Promise<ScheduledShift | null> => {
  const { data, error } = await client
    .from('scheduled_shifts')
    .select(`
      *, 
      shift_templates (*), 
      workers (*)
    `)
    .eq('id', scheduledShiftId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // Row not found
        return null;
    }
    console.error(`[edge-helpers] Error in getScheduledShiftById for ID ${scheduledShiftId}:`, error.message);
    throw error;
  }
  return data;
};

export const getShiftTemplateById = async (client: SupabaseClient, templateId: string): Promise<ShiftTemplate | null> => {
  const { data, error } = await client
    .from('shift_templates')
    .select('*')
    .eq('id', templateId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') { // Row not found
        return null;
    }
    console.error(`[edge-helpers] Error in getShiftTemplateById for ID ${templateId}:`, error.message);
    throw error;
  }
  return data;
};

export const getShiftAssignmentsWithWorkerDetailsByScheduledShiftId = async (client: SupabaseClient, scheduledShiftId: string): Promise<ShiftAssignmentsWithWorker[]> => {
  const { data, error } = await client
    .from('shift_assignments')
    .select(`
      *,
      workers:worker_id (
        id,
        first_name,
        last_name,
        preferred_name,
        availability,
        is_lead,
        inactive
      )
    `)
    .eq('scheduled_shift_id', scheduledShiftId);

  if (error) {
    console.error(`[edge-helpers] Error in getShiftAssignmentsWithWorkerDetailsByScheduledShiftId for scheduled_shift_id ${scheduledShiftId}:`, error.message);
    throw error;
  }
  return data || [];
};