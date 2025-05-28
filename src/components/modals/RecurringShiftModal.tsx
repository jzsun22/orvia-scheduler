'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { fetchAllLocations } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Location } from '@/lib/types';
import { useAppToast } from "@/lib/toast-service";

interface RecurringShift {
  id: string;
  day_of_week: string;
  location_id: string;
  location_name: string;
  position_id: string;
  position_name: string;
  start_time: string;
  end_time: string;
  assignment_type: 'lead' | 'regular';
}

interface RecurringShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { savedShift: RecurringShift; isNew: boolean }) => void;
  employeeId: string;
  shift?: RecurringShift | null;
  isEditing: boolean;
  existingRecurringShifts: RecurringShift[];
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Add a utility function for time formatting
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

// Add this utility function at the top with other constants
const capitalizeDay = (day: string) => {
  const lowercaseDay = day.toLowerCase();
  return DAYS_OF_WEEK.find(d => d.toLowerCase() === lowercaseDay) || day;
};

export function RecurringShiftModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  employeeId,
  shift,
  isEditing,
  existingRecurringShifts
}: RecurringShiftModalProps) {
  const { showSuccessToast } = useAppToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [allPositions, setAllPositions] = useState<{ id: string; name: string }[]>([]);
  const [filteredPositions, setFilteredPositions] = useState<{ id: string; name: string }[]>([]);
  const [allShiftTemplates, setAllShiftTemplates] = useState<{ id: string; start_time: string; end_time: string }[]>([]);
  const [filteredShiftTemplates, setFilteredShiftTemplates] = useState<{ id: string; start_time: string; end_time: string }[]>([]);
  
  // Form state
  const [dayOfWeek, setDayOfWeek] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [positionId, setPositionId] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [assignmentType, setAssignmentType] = useState<'lead' | 'regular'>('regular');

  // Reset all form state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDayOfWeek('');
      setLocationId('');
      setPositionId('');
      setStartTime('');
      setEndTime('');
      setAssignmentType('regular');
      setFilteredPositions([]);
      setFilteredShiftTemplates([]);
      setError(null);
    }
  }, [isOpen]);

  // Fetch locations, positions, and shift templates
  useEffect(() => {
    if (!isOpen) return;

    console.log('Modal opened, initializing data...');
    setLoading(true);
    setError(null);
    
    const loadInitialData = async () => {
      try {
        // Fetch locations first
        const fetchedLocations = await fetchAllLocations(supabase);
        setLocations(fetchedLocations);
        console.log('Loaded locations:', fetchedLocations);

        // First load all positions
        const { data: positionsData, error: positionsError } = await supabase
          .from('positions')
          .select('id, name')
          .order('name');

        if (positionsError) throw positionsError;
        
        if (!positionsData) {
          throw new Error('No positions data received');
        }

        console.log('Loaded all positions:', positionsData);
        setAllPositions(positionsData);

        // For edit mode, always fetch fresh data from recurring_shift_assignments
        if (isEditing && shift?.id) {
          // Load the recurring shift assignment with position information
          const { data: shiftData, error: shiftError } = await supabase
            .from('recurring_shift_assignments')
            .select(`
              *,
              position:positions (
                id,
                name
              )
            `)
            .eq('id', shift.id)
            .single();

          if (shiftError) throw shiftError;

          if (!shiftData) {
            throw new Error('No shift data received');
          }

          console.log('Loaded shift data with position:', shiftData);

          // Set initial form state from shiftData
          const matchingLocation = fetchedLocations.find(loc => loc.name === shiftData.location_name);
          setDayOfWeek(capitalizeDay(shiftData.day_of_week));
          setLocationId(matchingLocation?.id || ''); // Set ID, fallback to empty
          setPositionId(shiftData.position_id);
          setAssignmentType(shiftData.assignment_type);
          setStartTime(shiftData.start_time || ''); // Set initial times
          setEndTime(shiftData.end_time || '');
        }
      } catch (err) {
        console.error('Error loading initial data:', err);
        setError('Failed to load form data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [isOpen, isEditing, shift]);

  // Remove the form initialization effect since we now handle it in loadInitialData
  // and we want to avoid any cached state
  useEffect(() => {
    if (!isEditing) {
      // Reset form for new shift
      setDayOfWeek('');
      setLocationId('');
      setPositionId('');
      setStartTime('');
      setEndTime('');
      setAssignmentType('regular');
    }
  }, [isEditing]);

  // Update filtered shift templates when location and position change (for both new and edit modes)
  useEffect(() => {
    if (locationId && positionId && dayOfWeek) {
      console.log('Location/position/day changed, fetching templates for:', { locationId, positionId, dayOfWeek });
      fetchShiftTemplatesForLocationAndPosition(locationId, positionId);
      // Only reset times if we're not in edit mode or if we're changing position
      if (!isEditing || (shift && positionId !== shift.position_id)) {
        setStartTime('');
        setEndTime('');
      }
    } else {
      setFilteredShiftTemplates([]);
    }
  }, [locationId, positionId, dayOfWeek, isEditing, shift]);

  // Auto-select end time if only one option exists for the selected start time
  useEffect(() => {
    if (!startTime) {
      setEndTime('');
      return;
    }
    // Find all end times for the selected start time
    const endTimeOptions = filteredShiftTemplates.filter(template => template.start_time === startTime);
    if (endTimeOptions.length === 1) {
      setEndTime(endTimeOptions[0].end_time);
    } else {
      setEndTime('');
    }
  }, [startTime, filteredShiftTemplates]);

  // Update filtered positions when location changes (for both new and edit modes)
  useEffect(() => {
    if (locationId) {
      console.log('Location changed, fetching positions for:', locationId);
      fetchPositionsForLocation(locationId);
    } else {
      setFilteredPositions([]);
    }
  }, [locationId]);

  const fetchPositionsForLocation = async (locationId: string) => {
    try {
      console.log('Fetching positions for location ID:', locationId);
      const { data: locationPositions, error: locationPositionsError } = await supabase
        .from('location_positions')
        .select('position_id')
        .eq('location_id', locationId);

      if (locationPositionsError) throw locationPositionsError;
      console.log('Location positions:', locationPositions);

      const positionsForLocation = allPositions.filter(pos => 
        locationPositions?.some(lp => lp.position_id === pos.id)
      );
      console.log('Filtered positions:', positionsForLocation);
      setFilteredPositions(positionsForLocation);
      if (positionsForLocation.length === 1) {
        setPositionId(positionsForLocation[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching positions for location:', err);
      setError(err.message);
    }
  };

  const fetchAllShiftTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('shift_templates')
        .select('id, start_time, end_time')
        .order('start_time');

      if (error) throw error;
      setAllShiftTemplates(data || []);
    } catch (err: any) {
      console.error('Error fetching shift templates:', err);
      setError(err.message);
    }
  };

  const fetchShiftTemplatesForLocationAndPosition = async (locationId: string, positionId: string) => {
    try {
      console.log('Fetching templates for:', { locationId, positionId, dayOfWeek });
      
      // Query shift templates with the correct column names
      const { data, error } = await supabase
        .from('shift_templates')
        .select('id, start_time, end_time, days_of_week')
        .eq('location_id', locationId)
        .eq('position_id', positionId);

      if (error) throw error;
      
      console.log('Raw templates data:', data);
      
      // Filter templates to only include those for the selected day of week
      const templatesForDay = data?.filter(template => {
        if (!template.days_of_week || !Array.isArray(template.days_of_week)) {
          console.log('Template missing days_of_week or not an array:', template);
          return false;
        }
        
        // Convert both to lowercase for comparison
        const selectedDay = dayOfWeek.toLowerCase();
        return template.days_of_week.some(day => day.toLowerCase() === selectedDay);
      }) || [];
      
      console.log('Filtered templates for day:', templatesForDay);

      // Remove duplicates based on start_time
      const uniqueTemplates = templatesForDay.reduce((acc, current) => {
        const exists = acc.find(item => item.start_time === current.start_time);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, [] as typeof templatesForDay);
      
      // Sort the unique templates chronologically by start_time
      uniqueTemplates.sort((a, b) => {
        const [aHours, aMinutes] = a.start_time.split(':').map(Number);
        const [bHours, bMinutes] = b.start_time.split(':').map(Number);

        if (aHours !== bHours) {
          return aHours - bHours;
        }
        return aMinutes - bMinutes;
      });

      setFilteredShiftTemplates(uniqueTemplates);
      if (uniqueTemplates.length === 1) {
        setStartTime(uniqueTemplates[0].start_time);
        setEndTime(uniqueTemplates[0].end_time);
      }
    } catch (err: any) {
      console.error('Error fetching shift templates for location and position:', err);
      setError(err.message);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    // Basic validation (can be expanded)
    if (!dayOfWeek || !locationId || !positionId || !startTime || !endTime) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    // Duplicate check
    const isDuplicate = existingRecurringShifts.some(
      (existingShift) => {
        // If editing, skip comparing the shift with its original version if no key fields changed.
        // However, the main check is if the new/edited details match *any other* existing shift.
        if (isEditing && shift && existingShift.id === shift.id) {
          return false; // Don't compare the shift being edited against itself
        }
        return (
          existingShift.day_of_week.toLowerCase() === dayOfWeek.toLowerCase() &&
          existingShift.location_id === locationId &&
          existingShift.position_id === positionId &&
          existingShift.start_time === startTime &&
          existingShift.end_time === endTime
          // We don't check assignment_type for duplication, as a lead vs regular for the same slot is distinct enough
          // and usually wouldn't occur. If it should also be part of uniqueness, add:
          // && existingShift.assignment_type === assignmentType 
        );
      }
    );

    if (isDuplicate) {
      setError('An identical recurring shift already exists for this employee.');
      setLoading(false);
      return;
    }

    const shiftDataToSave = {
      worker_id: employeeId,
      day_of_week: dayOfWeek.toLowerCase(), // Store lowercase in DB
      location_id: locationId,
      position_id: positionId,
      start_time: startTime,
      end_time: endTime,
      assignment_type: assignmentType,
    };

    try {
      let savedShiftResponse;
      let savedShiftId = shift?.id;

      if (isEditing && shift?.id) {
        const { data, error } = await supabase
          .from('recurring_shift_assignments')
          .update(shiftDataToSave)
          .eq('id', shift.id)
          .select()
          .single();
        if (error) throw error;
        savedShiftResponse = data;
      } else {
        const { data, error } = await supabase
          .from('recurring_shift_assignments')
          .insert(shiftDataToSave)
          .select()
          .single();
        if (error) throw error;
        savedShiftResponse = data;
        savedShiftId = data?.id;
      }

      if (!savedShiftResponse || !savedShiftId) {
        throw new Error('Failed to save shift or get ID back.');
      }
      
      const successMessage = isEditing 
        ? "Recurring shift updated successfully."
        : "Recurring shift added successfully.";
      showSuccessToast(successMessage);
      
      // Construct the RecurringShift object for the onSuccess callback
      const selectedLocation = locations.find(loc => loc.id === locationId);
      const selectedPosition = allPositions.find(pos => pos.id === positionId);

      const fullSavedShift: RecurringShift = {
        id: savedShiftId,
        day_of_week: capitalizeDay(savedShiftResponse.day_of_week), // Capitalize for consistency
        location_id: savedShiftResponse.location_id,
        location_name: selectedLocation?.name || 'Unknown Location',
        position_id: savedShiftResponse.position_id,
        position_name: selectedPosition?.name || 'Unknown Position',
        start_time: savedShiftResponse.start_time,
        end_time: savedShiftResponse.end_time,
        assignment_type: savedShiftResponse.assignment_type,
      };
      
      onSuccess({ savedShift: fullSavedShift, isNew: !isEditing });
      handleClose(); // Close modal on success
    } catch (err: any) {
      console.error('Error saving recurring shift:', err);
      setError(err.message || 'Failed to save recurring shift.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-[#f8f9f7]">
        <DialogHeader>
          <DialogTitle className="text-xl font-manrope font-semibold">
            {isEditing ? 'Edit Recurring Shift' : 'Add Recurring Shift'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location">
                    {locationId ? locations.find(loc => loc.id === locationId)?.name : "Select location"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                  {locations.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">Loading locations...</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Position</Label>
              <Select 
                value={positionId} 
                onValueChange={setPositionId}
                disabled={!locationId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={locationId ? "Select position" : "Select a location first"}>
                    {positionId && allPositions.find(p => p.id === positionId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {filteredPositions.map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select 
                value={startTime} 
                onValueChange={setStartTime}
                disabled={!locationId || !positionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    !locationId ? "Select a location first" : 
                    !positionId ? "Select a position first" : 
                    "Select start time"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {filteredShiftTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.start_time}>
                      {formatTime(template.start_time)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>End Time</Label>
              <Select 
                value={endTime} 
                onValueChange={setEndTime}
                disabled={!startTime}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select end time" />
                </SelectTrigger>
                <SelectContent>
                  {filteredShiftTemplates
                    .filter(template => template.start_time === startTime)
                    .map((template) => (
                      <SelectItem key={template.id} value={template.end_time}>
                        {formatTime(template.end_time)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assignment Type</Label>
              <RadioGroup
                value={assignmentType}
                onValueChange={(value: 'lead' | 'regular') => setAssignmentType(value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="regular" id="regular" />
                  <Label htmlFor="regular">Regular</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="lead" id="lead" />
                  <Label htmlFor="lead">Lead</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 