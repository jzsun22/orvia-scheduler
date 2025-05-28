import { type SupabaseClient } from '@supabase/supabase-js'
import type {
    Location,
    LocationOperatingHours,
    WorkerLocation,
    Worker,
    ShiftTemplate,
    RecurringShiftAssignment,
    ShiftAssignment
} from './types'

// Helper function to get the current user
export const getCurrentUser = async (client: SupabaseClient) => {
  const { data: { user }, error } = await client.auth.getUser()
  if (error) {
    console.error('Error getting current user:', error.message)
    return null
  }
  return user
}

// Location-related helper functions
export const fetchAllLocations = async (client: SupabaseClient): Promise<Location[]> => {
  const { data, error } = await client
    .from('locations')
    .select('*')
    .order('name')
  
  if (error) {
    console.error('Error fetching locations:', error.message)
    throw error
  }
  
  return data || []
}

export const fetchLocationOperatingHours = async (client: SupabaseClient, locationId: string): Promise<LocationOperatingHours[]> => {
  const { data, error } = await client
    .from('location_hours')
    .select('*')
    .eq('location_id', locationId)
  
  if (error) {
    console.error('Error fetching location operating hours:', error.message)
    throw error
  }
  
  return data || []
}

export const fetchWorkerLocations = async (client: SupabaseClient, workerId?: string): Promise<WorkerLocation[]> => {
  let query = client
    .from('worker_locations')
    .select(`
      *,
      location:locations (
        id,
        name
      )
    `)
  
  if (workerId) {
    query = query.eq('worker_id', workerId)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching worker locations:', error.message)
    throw error
  }
  
  return data || []
}

export const fetchLocationPositions = async (client: SupabaseClient, locationId: string) => {
  const { data, error } = await client
    .from('location_positions')
    .select(`
      *,
      position:positions (
        id,
        name
      )
    `)
    .eq('location_id', locationId)
  
  if (error) {
    console.error('Error fetching location positions:', error.message)
    throw error
  }
  
  return data || []
}

// Worker-related helper functions that need location_id updates
export const fetchWorkers = async (client: SupabaseClient) => {
  const { data, error } = await client
    .from('workers')
    .select(`
      *,
      inactive,
      positions:worker_positions (
        position:positions (
          id,
          name
        )
      ),
      locations:worker_locations (
        location:locations (
          id,
          name
        )
      )
    `)
    // Add ordering by last name, then first name
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
  
  if (error) {
    console.error('Error fetching workers:', error.message)
    throw error
  }
  
  return data || []
}


// Template-related helper functions that need location_id updates
export const fetchShiftTemplates = async (client: SupabaseClient, locationId?: string) => {
  let query = client
    .from('shift_templates')
    .select(`
      *,
      position:positions (
        id,
        name
      ),
      location:locations (
        id,
        name
      )
    `)
  
  if (locationId) {
    query = query.eq('location_id', locationId)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching shift templates:', error.message)
    throw error
  }
  
  return data || []
}

// Fetch recurring assignments for a specific location
export const fetchRecurringAssignments = async (client: SupabaseClient, locationId: string): Promise<RecurringShiftAssignment[]> => {
  const { data, error } = await client
    .from('recurring_shift_assignments')
    .select(`
      *,
      worker:workers (*),
      position:positions (*),
      location:locations (*)
    `)
    .eq('location_id', locationId)

  if (error) {
    console.error('Error fetching recurring shift assignments:', error.message)
    throw error
  }

  return data || []
}

// Fetches all prerequisite data needed to run the schedule generation algorithm
export const fetchSchedulingPrerequisites = async (client: SupabaseClient, locationId: string): Promise<{
  workers: Worker[];
  templates: ShiftTemplate[];
  recurringAssignments: RecurringShiftAssignment[];
  locationOperatingHours: LocationOperatingHours[];
}> => {
  try {
    // Fetch all data concurrently using the passed-in client
    const [workers, templates, recurringAssignments, locationOperatingHours] = await Promise.all([
      fetchWorkers(client),
      fetchShiftTemplates(client, locationId),
      fetchRecurringAssignments(client, locationId),
      fetchLocationOperatingHours(client, locationId)
    ]);

    return {
      workers,
      templates,
      recurringAssignments,
      locationOperatingHours
    };
  } catch (error) {
    console.error('Error fetching scheduling prerequisites:', error);
    // Re-throw the error to be handled by the caller
    throw new Error('Failed to fetch all necessary data for schedule generation.');
  }
};

// Scheduled shifts helper functions that need location_id updates
export const fetchScheduledShifts = async (client: SupabaseClient, locationId: string, startDate: string, endDate: string) => {
  const { data, error } = await client
    .from('scheduled_shifts')
    .select(`
      *,
      worker:workers (
        id,
        first_name,
        last_name,
        preferred_name
      ),
      position:positions (
        id,
        name
      ),
      location:locations (
        id,
        name
      )
    `)
    .eq('location_id', locationId)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)
  
  if (error) {
    console.error('Error fetching scheduled shifts:', error.message)
    throw error
  }
  
  return data || []
}

// --- NEW DATA ACCESS FUNCTIONS FOR EDGE FUNCTION UTILS ---

export async function getShiftAssignmentsByScheduledShiftId(
  client: SupabaseClient,
  scheduledShiftId: string
): Promise<ShiftAssignment[]> {
  const { data, error } = await client
    .from('shift_assignments')
    .select('*')
    .eq('scheduled_shift_id', scheduledShiftId)

  if (error) {
    console.error('Error fetching shift assignments by scheduled_shift_id:', error)
    throw error
  }
  return data || []
}

