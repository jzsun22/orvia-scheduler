'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { 
  EditableShiftDetails, 
  ShiftAssignmentsWithWorker, 
  Worker, 
  ShiftTemplate, 
  Location, 
  Position } from '../../lib/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, XCircle } from 'lucide-react' 
import { WorkerSelectorDropdown } from '@/components/select/WorkerSelectorDropdown' 
import type { ShiftClickContext } from '@/components/scheduling/ScheduleGrid' 
import { supabase } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { useAppToast } from "@/lib/toast-service"; 
import { APP_TIMEZONE, parseTime as parseAppTime } from '@/lib/scheduling/time-utils';
import { formatInTimeZone } from 'date-fns-tz';
import { capitalizeWords } from '@/lib/utils'; // Added import

const PREP_BARISTA_POSITION_ID = process.env.PREP_BARISTA_POSITION_ID;

// Define NewShiftClientContext matching the one in WorkerSelectorDropdown and API route
// Consider moving to a shared types.ts file if not already there
interface NewShiftClientContext {
  templateId: string;
  shiftDate: string;    // YYYY-MM-DD
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
}

// Helper function to format time to 12-hour AM/PM
// Uses timezone-aware utilities for consistency
function formatTime12hr(timeStr: string | undefined | null): string {
  if (!timeStr) return '';
  try {
    const dateObj = parseAppTime(timeStr); // Parses "HH:mm" string into today's date at that time in APP_TIMEZONE
    // 'h:mmaa' produces "1:00am", "1:00pm". toUpperCase() makes it "1:00AM", "1:00PM".
    return formatInTimeZone(dateObj, APP_TIMEZONE, 'h:mmaa').toUpperCase();
  } catch (error) {
    console.warn(`Error formatting time ${timeStr}:`, error);
    return timeStr; // Fallback to original string if parsing/formatting fails
  }
}

interface EditShiftModalProps {
  isOpen: boolean
  onClose: () => void
  shiftContext: ShiftClickContext | null; // Updated prop
  onSaveSuccess: () => void; // Prop to call after successful save
}

const findAssignment = (assignments: ShiftAssignmentsWithWorker[], type: 'lead' | 'regular' | 'training') => {
  return assignments.find(a => a.assignment_type === type) || null;
}

export function EditShiftModal({ isOpen, onClose, shiftContext, onSaveSuccess }: EditShiftModalProps) {
  const { showSuccessToast } = useAppToast(); // Added hook
  const [shiftDetails, setShiftDetails] = useState<EditableShiftDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false); // For save operation
  const [error, setError] = useState<string | null>(null)
  const [draftAssignments, setDraftAssignments] = useState<ShiftAssignmentsWithWorker[]>([]);
  const [isNewShift, setIsNewShift] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const [timeValidationErrors, setTimeValidationErrors] = useState<{
    primary_start?: string;
    primary_end?: string;
    training_start?: string;
    training_end?: string;
  }>({});

  useEffect(() => {
    console.log('[EditShiftModal useEffect] Running main effect. isOpen:', isOpen, 'shiftContext provided:', !!shiftContext);
    if (!isOpen || !shiftContext) {
      // Clear state if modal is closed or no context
      console.log('[EditShiftModal useEffect] Clearing state (closed or no context).');
      setShiftDetails(null);
      setDraftAssignments([]);
      setError(null);
      setTimeValidationErrors({}); // Clear time validation errors
      setIsNewShift(false);
      return;
    }

    const processShiftContext = async () => {
      setIsLoading(true);
      setError(null);
      setShiftDetails(null); 
      setDraftAssignments([]);

      if (shiftContext.type === 'existing') {
        setIsNewShift(false);
        try {
          console.log('[EditShiftModal useEffect] Fetching existing shift. Context shiftId:', shiftContext.shiftId);
          const response = await fetch(`/api/get-editable-shift-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scheduledShiftId: shiftContext.shiftId }),
          });
          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || `Error: ${response.status}`)
          }
          const data: EditableShiftDetails = await response.json();
          setShiftDetails(data);
          console.log('[EditShiftModal useEffect] Fetched existing shift. Details scheduledShift.id:', data?.scheduledShift?.id);
          // Log the received currentAssignments in detail
          console.log('[EditShiftModal useEffect] Received currentAssignments from API:', JSON.stringify(data?.currentAssignments, null, 2));
          setDraftAssignments(data.currentAssignments || []);
        } catch (e: any) {
          console.error('Failed to fetch shift details for existing shift:', e);
          setError(e.message || 'Failed to load shift details.');
        }
      } else if (shiftContext.type === 'new') {
        setIsNewShift(true);
        // Construct EditableShiftDetails from the context for a new shift
        // This assumes we don't need to fetch full Location/Position objects by ID for the initial modal display
        // and can work with IDs, or the parent (ScheduleGrid) would need to pass more complete objects.
        
        let fetchedLocationName = `Location ID: ${shiftContext.locationId}`;
        let fetchedPositionName = `Position ID: ${shiftContext.positionId}`;

        try {
          const [locationRes, positionRes] = await Promise.all([
            supabase.from('locations').select('name').eq('id', shiftContext.locationId).single(),
            supabase.from('positions').select('name').eq('id', shiftContext.positionId).single(),
          ]);

          if (locationRes.data?.name) {
            fetchedLocationName = locationRes.data.name;
          } else if (locationRes.error) {
            console.warn(`New shift: Failed to fetch location name for ID ${shiftContext.locationId}:`, locationRes.error.message);
          }

          if (positionRes.data?.name) {
            fetchedPositionName = positionRes.data.name;
          } else if (positionRes.error) {
            console.warn(`New shift: Failed to fetch position name for ID ${shiftContext.positionId}:`, positionRes.error.message);
          }
        } catch (fetchError: any) {
          console.error('New shift: Error fetching location/position names:', fetchError.message);
          // Fallback names are already set, so we can continue
        }
        
        const partialLocation: Location = { id: shiftContext.locationId, name: fetchedLocationName };
        const partialPosition: Position = { id: shiftContext.positionId, name: fetchedPositionName };
        
        // Minimal ShiftTemplate object from context
        const partialShiftTemplate: ShiftTemplate = {
            id: shiftContext.templateId,
            location_id: shiftContext.locationId,
            position_id: shiftContext.positionId,
            days_of_week: [], // Not strictly needed for modal display of one shift
            start_time: shiftContext.startTime,
            end_time: shiftContext.endTime,
            lead_type: (shiftContext.leadType === 'opening' || shiftContext.leadType === 'closing' || shiftContext.leadType === null || shiftContext.leadType === undefined) ? shiftContext.leadType : null
        };

        let determinedShiftType: EditableShiftDetails['shiftType'] = 'non-lead';
        if (shiftContext.leadType === 'opening') {
            determinedShiftType = 'opening-lead';
        } else if (shiftContext.leadType === 'closing') {
            determinedShiftType = 'closing-lead';
        }

        const constructedDetails: EditableShiftDetails = {
          scheduledShift: {
            // No id for a new shift until it's saved
            id: `new-shift-${crypto.randomUUID()}`, // Temporary client-side ID, won't be saved
            shift_date: shiftContext.dateString,
            template_id: shiftContext.templateId,
            worker_id: undefined,
            location_id: shiftContext.locationId,
            position_id: shiftContext.positionId,
            start_time: shiftContext.startTime,
            end_time: shiftContext.endTime,
            is_recurring_generated: false,
            created_at: new Date().toISOString(),
          },
          shiftTemplate: partialShiftTemplate,
          currentAssignments: [], // New shift has no current assignments
          shiftType: determinedShiftType,
          location: partialLocation, 
          position: partialPosition,
        };
        setShiftDetails(constructedDetails);
        setDraftAssignments([]); // Start with empty assignments for a new shift
      }
      setIsLoading(false);
    };

    processShiftContext();
  }, [isOpen, shiftContext]);

  const handleClose = () => {
    // Reset internal states on close, parent handles isOpen
    setShiftDetails(null);
    setDraftAssignments([]);
    setError(null);
    setTimeValidationErrors({}); // Clear time validation errors
    setIsNewShift(false);
    onClose(); // Call the parent's onClose handler
  }

  const getPrimaryAssignmentType = useCallback((): 'lead' | 'regular' | null => {
    if (!shiftDetails) return null;
    // Use shiftDetails.shiftType which is now correctly set for new shifts too
    if (shiftDetails.shiftType === 'opening-lead' || shiftDetails.shiftType === 'closing-lead') {
      return 'lead';
    }
    if (shiftDetails.shiftType === 'non-lead') {
      return 'regular';
    }
    return null;
  }, [shiftDetails]);

  const primaryAssignmentType = getPrimaryAssignmentType();
  // console.log('[EditShiftModal render] shiftDetails available:', !!shiftDetails);
  // console.log('[EditShiftModal render] Calculated primaryAssignmentType:', primaryAssignmentType);
  
  const primaryAssignment = primaryAssignmentType ? findAssignment(draftAssignments, primaryAssignmentType) : null;
  const trainingAssignment = findAssignment(draftAssignments, 'training');

  const validateAssignmentTime = useCallback((
    assignmentType: 'lead' | 'regular' | 'training',
    field: 'assigned_start' | 'assigned_end',
    value: string | null | undefined,
    currentDrafts: ShiftAssignmentsWithWorker[] // Pass current draft assignments
  ): string | undefined => {
    if (!value || !shiftDetails?.scheduledShift) return undefined;

    const originalStartTime = shiftDetails.scheduledShift.start_time;
    const originalEndTime = shiftDetails.scheduledShift.end_time;

    if (field === 'assigned_start' && value < originalStartTime) {
      return `Start cannot be before ${formatTime12hr(originalStartTime)}.`;
    }
    if (field === 'assigned_end' && value > originalEndTime) {
      return `End cannot be after ${formatTime12hr(originalEndTime)}.`;
    }

    const currentAssignment = currentDrafts.find(a => a.assignment_type === assignmentType);
    if (currentAssignment) {
      const checkStart = field === 'assigned_start' ? value : currentAssignment.assigned_start;
      const checkEnd = field === 'assigned_end' ? value : currentAssignment.assigned_end;

      if (checkStart && checkEnd && checkStart > checkEnd) {
        return field === 'assigned_start' ? 'Start after end.' : 'End before start.';
      }
    }
    return undefined;
  }, [shiftDetails]);

  const handlePrimaryWorkerChange = (worker: Worker | null) => {
    if (!primaryAssignmentType || !shiftDetails || !shiftDetails.scheduledShift /* Check scheduledShift exists */) return;
    const currentScheduledShiftId = shiftDetails.scheduledShift.id; 

    setDraftAssignments(prev => {
      const otherAssignments = prev.filter(a => a.assignment_type !== primaryAssignmentType);
      if (worker) {
        // If primaryAssignment existed and had a persistent ID, reuse it.
        // Otherwise, it's a new primary assignment for this slot.
        const isExistingPersistentAssignment = primaryAssignment && primaryAssignment.id && !primaryAssignment.id.startsWith('new-assignment-');
        const newPrimaryAssignment: ShiftAssignmentsWithWorker = {
          id: isExistingPersistentAssignment ? primaryAssignment.id : `new-assignment-${crypto.randomUUID()}`,
          scheduled_shift_id: currentScheduledShiftId, 
          worker_id: worker.id,
          workers: worker, 
          assignment_type: primaryAssignmentType,
          is_manual_override: true, 
          created_at: primaryAssignment?.created_at || new Date().toISOString(),
          // Ensure assigned_start and assigned_end are carried over if they existed, or null/undefined if new
          assigned_start: isExistingPersistentAssignment ? primaryAssignment.assigned_start : null,
          assigned_end: isExistingPersistentAssignment ? primaryAssignment.assigned_end : null,
        };
        return [...otherAssignments, newPrimaryAssignment];
      } else {
        // If worker is null, we are effectively unassigning. 
        // If primaryAssignment existed, keep it but with worker_id: null (or handle as per your app's logic for unassignment)
        // For now, this logic implies removing it if the worker is nullified.
        // If your backend expects an assignment with worker_id=null to denote unassignment, adjust here.
        // The current backend logic for add/modify doesn't explicitly handle unassignment via null worker_id in an update,
        // it expects a workerId for updates/adds. Deletion is a separate action.
        return otherAssignments; // Effectively removes the primary assignment if worker is null
      }
    });
  };

  const handleTrainingWorkerChange = (worker: Worker | null) => {
    if (!shiftDetails || !shiftDetails.scheduledShift) return;
    const currentScheduledShiftId = shiftDetails.scheduledShift.id;

    setDraftAssignments(prev => {
      const otherAssignments = prev.filter(a => a.assignment_type !== 'training');
      if (worker) {
        const isExistingPersistentAssignment = trainingAssignment && trainingAssignment.id && !trainingAssignment.id.startsWith('new-assignment-');
        const newTrainingAssignment: ShiftAssignmentsWithWorker = {
          id: isExistingPersistentAssignment ? trainingAssignment.id : `new-assignment-${crypto.randomUUID()}`,
          scheduled_shift_id: currentScheduledShiftId,
          worker_id: worker.id,
          workers: worker, 
          assignment_type: 'training',
          is_manual_override: true,
          created_at: trainingAssignment?.created_at || new Date().toISOString(),
          assigned_start: isExistingPersistentAssignment ? trainingAssignment.assigned_start : null,
          assigned_end: isExistingPersistentAssignment ? trainingAssignment.assigned_end : null,
        };
        return [...otherAssignments, newTrainingAssignment];
      }
      return otherAssignments; // Effectively removes the training assignment if worker is null
    });
  }; 
  const canAddTraining = primaryAssignment && !trainingAssignment;

  const handleUnassignPrimaryAndTrainingFromDraft = () => {
    if (!primaryAssignmentType) return; // Should not happen if button is visible

    setDraftAssignments(prev => {
      // Filter out the primary assignment and any training assignment
      return prev.filter(a => {
        const isPrimary = a.assignment_type === primaryAssignmentType;
        const isTraining = a.assignment_type === 'training';
        return !isPrimary && !isTraining;
      });
    });
    // Clear any time validation errors related to these removed assignments
    setTimeValidationErrors(prevErrors => ({
      ...prevErrors,
      primary_start: undefined,
      primary_end: undefined,
      training_start: undefined,
      training_end: undefined,
    }));
  };

  // Determine the scheduledShiftId to pass to WorkerSelectorDropdown
  // For a new shift, it might not have a real backend ID yet.
  // The dropdown needs a stable string, but it's mostly for fetching eligible workers for THAT shift context.
  // Using templateId + dateString might be a more stable key for fetching eligible workers for a NEW shift slot.
  // However, WorkerSelectorDropdown currently expects a scheduledShiftId string or null.
  // For now, we pass the temporary client-side ID for new shifts, or the real one for existing.
  const effectiveScheduledShiftIdForDropdown = shiftDetails?.scheduledShift?.id || null;

  // Prepare the newShiftClientContext if this is a new shift
  let newShiftContextForDropdown: NewShiftClientContext | null = null;
  if (isNewShift && shiftDetails?.scheduledShift && shiftDetails.shiftTemplate) {
    // For a new shift, shiftDetails.scheduledShift contains date, start/end times, template_id
    // which were derived from the initial shiftContext prop when this modal opened for a new slot.
    newShiftContextForDropdown = {
      templateId: shiftDetails.scheduledShift.template_id,
      shiftDate: shiftDetails.scheduledShift.shift_date,    // This was shiftContext.dateString
      startTime: shiftDetails.scheduledShift.start_time,  // This was shiftContext.startTime
      endTime: shiftDetails.scheduledShift.end_time,    // This was shiftContext.endTime
    };
    // console.log('[EditShiftModal] Preparing newShiftContextForDropdown for a new shift:', newShiftContextForDropdown);
  } else {
    // console.log('[EditShiftModal] Not a new shift or details missing, newShiftContextForDropdown will be null. isNewShift:', isNewShift, 'has shiftDetails:', !!shiftDetails);
  }

  // Helper to format worker names consistently, similar to WorkerSelectorDropdown
  // (Consider moving to shared utils if Worker type is globally defined and accessible)
  const formatWorkerNameWithLevel = (worker: { first_name?: string | null, last_name?: string | null, preferred_name?: string | null, job_level?: string | null } | null | undefined): string => {
    if (!worker) return "N/A";
    const firstName = worker.first_name || '';
    const lastName = worker.last_name || '';
    const level = worker.job_level ? `-${worker.job_level}` : '';
    if (worker.preferred_name && worker.preferred_name.trim() !== '') {
      return `${firstName} (${worker.preferred_name}) ${lastName}${level}`.trim().replace(/\s+/g, ' ');
    }
    return `${firstName} ${lastName}${level}`.trim().replace(/\s+/g, ' ');
  };

  const handleAssignmentTimeChange = (assignmentType: 'lead' | 'regular' | 'training', field: 'assigned_start' | 'assigned_end', value: string) => {
    setDraftAssignments(prevDrafts => {
      const newDrafts = prevDrafts.map(a => {
        if (a.assignment_type === assignmentType) {
          return { ...a, [field]: value || null }; // Store null if value is empty string
        }
        return a;
      });

      // Perform validation after updating the draft state
      const validationError = validateAssignmentTime(assignmentType, field, value || null, newDrafts);
      const errorKey = `${assignmentType === primaryAssignmentType ? 'primary' : 'training'}_${field.split('_')[1]}` as keyof typeof timeValidationErrors;
      
      setTimeValidationErrors(prevErrors => ({
        ...prevErrors,
        [errorKey]: validationError,
      }));
      
      // Also clear the cross-validation error for the other field if this one becomes valid or empty
      // e.g., if assigned_start is changed, re-validate assigned_end in context of new start
      if (!validationError) {
        const otherField = field === 'assigned_start' ? 'assigned_end' : 'assigned_start';
        const otherValue = newDrafts.find(a => a.assignment_type === assignmentType)?.[otherField];
        if (otherValue) {
          const otherErrorKey = `${assignmentType === primaryAssignmentType ? 'primary' : 'training'}_${otherField.split('_')[1]}` as keyof typeof timeValidationErrors;
          const otherValidationError = validateAssignmentTime(assignmentType, otherField, otherValue, newDrafts);
          setTimeValidationErrors(prevErrors => ({
            ...prevErrors,
            [otherErrorKey]: otherValidationError,
          }));
        }
      }
      return newDrafts;
    });
  };

  const handleResetAssignmentTimes = (assignmentType: 'lead' | 'regular' | 'training') => {
    setDraftAssignments(prev => prev.map(a => {
      if (a.assignment_type === assignmentType) {
        return { 
          ...a, 
          assigned_start: null, // Reset to null 
          assigned_end: null    // Reset to null
        };
      }
      return a;
    }));
    // Clear validation errors for the reset fields
    const prefix = assignmentType === primaryAssignmentType ? 'primary' : 'training';
    setTimeValidationErrors(prevErrors => ({
      ...prevErrors,
      [`${prefix}_start`]: undefined,
      [`${prefix}_end`]: undefined,
    }));
  };

  const isPrepBaristaShift = shiftDetails?.position?.id === PREP_BARISTA_POSITION_ID;

  const renderPrimaryAssignmentSlot = () => {
    if (!shiftDetails || !primaryAssignmentType ) return null;
    const assignment = primaryAssignment;
    const showResetButton = assignment && (assignment.assigned_start || assignment.assigned_end);

    return (
      <div className="space-y-2 p-3 border rounded-lg bg-background">
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-semibold text-md capitalize">{primaryAssignmentType} Worker:</h4>
          {assignment && ( // Show unassign button only if a primary worker is assigned in draft
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleUnassignPrimaryAndTrainingFromDraft} 
              className="text-red-500 hover:text-red-700 h-7 px-2"
              disabled={isLoading || isSaving}
            >
              <XCircle className="mr-1 h-4 w-4" /> Unassign
            </Button>
          )}
        </div>
        <WorkerSelectorDropdown
            key="primary-assignment-selector"
            scheduledShiftId={effectiveScheduledShiftIdForDropdown}
            newShiftClientContext={newShiftContextForDropdown}
            targetAssignmentType={primaryAssignmentType}
            currentWorkerId={assignment?.worker_id}
            onWorkerSelect={handlePrimaryWorkerChange}
            placeholder={`Select ${primaryAssignmentType}...`}
            disabled={isLoading}
            popoverContainerRef={dialogContentRef}
            excludeWorkerId={trainingAssignment?.worker_id || null}
        />
        {assignment && assignment.workers && (
          <p className="text-xs text-muted-foreground ml-1">
            {assignment.is_manual_override && assignment.assigned_start && assignment.assigned_end && !isPrepBaristaShift // Show times only if not PrepBarista
              ? `${formatWorkerNameWithLevel(assignment.workers)} (${formatTime12hr(assignment.assigned_start)} - ${formatTime12hr(assignment.assigned_end)})`
              : formatWorkerNameWithLevel(assignment.workers)}
          </p>
        )}
        {assignment && assignment.workers && !isPrepBaristaShift && ( // Hide time inputs for Prep Barista
          <div className="flex gap-2 mt-2 items-start">
            <div className="flex flex-col">
              <label className="block text-xs font-medium mb-1" htmlFor="primary-assigned-start">Start</label>
              <Input
                id="primary-assigned-start"
                type="time"
                value={assignment.assigned_start || ''} // Use empty string if null for input value
                onChange={e => handleAssignmentTimeChange(primaryAssignmentType, 'assigned_start', e.target.value)}
                className="w-28"
                step="300"
              />
              <div className="min-h-[1.25rem] mt-1">
                {timeValidationErrors.primary_start && <p className="text-xs text-red-500">{timeValidationErrors.primary_start}</p>}
              </div>
            </div>
            <div className="flex flex-col">
              <label className="block text-xs font-medium mb-1" htmlFor="primary-assigned-end">End</label>
              <Input
                id="primary-assigned-end"
                type="time"
                value={assignment.assigned_end || ''} // Use empty string if null for input value
                onChange={e => handleAssignmentTimeChange(primaryAssignmentType, 'assigned_end', e.target.value)}
                className="w-28"
                step="300"
              />
              <div className="min-h-[1.25rem] mt-1">
                {timeValidationErrors.primary_end && <p className="text-xs text-red-500">{timeValidationErrors.primary_end}</p>}
              </div>
            </div>
            {showResetButton && (
              <Button 
                variant="link"
                size="sm"
                onClick={() => handleResetAssignmentTimes(primaryAssignmentType)}
                className="h-9 px-2 text-xs text-blue-600 hover:text-blue-800 self-end mb-[1.25rem]"
              >
                Reset Times
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderTrainingAssignmentSlot = () => {
    if (isPrepBaristaShift) { // No training slot for Prep Barista
      return null;
    }
    if (!shiftDetails || !primaryAssignmentType ) return null;
    const assignment = trainingAssignment;
    // If primaryAssignmentType is 'lead', training can be added even if primary (lead) isn't assigned yet.
    // If primaryAssignmentType is 'regular', primary (regular) MUST be assigned before training can be added.
    const canEnableTrainingSlot = primaryAssignmentType === 'lead' || (primaryAssignmentType === 'regular' && primaryAssignment);
    const showResetButton = assignment && (assignment.assigned_start || assignment.assigned_end);

    return (
      <div className="space-y-2 p-3 border rounded-lg bg-background mt-3">
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-semibold text-md">(Optional) Training Worker:</h4>
          {assignment && (
            <Button variant="ghost" size="sm" onClick={() => handleTrainingWorkerChange(null)} className="text-red-500 hover:text-red-700 h-7 px-2">
              <XCircle className="mr-1 h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        {(assignment || canAddTraining) && canEnableTrainingSlot ? (
          <>
            <WorkerSelectorDropdown
                key="training-assignment-selector"
                scheduledShiftId={effectiveScheduledShiftIdForDropdown}
                newShiftClientContext={newShiftContextForDropdown}
                targetAssignmentType="training"
                currentWorkerId={assignment?.worker_id}
                onWorkerSelect={handleTrainingWorkerChange}
                placeholder="Select training worker..."
                // Disable if primary is not selected (for regular shifts) or if loading
                disabled={isLoading || (primaryAssignmentType === 'regular' && !primaryAssignment)}
                popoverContainerRef={dialogContentRef}
                excludeWorkerId={primaryAssignment?.worker_id || null}
            />
            {assignment && assignment.workers && ( // Hide time inputs for Prep Barista (already handled by function return)
              <>
                <p className="text-xs text-muted-foreground ml-1">
                  {assignment.is_manual_override && assignment.assigned_start && assignment.assigned_end
                    ? `${formatWorkerNameWithLevel(assignment.workers)} (${formatTime12hr(assignment.assigned_start)} - ${formatTime12hr(assignment.assigned_end)})`
                    : formatWorkerNameWithLevel(assignment.workers)}
                </p>
                <div className="flex gap-2 mt-2 items-start">
                  <div className="flex flex-col">
                    <label className="block text-xs font-medium mb-1" htmlFor="training-assigned-start">Start</label>
                    <Input
                      id="training-assigned-start"
                      type="time"
                      value={assignment.assigned_start || ''} // Use empty string if null for input value
                      onChange={e => handleAssignmentTimeChange('training', 'assigned_start', e.target.value)}
                      className="w-28"
                      step="300"
                    />
                    <div className="min-h-[1.25rem] mt-1">
                      {timeValidationErrors.training_start && <p className="text-xs text-red-500">{timeValidationErrors.training_start}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="block text-xs font-medium mb-1" htmlFor="training-assigned-end">End</label>
                    <Input
                      id="training-assigned-end"
                      type="time"
                      value={assignment.assigned_end || ''} // Use empty string if null for input value
                      onChange={e => handleAssignmentTimeChange('training', 'assigned_end', e.target.value)}
                      className="w-28"
                      step="300"
                    />
                    <div className="min-h-[1.25rem] mt-1">
                      {timeValidationErrors.training_end && <p className="text-xs text-red-500">{timeValidationErrors.training_end}</p>}
                    </div>
                  </div>
                  {showResetButton && (
                    <Button 
                      variant="link"
                      size="sm"
                      onClick={() => handleResetAssignmentTimes('training')}
                      className="h-9 px-2 text-xs text-blue-600 hover:text-blue-800 self-end mb-[1.25rem]"
                    >
                      Reset Times
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        ) : primaryAssignmentType === 'regular' && !primaryAssignment ? (
          <p className="text-xs text-muted-foreground p-2 text-center">Assign a regular worker before adding a trainee.</p>
        ) : null}
      </div>
    );
  };
  
  const dialogTitle = isNewShift ? "Assign New Shift" : "Edit Shift";
  const shiftDateStr = shiftDetails?.scheduledShift?.shift_date;
  const dialogDescriptionDate = shiftDateStr
    ? formatInTimeZone(shiftDateStr, APP_TIMEZONE, 'M/d/yyyy') // Correctly format date in APP_TIMEZONE
    : "";
  const formattedStartTime = formatTime12hr(shiftDetails?.scheduledShift?.start_time);
  const formattedEndTime = formatTime12hr(shiftDetails?.scheduledShift?.end_time);
  const dialogDescriptionTime = shiftDetails?.scheduledShift ? `${formattedStartTime} - ${formattedEndTime}` : "";
  const dialogLocationName = capitalizeWords(shiftDetails?.location?.name) || (shiftContext?.type === 'new' ? `Location ID: ${shiftContext.locationId}` : "");
  const dialogTemplateName = shiftDetails?.shiftTemplate?.id 
    ? `Template ID: ${shiftDetails.shiftTemplate.id}` 
    : (shiftContext?.type === 'new' && shiftContext.templateId ? `Template ID: ${shiftContext.templateId}` : "");
  
  let dialogPositionName = capitalizeWords(shiftDetails?.position?.name) || (shiftContext?.type === 'new' ? `Position ID: ${shiftContext.positionId}` : "");
  if (isPrepBaristaShift) {
    dialogPositionName = "Prep / Barista";
  }

  const handleSaveChanges = async () => {
    if (!shiftDetails || !shiftDetails.scheduledShift) {
      setError("Cannot save: Shift details are missing.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setTimeValidationErrors({}); // Clear previous errors before new save attempt

    // Perform final validation before saving (only if not Prep Barista, as times are fixed for them)
    let finalValidationOk = true;
    if (!isPrepBaristaShift) {
        const currentValidationErrors: typeof timeValidationErrors = {};
        draftAssignments.forEach(assignment => {
          if (assignment.assigned_start || assignment.assigned_end) { // Only validate if custom times are set
            const assignmentCategory = assignment.assignment_type === primaryAssignmentType ? 'primary' : 'training';
            
            if (assignment.assigned_start) {
              const startError = validateAssignmentTime(assignment.assignment_type, 'assigned_start', assignment.assigned_start, draftAssignments);
              if (startError) {
                finalValidationOk = false;
                currentValidationErrors[`${assignmentCategory}_start`] = startError;
              }
            }
            if (assignment.assigned_end) {
              const endError = validateAssignmentTime(assignment.assignment_type, 'assigned_end', assignment.assigned_end, draftAssignments);
              if (endError) {
                finalValidationOk = false;
                currentValidationErrors[`${assignmentCategory}_end`] = endError;
              }
            }
          }
        });
        if (!finalValidationOk) {
          setTimeValidationErrors(currentValidationErrors);
          setError("Invalid custom times. Please correct the highlighted errors.");
          setIsSaving(false);
          return;
        }
    }
    
    const scheduledShiftData = shiftDetails.scheduledShift;
    const assignmentsToSave = draftAssignments.map(a => ({
        id: (a.id.startsWith('new-assignment-') || a.id.startsWith('new-shift-')) ? undefined : a.id,
        scheduled_shift_id: isNewShift ? undefined : scheduledShiftData.id, 
        worker_id: a.worker_id,
        assignment_type: a.assignment_type,
        is_manual_override: a.is_manual_override,
        // For Prep Barista, always send null for custom times as they are not allowed
        assigned_start: isPrepBaristaShift ? null : (a.assigned_start || null), 
        assigned_end: isPrepBaristaShift ? null : (a.assigned_end || null),     
    }));

    // Filter out training assignments if it's a Prep Barista shift before saving
    const finalAssignmentsToSave = isPrepBaristaShift 
        ? assignmentsToSave.filter(a => a.assignment_type !== 'training') 
        : assignmentsToSave;

    try {
      let response;
      if (isNewShift) {
        const payload = {
          shiftData: { 
            shift_date: scheduledShiftData.shift_date,
            template_id: scheduledShiftData.template_id,
            start_time: scheduledShiftData.start_time,
            end_time: scheduledShiftData.end_time,
          },
          assignments: finalAssignmentsToSave, // Use filtered assignments
        };
        console.log('[EditShiftModal] Saving new shift with payload:', JSON.stringify(payload, null, 2));
        response = await fetch('/api/create-shift-with-assignments', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const payload = {
          scheduledShiftId: scheduledShiftData.id,
          assignments: finalAssignmentsToSave, // Use filtered assignments
        };
        console.log('[EditShiftModal] Updating existing shift with payload:', JSON.stringify(payload, null, 2));
        response = await fetch('/api/update-shift-assignments', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save changes: ${response.statusText}`);
      }
      // Determine the correct success message
      const successMessage = isNewShift 
        ? "New shift assigned successfully."
        : "Shift updated successfully.";
      showSuccessToast(successMessage); // Show success toast
      onSaveSuccess(); 
      handleClose(); 
    } catch (e: any) {
      console.error('Failed to save shift changes:', e);
      setError(e.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={(open) => (open ? null : handleClose())}
    >
      <DialogContent 
        ref={dialogContentRef}
        className="sm:max-w-[525px]"
        onPointerDownOutside={(event) => {
          if ((event.target as HTMLElement)?.closest('[data-radix-interactable-popover]')) {
            console.log('[EditShiftModal] Dialog onPointerDownOutside: Interaction on interactable popover, preventing default.');
            event.preventDefault();
          } else {
            console.log('[EditShiftModal] Dialog onPointerDownOutside: Normal outside interaction.');
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          {shiftDetails && (
            <DialogDescription>
              {dialogPositionName}
              {' @ '}{dialogLocationName}
              {' ('}{dialogDescriptionDate}, {dialogDescriptionTime})
              {isPrepBaristaShift && <span className="block text-xs text-muted-foreground mt-1">(Note: This is a paired Prep/Barista shift. Worker will cover both AM/PM blocks.)</span>}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 mt-2">Loading shift details...</p>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {shiftDetails && !isLoading && !error && (
          <div className="grid gap-4 py-4">
            {renderPrimaryAssignmentSlot()}
            {renderTrainingAssignmentSlot()} {/* This will return null for Prep Barista based on its internal logic */}
            
            {/* <pre className="mt-4 p-2 bg-muted text-xs rounded-md overflow-x-auto">
              {JSON.stringify({ shiftContext, isNewShift, shiftDetails, draftAssignments }, null, 2)}
            </pre> */}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>Cancel</Button>
          <Button 
            type="submit" 
            disabled={isLoading || isSaving || !shiftDetails || Object.values(timeValidationErrors).some(err => !!err)}
            onClick={handleSaveChanges}
          >
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 