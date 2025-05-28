'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Plus, Pencil, Trash2 } from 'lucide-react';
import { RecurringShiftModal } from './RecurringShiftModal';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAppToast } from "@/lib/toast-service";

// Define the availability type to match the backend structure
interface Availability {
  [key: string]: string[]; // Array of availability labels: "morning", "afternoon", "all_day"
}

interface RecurringShift {
  id: string;
  day_of_week: string;
  location_id: string;
  location_name: string;
  position_id: string;
  position_name: string;
  start_time: string;
  end_time: string;
  assignment_type: 'lead' | 'regular' | 'training';
}

interface LocationHour {
  location_id: string;
  day_of_week: string;
  morning_cutoff: string | null;
}

interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    availability: Availability;
  };
}

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Define availability options
const AVAILABILITY_OPTIONS = [
  { value: 'all_day', label: 'All Day' },
  { value: 'morning', label: 'Morning Only', tooltip: 'Available for shifts ending at 4/5pm' },
  { value: 'afternoon', label: 'Afternoon Only', tooltip: 'Available for shifts starting at 4/5pm' },
  { value: 'none', label: 'Not Available' }
];

// Helper to convert HH:mm string to minutes from midnight
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || !timeStr.includes(':')) return 0; // Should not happen with valid data
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const getAvailabilityForDay = (
  dayShifts: RecurringShift[],
  morningCutoffTime: string | undefined // HH:mm format
): string[] => {
  if (!dayShifts || dayShifts.length === 0) {
    return []; // 'Not Available'
  }

  const cutoffMinutes = morningCutoffTime ? timeToMinutes(morningCutoffTime) : undefined;

  let allFitInMorning = true;
  let allFitInAfternoon = true;

  for (const shift of dayShifts) {
    const shiftStartMinutes = timeToMinutes(shift.start_time);
    const shiftEndMinutes = timeToMinutes(shift.end_time);

    // Check for morning fit
    if (cutoffMinutes === undefined || shiftEndMinutes > cutoffMinutes) {
      allFitInMorning = false;
    }

    // Check for afternoon fit
    if (cutoffMinutes === undefined || shiftStartMinutes < cutoffMinutes) {
      allFitInAfternoon = false;
    }
  }

  if (allFitInMorning && cutoffMinutes !== undefined) {
    // If they also fit in the afternoon (e.g. cutoff is 12:00, shift is 10:00-11:00),
    // 'morning' is more specific if it applies.
    return ['morning'];
  }

  if (allFitInAfternoon && cutoffMinutes !== undefined) {
    return ['afternoon'];
  }

  // If neither strictly morning nor strictly afternoon, or no cutoff defined,
  // or shifts span the cutoff, then 'all_day' is required.
  return ['all_day'];
};

// Add this utility function at the top with other constants
const capitalizeDay = (day: string): string => {
  if (!day) return '';
  // Ensure day is treated as lowercase before capitalizing first letter for consistency
  const lowerDay = day.toLowerCase(); 
  return lowerDay.charAt(0).toUpperCase() + lowerDay.slice(1);
};

// Add this utility function at the top with other constants
const formatTime = (time: string) => {
  // Parse the 24hr time
  const [hours, minutes] = time.split(':');
  const date = new Date();
  date.setHours(parseInt(hours), parseInt(minutes));
  
  // Format to 12hr time
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

export function AvailabilityModal({ isOpen, onClose, onSuccess, employee }: AvailabilityModalProps) {
  const { showSuccessToast } = useAppToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>({});
  const [selectedDay, setSelectedDay] = useState<string>(DAYS_OF_WEEK[0]);
  const [selectedOption, setSelectedOption] = useState<string>('all_day');
  
  // Recurring shifts state
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [isRecurringShiftModalOpen, setIsRecurringShiftModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<RecurringShift | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // State for location hours (morning cutoffs)
  const [locationHoursData, setLocationHoursData] = useState<LocationHour[]>([]);

  // Initialize availability with defaults or existing data
  useEffect(() => {
    // Start with a default object where all days are 'Not Available' ([])
    const defaultAvailability: Availability = {};
    DAYS_OF_WEEK.forEach(day => { // day is already lowercase
      defaultAvailability[day] = []; // Default to 'Not Available'
    });

    // Process employee's existing availability to ensure keys are lowercase
    const processedEmployeeAvailability: Availability = {};
    if (employee.availability) {
      for (const dayKeyInUpstreamData in employee.availability) {
        if (Object.prototype.hasOwnProperty.call(employee.availability, dayKeyInUpstreamData)) {
          const lowerCaseDayKey = dayKeyInUpstreamData.toLowerCase();
          // Only map if the lowercase key is a valid day of the week
          if (DAYS_OF_WEEK.includes(lowerCaseDayKey)) {
            processedEmployeeAvailability[lowerCaseDayKey] = employee.availability[dayKeyInUpstreamData];
          } else {
            // Optionally log or handle unexpected day keys from upstream
            console.warn(`Encountered an unexpected day key '${dayKeyInUpstreamData}' in employee availability data. It will be ignored.`);
          }
        }
      }
    }

    // Merge the employee's processed (lowercase keys) availability onto the defaults
    const initialAvailability = {
      ...defaultAvailability,
      ...processedEmployeeAvailability
    };

    setAvailability(initialAvailability);

    // Set initial selected option based on the first day's merged availability
    // DAYS_OF_WEEK[0] is already lowercase, e.g., 'monday'
    const firstDayAvailability = initialAvailability[DAYS_OF_WEEK[0]] || [];
    if (firstDayAvailability.includes('all_day')) {
      setSelectedOption('all_day');
    } else if (firstDayAvailability.includes('morning')) {
      setSelectedOption('morning');
    } else if (firstDayAvailability.includes('afternoon')) {
      setSelectedOption('afternoon');
    } else { // Handles the case where the first day is [] ('Not Available') or not found
      setSelectedOption('none');
    }
  }, [employee.availability]); // Dependency remains the same

  // Fetch recurring shifts
  useEffect(() => {
    if (isOpen) {
      fetchRecurringShifts();
      fetchLocationHours(); // Fetch location hours when modal opens
    }
  }, [isOpen, employee.id]);

  const fetchRecurringShifts = async () => {
    try {
      const { data, error } = await supabase
        .from('recurring_shift_assignments')
        .select(`
          id,
          day_of_week,
          location_id,
          position_id,
          start_time,
          end_time,
          assignment_type,
          location:locations ( 
            id, 
            name 
          ),
          position:positions ( 
            id,
            name
          )
        `)
        .eq('worker_id', employee.id);

      if (error) throw error;

      // Transform the data to match our RecurringShift interface
      const transformedData = data?.map(shift => {
        const positionObject = Array.isArray(shift.position) ? shift.position[0] : shift.position;
        const positionName = positionObject?.name || 'Unknown';
        
        const locationObject = Array.isArray(shift.location) ? shift.location[0] : shift.location;
        const locationName = locationObject?.name || 'Unknown Location';

        // Map DB assignment_type to the interface type
        let mappedAssignmentType: 'lead' | 'regular' | 'training' = 'regular'; // Default to 'regular'
        if (shift.assignment_type === 'lead' || shift.assignment_type === 'regular' || shift.assignment_type === 'training') {
          mappedAssignmentType = shift.assignment_type;
        }

        return {
          id: shift.id,
          day_of_week: shift.day_of_week,
          location_id: shift.location_id,
          location_name: locationName,
          position_id: shift.position_id,
          position_name: positionName,
          start_time: shift.start_time,
          end_time: shift.end_time,
          assignment_type: mappedAssignmentType, // Use the mapped type
        };
      }) || [];

      setRecurringShifts(transformedData);
    } catch (err: any) {
      console.error('Error fetching recurring shifts:', err);
      setError(err.message);
    }
  };

  const fetchLocationHours = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('location_hours')
        .select('location_id, day_of_week, morning_cutoff');

      if (fetchError) throw fetchError;
      
      setLocationHoursData(data || []);
    } catch (err: any) {
      console.error('Error fetching location hours:', err);
      // Set an error or handle appropriately if this data is critical for modal functionality
      // For now, discrepancy checks in handleSave will be affected if this fails.
      // setError('Could not load location configuration. Some validation might not work as expected.');
    }
  };

  // Update selected option when day changes
  useEffect(() => {
    const dayAvailability = availability[selectedDay] || [];
    if (dayAvailability.includes('all_day')) {
      setSelectedOption('all_day');
    } else if (dayAvailability.includes('morning')) {
      setSelectedOption('morning');
    } else if (dayAvailability.includes('afternoon')) {
      setSelectedOption('afternoon');
    } else {
      setSelectedOption('none');
    }
  }, [selectedDay, availability]);

  const handleOptionChange = (option: string) => {
    setSelectedOption(option);
    
    // Map the selected option to the appropriate availability array
    let availabilityArray: string[] = [];
    
    switch (option) {
      case 'all_day':
        availabilityArray = ['all_day'];
        break;
      case 'morning':
        availabilityArray = ['morning'];
        break;
      case 'afternoon':
        availabilityArray = ['afternoon'];
        break;
      case 'none':
        availabilityArray = [];
        break;
    }

    // Update the availability state with the new array for the selected day
    setAvailability(prev => ({
      ...prev,
      [selectedDay]: availabilityArray
    }));
  };

  // Validate the availability data before saving
  const validateAvailability = (data: Availability): boolean => {
    // Check that all days have valid arrays
    for (const day of DAYS_OF_WEEK) {
      const dayAvailability = data[day];
      if (!Array.isArray(dayAvailability)) {
        return false;
      }
      
      // Check that each array contains valid values
      for (const value of dayAvailability) {
        if (!['morning', 'afternoon', 'all_day'].includes(value)) {
          return false;
        }
      }
    }
    
    return true;
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      // Validate the availability data structure first
      if (!validateAvailability(availability)) {
        console.error('Invalid availability data format:', availability);
        throw new Error('Invalid availability data format. Please try again.');
      }

      // Check for discrepancies between availability and recurring shifts
      const conflictingShiftsMessages: string[] = [];
      for (const shift of recurringShifts) {
        const dayKey = shift.day_of_week.toLowerCase(); // Use toLowerCase for accessing availability object
        const currentDayAvailability = availability[dayKey];

        if (!currentDayAvailability) {
          // This case should ideally not be reached if availability is initialized for all days
          console.warn(`Availability not found for day: ${dayKey}`);
          continue;
        }

        const locationHour = locationHoursData.find(
          (lh) => lh.location_id === shift.location_id && lh.day_of_week.toLowerCase() === shift.day_of_week.toLowerCase()
        );
        
        const cutoffTime = locationHour?.morning_cutoff; // HH:mm or null
        const cutoffMinutes = cutoffTime ? timeToMinutes(cutoffTime) : undefined;
        const shiftStartMinutes = timeToMinutes(shift.start_time);
        const shiftEndMinutes = timeToMinutes(shift.end_time);

        let conflict = false;
        let reason = "";

        const shiftDetails = `${shift.position_name} shift (${formatTime(shift.start_time)} - ${formatTime(shift.end_time)}) at ${shift.location_name}`;

        if (currentDayAvailability.length === 0) { // 'Not Available'
          conflict = true;
          reason = `is 'Not Available', but has recurring ${shiftDetails}.`;
        } else if (currentDayAvailability.includes('morning')) {
          if (cutoffMinutes === undefined) {
            conflict = true;
            reason = `is 'Morning Only', but a morning cutoff time is not defined for ${shift.location_name} on ${capitalizeDay(dayKey)}. Cannot verify compatibility with recurring ${shiftDetails}.`;
          } else if (shiftEndMinutes > cutoffMinutes) {
            conflict = true;
            reason = `is 'Morning Only' (requires shifts to end by ${formatTime(cutoffTime!)}), but recurring ${shiftDetails} ends later.`;
          }
        } else if (currentDayAvailability.includes('afternoon')) {
          if (cutoffMinutes === undefined) {
            conflict = true;
            reason = `is 'Afternoon Only', but an afternoon start time (derived from morning cutoff) is not defined for ${shift.location_name} on ${capitalizeDay(dayKey)}. Cannot verify compatibility with recurring ${shiftDetails}.`;
          } else if (shiftStartMinutes < cutoffMinutes) {
            conflict = true;
            reason = `is 'Afternoon Only' (requires shifts to start after ${formatTime(cutoffTime!)}), but recurring ${shiftDetails} starts earlier.`;
          }
        }
        // No conflict for 'all_day' in this specific logic

        if (conflict) {
          conflictingShiftsMessages.push(`On ${capitalizeDay(dayKey)}, availability ${reason}`); // Use capitalizeDay for display in message
        }
      }

      if (conflictingShiftsMessages.length > 0) {
        setError(
          `Availability conflicts with one or more recurring shifts:\n- ${conflictingShiftsMessages.join("\n- ")}`
        );
        setLoading(false);
        return;
      }

      // Proceed with saving if no structural errors or conflicts
      const { error: updateError } = await supabase
        .from('workers')
        .update({ availability })
        .eq('id', employee.id);

      if (updateError) throw updateError;

      showSuccessToast(`Availability for ${employee.first_name} ${employee.last_name} updated.`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error updating availability:', err);
      // If setError hasn't been called by the conflict checks (i.e., component's error state is still null),
      // set a generic error from the caught exception.
      if (error === null) { // Check the component's current error state
        setError(err.message || 'An unexpected error occurred while saving.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleAddRecurringShift = () => {
    setIsEditing(false);
    setSelectedShift(null);
    setIsRecurringShiftModalOpen(true);
  };

  const handleEditRecurringShift = (shift: RecurringShift) => {
    setIsEditing(true);
    setSelectedShift(shift);
    setIsRecurringShiftModalOpen(true);
  };

  const handleDeleteRecurringShift = (shift: RecurringShift) => {
    setSelectedShift(shift);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedShift) return;

    try {
      setLoading(true);
      
      // This is a placeholder for the actual API call
      // In a real implementation, you would delete from the database
      const { error } = await supabase
        .from('recurring_shift_assignments')
        .delete()
        .eq('id', selectedShift.id);

      if (error) throw error;

      // Refresh the list of recurring shifts
      fetchRecurringShifts();
      setIsDeleteDialogOpen(false);
    } catch (err: any) {
      console.error('Error deleting recurring shift:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecurringShiftSave = async (data: { savedShift: RecurringShift; isNew: boolean }) => {
    const { savedShift, isNew } = data;

    if (isNew) {
      try {
        // Fetch morning_cutoff for the new shift's location and day
        const { data: locationHourData, error: locationHourError } = await supabase
          .from('location_hours')
          .select('morning_cutoff')
          .eq('location_id', savedShift.location_id)
          .eq('day_of_week', savedShift.day_of_week.toLowerCase()) // Ensure day is lowercase for matching DB
          .single();

        if (locationHourError && locationHourError.code !== 'PGRST116') { // PGRST116: 'single' row not found
          throw locationHourError;
        }
        
        const morningCutoff = locationHourData?.morning_cutoff;

        // Combine existing shifts for the day with the new shift
        const dayOfNewShift = savedShift.day_of_week; // This is capitalized from RecurringShift interface
        const shiftsForDay = [
          ...recurringShifts.filter(rs => rs.day_of_week.toLowerCase() === dayOfNewShift.toLowerCase()),
          savedShift, // Add the new shift to the list for calculation
        ];

        const suggestedAvailability = getAvailabilityForDay(shiftsForDay, morningCutoff);
        
        // Update availability, respecting 'all_day' precedence
        setAvailability(prev => {
          const currentDayAvailability = prev[dayOfNewShift] || [];
          if (currentDayAvailability.includes('all_day')) {
            return { ...prev, [dayOfNewShift]: ['all_day'] };
          }
          return { ...prev, [dayOfNewShift]: suggestedAvailability };
        });

      } catch (err: any) {
        console.error('Error processing new recurring shift for availability update:', err);
        // Optionally set an error state to inform the user
        // setError("Could not automatically update availability due to an error.");
      }
    }

    // Refresh the list of recurring shifts from the database
    await fetchRecurringShifts(); 
    setIsRecurringShiftModalOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-[#f8f9f7]">
        <DialogHeader>
          <DialogTitle className="text-xl font-manrope font-semibold">
            Set Availability for {employee.first_name} {employee.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-7 gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`p-2 text-sm rounded-md transition-colors ${
                  selectedDay === day
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
                }`}
              >
                {capitalizeDay(day).slice(0, 3)}.
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Availability for {capitalizeDay(selectedDay)}</h3>
            <div className="space-y-3">
              {AVAILABILITY_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center">
                  <input
                    type="radio"
                    id={`option-${option.value}`}
                    name="availability"
                    value={option.value}
                    checked={selectedOption === option.value}
                    onChange={() => handleOptionChange(option.value)}
                    className="h-4 w-4 text-primary border-gray-300 focus:ring-primary"
                  />
                  <label
                    htmlFor={`option-${option.value}`}
                    className="ml-2 text-sm font-medium text-gray-700"
                  >
                    {option.label}
                  </label>
                  {option.tooltip && (
                    <TooltipProvider>
                      <Tooltip delayDuration={100}>
                        <TooltipTrigger asChild>
                          <button className="ml-2 text-gray-400 hover:text-gray-500">
                            <Info className="h-4 w-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{option.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Summary Section */}
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <h3 className="font-medium">Current Availability Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              {DAYS_OF_WEEK.map((day) => {
                const dayAvailability = availability[day] || [];
                let displayLabel = 'Not Set';
                
                if (dayAvailability.includes('all_day')) {
                  displayLabel = 'All Day';
                } else if (dayAvailability.includes('morning')) {
                  displayLabel = 'Morning Only';
                } else if (dayAvailability.includes('afternoon')) {
                  displayLabel = 'Afternoon Only';
                } else if (dayAvailability.length === 0) {
                  displayLabel = 'Not Available';
                }
                
                return (
                  <div key={day} className="flex justify-between items-center">
                    <span className="text-sm font-medium">{capitalizeDay(day)}</span>
                    <span className="text-sm text-gray-500">{displayLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recurring Shifts Section */}
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Recurring Shifts</h3>
              {recurringShifts.length === 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAddRecurringShift}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Recurring Shift
                </Button>
              )}
            </div>

            {recurringShifts.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                No recurring shifts set
              </div>
            ) : (
              <div className={`space-y-3 ${ 
                // Determine scroll threshold and max height based on error presence
                (error && recurringShifts.length > 2) || (!error && recurringShifts.length > 3) 
                ? `overflow-y-auto ${error ? 'max-h-40' : 'max-h-60'} scrollbar scrollbar-thumb-gray-300 scrollbar-track-gray-100` 
                : '' 
              }`}>
                {recurringShifts.map((shift) => (
                  <div 
                    key={shift.id} 
                    className="group flex justify-between items-center p-3 bg-white rounded-md shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{capitalizeDay(shift.day_of_week)}</div>
                      <div className="text-sm text-gray-500">
                        {shift.location_name} • {shift.position_name} • {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                        {shift.assignment_type === 'lead' && (
                          <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Lead</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleEditRecurringShift(shift)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteRecurringShift(shift)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddRecurringShift}
                    className="flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    Add Recurring Shift
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Recurring Shift Modal */}
      <RecurringShiftModal
        isOpen={isRecurringShiftModalOpen}
        onClose={() => setIsRecurringShiftModalOpen(false)}
        onSuccess={handleRecurringShiftSave}
        employeeId={employee.id}
        shift={selectedShift}
        isEditing={isEditing}
        existingRecurringShifts={recurringShifts}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Shift</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this recurring shift? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
} 