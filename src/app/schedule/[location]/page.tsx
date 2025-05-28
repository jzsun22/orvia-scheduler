"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { generateWeeklySchedule } from "@/lib/scheduling/scheduleGenerator";
import ScheduleGrid, { type ShiftClickContext } from "@/components/scheduling/ScheduleGrid";
import WeekNavigator from "@/components/scheduling/WeekNavigator";
import { Button } from "@/components/ui/button";
import { EditShiftModal } from "@/components/modals/EditShiftModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppToast } from "@/lib/toast-service";

const PT_TIMEZONE = 'America/Los_Angeles';

// Helper to get a Date object representing midnight PT for a given PT year, month, day
function getPTMidnightDate(year: number, month: number, day: number): Date {
  const sampleUTCNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const sampleDateObj = new Date(sampleUTCNoon);
  const ptHourAtUTCNoonStr = sampleDateObj.toLocaleTimeString('en-US', {
    timeZone: PT_TIMEZONE,
    hour12: false,
    hour: '2-digit',
  });
  const ptHourAtUTCNoon = parseInt(ptHourAtUTCNoonStr);
  let utcHourForPTMidnight = (12 - ptHourAtUTCNoon + 24) % 24;
  return new Date(Date.UTC(year, month - 1, day, utcHourForPTMidnight, 0, 0));
}

// Helper to get the Date object for Monday 00:00 PT of the week containing referenceDate
function getWeekStartPT(referenceDate: Date): Date {
  const ptDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [refYearPT, refMonthPT, refDayPT] = ptDateFormatter.format(referenceDate).split('-').map(Number);
  let noonOnRefDayPT = getPTMidnightDate(refYearPT, refMonthPT, refDayPT);
  noonOnRefDayPT.setUTCHours(noonOnRefDayPT.getUTCHours() + 12);
  const dayOfWeekStrPT = noonOnRefDayPT.toLocaleDateString('en-US', {
    timeZone: PT_TIMEZONE,
    weekday: 'short',
  });
  const dayMapPT: { [key: string]: number } = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeekInPT = dayMapPT[dayOfWeekStrPT] !== undefined ? dayMapPT[dayOfWeekStrPT] : new Date().getDay();
  const daysToSubtract = (dayOfWeekInPT - 1 + 7) % 7;
  const mondayAtNoonPT = new Date(noonOnRefDayPT.getTime());
  mondayAtNoonPT.setUTCDate(mondayAtNoonPT.getUTCDate() - daysToSubtract);
  const [monYearPT, monMonthPT, monDayPT] = ptDateFormatter.format(mondayAtNoonPT).split('-').map(Number);
  return getPTMidnightDate(monYearPT, monMonthPT, monDayPT);
}

interface Location {
  id: string;
  name: string;
}

interface Worker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name?: string | null;
  job_level?: string | null;
}

interface ShiftTemplate {
  id: string;
  location_id: string | null;
  position_id: string | null;
  days_of_week: string[] | null;
  start_time: string;
  end_time: string;
  lead_type?: string | null;
  schedule_column_group?: number | null;
}

interface Position {
  id: string;
  name: string;
}

// New interface for data passed to ScheduleGrid
interface ScheduledShiftForGrid {
  id: string; 
  shift_date: string; 
  template_id: string | null; 
  start_time: string | null; 
  end_time: string | null; 
  is_recurring_generated: boolean | null; 
  positionName?: string; // Derived
  
  // Primary assignment details
  worker_id: string | null; 
  workerName?: string; // Assigned worker's formatted name
  job_level?: string | null;
  assigned_start?: string | null; 
  assigned_end?: string | null;  
  is_manual_override?: boolean | null; // From shift_assignments

  // Training assignment details
  trainingWorkerId?: string | null;
  trainingWorkerName?: string; // Trainee's Preferred or First name
  trainingWorkerAssignedStart?: string | null; 
  trainingWorkerAssignedEnd?: string | null;   
  isTrainingAssignmentManuallyOverridden?: boolean | null;
}

// Capitalize function for display purposes if needed, but not for DB querying of location name
function capitalize(str: string) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const ButtonWrapper: React.FC<{
  isDisabled: boolean;
  showTooltip: boolean;
  tooltipText: string;
  children: React.ReactElement; // Expect a single ReactElement child (the Button)
}> = ({ isDisabled, showTooltip, tooltipText, children }) => {
  const spanContent = (
    <span
      className={isDisabled ? "inline-block cursor-not-allowed" : "inline-block"}
      tabIndex={showTooltip && isDisabled ? 0 : undefined}
    >
      {/* Pass through style to the child button for pointer-events */} 
      {React.cloneElement(children, { style: { ...(children.props.style || {}), pointerEvents: isDisabled ? 'none' : 'auto' } })}
    </span>
  );

  if (showTooltip && isDisabled) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{spanContent}</TooltipTrigger>
          <TooltipContent><p>{tooltipText}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return spanContent;
};

const SchedulePage = () => {
  const params = useParams();
  const searchParams = useSearchParams(); 
  const router = useRouter();
  const { showSuccessToast } = useAppToast();
  const locationSlug = params?.location as string;

  const [location, setLocation] = useState<Location | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allShiftTemplates, setAllShiftTemplates] = useState<ShiftTemplate[]>([]); 
  const [scheduledShifts, setScheduledShifts] = useState<ScheduledShiftForGrid[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStartPT(new Date()));
  const [positions, setPositions] = useState<Position[]>([]);

  const [editMode, setEditMode] = useState(false);
  const [selectedShiftModalContext, setSelectedShiftModalContext] = useState<ShiftClickContext | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPastWeek, setIsPastWeek] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [baseMetaLoading, setBaseMetaLoading] = useState(true);
  const [shiftsDataLoading, setShiftsDataLoading] = useState(true);

  useEffect(() => {
    if (!locationSlug) return;
    const weekParam = searchParams.get('week');
    const ptDateFormatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' 
    });
    let derivedMondayFromUrl: Date;
    let needsUrlUpdate = false;
    let newUrlWeekParam: string = '';

    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      const [year, month, day] = weekParam.split('-').map(Number);
      const dateFromParamAsPTMidnight = getPTMidnightDate(year, month, day);
      derivedMondayFromUrl = getWeekStartPT(dateFromParamAsPTMidnight);
      const canonicalUrlParamForDerivedDate = ptDateFormatter.format(derivedMondayFromUrl);
      if (weekParam !== canonicalUrlParamForDerivedDate) {
        needsUrlUpdate = true;
        newUrlWeekParam = canonicalUrlParamForDerivedDate;
      } else {
        newUrlWeekParam = weekParam;
      }
    } else {
      derivedMondayFromUrl = getWeekStartPT(new Date());
      needsUrlUpdate = true;
      newUrlWeekParam = ptDateFormatter.format(derivedMondayFromUrl);
    }

    if (weekStart.getTime() !== derivedMondayFromUrl.getTime()) {
      setWeekStart(derivedMondayFromUrl);
    }

    if (needsUrlUpdate && weekParam !== newUrlWeekParam) {
       router.push(`/schedule/${locationSlug}?week=${newUrlWeekParam}`, { scroll: false });
    }
  }, [searchParams, locationSlug, router]);

  useEffect(() => {
    const currentWeekMondayPT = getWeekStartPT(new Date());
    setIsPastWeek(weekStart.getTime() < currentWeekMondayPT.getTime());
  }, [weekStart]);

  useEffect(() => {
    const fetchLocationData = async () => {
      if (!locationSlug) {
        setLocationLoading(false); setLocation(null); return;
      }
      setLocationLoading(true);
      try {
        const querySlug = locationSlug.toLowerCase().trim();

        const { data, error } = await supabase.from("locations").select("id, name").eq("name", querySlug).single();
        
        if (error) { 
          console.error(`Error fetching location for slug '${querySlug}':`, error.message); 
          setLocation(null); 
        } else if (data) { 
          setLocation(data);
        } else {
          console.warn(`No location data returned for slug '${querySlug}' (and no error from .single()). This is unexpected.`); 
          setLocation(null); 
        }
      } catch (e) { 
        console.error("Exception fetching location:", e); 
        setLocation(null); 
      }
      finally { 
        setLocationLoading(false); 
      }
    };
    fetchLocationData();
  }, [locationSlug]);

  useEffect(() => {
    const fetchBaseMetadata = async () => {
      setBaseMetaLoading(true);
      try {
        const [workersRes, templatesRes, positionsRes] = await Promise.all([
          supabase.from("workers").select("id, first_name, last_name, preferred_name, job_level"),
          supabase.from("shift_templates").select("*"), 
          supabase.from("positions").select("id, name"),
        ]);
        if (!workersRes.error && workersRes.data) setWorkers(workersRes.data);
        else console.error("Error fetching workers:", workersRes.error?.message);
        if (!templatesRes.error && templatesRes.data) setAllShiftTemplates(templatesRes.data);
        else console.error("Error fetching shift templates:", templatesRes.error?.message);
        if (!positionsRes.error && positionsRes.data) setPositions(positionsRes.data);
        else console.error("Error fetching positions:", positionsRes.error?.message);
      } catch (e) { console.error("Exception fetching base metadata:", e); }
      finally { setBaseMetaLoading(false); }
    };
    fetchBaseMetadata();
  }, []);

  const fetchScheduledShifts = useCallback(async () => {
    setShiftsDataLoading(true);
    try {
      if (!location || positions.length === 0 || allShiftTemplates.length === 0) { 
          setScheduledShifts([]); return;
      }
      const firstDayOfWeekQuery = weekStart;
      const lastDayOfWeekQuery = new Date(firstDayOfWeekQuery.getTime());
      lastDayOfWeekQuery.setUTCDate(lastDayOfWeekQuery.getUTCDate() + 6);
      const ptDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
      const startDateQueryStr = ptDateFormatter.format(firstDayOfWeekQuery);
      const endDateQueryStr = ptDateFormatter.format(lastDayOfWeekQuery);

      const { data: allShiftsForDateRange, error } = await supabase
        .from("scheduled_shifts")
        .select("id, shift_date, template_id, start_time, end_time, is_recurring_generated") 
        .gte("shift_date", startDateQueryStr).lte("shift_date", endDateQueryStr);

      if (error) { console.error("Error fetching scheduled shifts for date range:", error.message); setScheduledShifts([]); return; }
      if (!allShiftsForDateRange || allShiftsForDateRange.length === 0) { setScheduledShifts([]); return; }
      
      const templateIdsForCurrentLocation = allShiftTemplates.filter(t => t.location_id === location.id).map(t => t.id);
      const relevantScheduledShifts = allShiftsForDateRange.filter(s => 
        s.template_id !== null && templateIdsForCurrentLocation.includes(s.template_id)
      );
      if (relevantScheduledShifts.length === 0) { setScheduledShifts([]); return; }

      const shiftIds = relevantScheduledShifts.map(s => s.id);
      const { data: assignmentsWithWorkers, error: assignmentsError } = await supabase.from('shift_assignments')
        .select(`scheduled_shift_id, worker_id, assignment_type, is_manual_override, assigned_start, assigned_end, workers (id, first_name, last_name, preferred_name, job_level)`)
        .in('scheduled_shift_id', shiftIds);

      if (assignmentsError) {
        console.error("Error fetching shift assignments:", assignmentsError.message);
        setScheduledShifts(relevantScheduledShifts.map(s => {
          const template = allShiftTemplates.find(t => t.id === s.template_id);
          const position = template ? positions.find(p => p.id === template.position_id) : null;
          const positionName = position ? position.name : 'N/A';
          return {...s, worker_id: null, workerName: 'Error', job_level: null, assigned_start_time: null, assigned_end_time: null, is_manual_override: null };
        })); return;
      }
      
      const populatedShifts: ScheduledShiftForGrid[] = relevantScheduledShifts.map(shift => {
        const shiftAssignments = assignmentsWithWorkers?.filter(a => a.scheduled_shift_id === shift.id) || [];
        let primaryAssignment = shiftAssignments.find(a => a.assignment_type === 'lead') || shiftAssignments.find(a => a.assignment_type === 'regular');
        let workerName, assignedWorkerId = null, assignedStartTime = null, assignedEndTime = null, isManualOverride = null, workerJobLevel = null;
        if (primaryAssignment?.workers) {
          const workerData = primaryAssignment.workers as any;
          workerName = workerData.preferred_name?.trim() || workerData.first_name?.trim() || 'Unknown Worker';
          assignedWorkerId = workerData.id; workerJobLevel = workerData.job_level || null;
          assignedStartTime = primaryAssignment.assigned_start || null; assignedEndTime = primaryAssignment.assigned_end || null;
          isManualOverride = primaryAssignment.is_manual_override ?? null;
        } else if (primaryAssignment) { /* worker assigned but no details */ }

        const trainingAssignment = shiftAssignments.find(a => a.assignment_type === 'training');
        let trainingWorkerId = null, trainingWorkerName, trainingWorkerAssignedStartTime = null, trainingWorkerAssignedEndTime = null, isTrainingAssignmentManuallyOverridden = null;
        if (trainingAssignment?.workers) {
          const traineeData = trainingAssignment.workers as any;
          trainingWorkerName = traineeData.preferred_name?.trim() || traineeData.first_name?.trim() || 'Trainee';
          trainingWorkerId = traineeData.id;
          trainingWorkerAssignedStartTime = trainingAssignment.assigned_start || null; trainingWorkerAssignedEndTime = trainingAssignment.assigned_end || null;
          isTrainingAssignmentManuallyOverridden = trainingAssignment.is_manual_override ?? null;
        } else if (trainingAssignment) { /* trainee assigned but no details */ }

        const template = allShiftTemplates.find(t => t.id === shift.template_id);
        const position = template ? positions.find(p => p.id === template.position_id) : null;

        return {
          ...shift,
          positionName: position ? position.name : 'N/A',
          worker_id: assignedWorkerId, workerName: workerName || undefined, job_level: workerJobLevel,
          assigned_start: assignedStartTime, assigned_end: assignedEndTime, is_manual_override: isManualOverride,
          trainingWorkerId, trainingWorkerName: trainingWorkerName || undefined, 
          trainingWorkerAssignedStart: trainingWorkerAssignedStartTime, trainingWorkerAssignedEnd: trainingWorkerAssignedEndTime, 
          isTrainingAssignmentManuallyOverridden,
        };
      });
      setScheduledShifts(populatedShifts);
    } catch (e) { console.error("Exception fetching scheduled shifts:", e); setScheduledShifts([]); }
    finally { setShiftsDataLoading(false); }
  }, [location, weekStart, allShiftTemplates, positions]); 

  useEffect(() => {
    if (!locationLoading && !baseMetaLoading && location && allShiftTemplates.length > 0 && positions.length > 0) {
        fetchScheduledShifts();
    } else if (!locationLoading && !baseMetaLoading && (!location || allShiftTemplates.length === 0 || positions.length === 0)) {
        setShiftsDataLoading(false); setScheduledShifts([]);
    }
  }, [location, allShiftTemplates, positions, locationLoading, baseMetaLoading, fetchScheduledShifts, weekStart]);

  const handlePrevWeek = () => {
    const currentWS = weekStart;
    const prevWeekDate = new Date(currentWS.getTime());
    prevWeekDate.setUTCDate(prevWeekDate.getUTCDate() - 7);
    
    const ptDateFormatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' 
    });
    const formattedDate = ptDateFormatter.format(prevWeekDate);
    
    if (locationSlug) {
        router.push(`/schedule/${locationSlug}?week=${formattedDate}`, { scroll: false });
    }
  };

  const handleNextWeek = () => {
    const currentWS = weekStart;
    const nextWeekDate = new Date(currentWS.getTime());
    nextWeekDate.setUTCDate(nextWeekDate.getUTCDate() + 7);

    const ptDateFormatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' 
    });
    const formattedDate = ptDateFormatter.format(nextWeekDate);

    if (locationSlug) {
        router.push(`/schedule/${locationSlug}?week=${formattedDate}`, { scroll: false });
    }
  };

  const handleGenerateSchedule = async () => {
    if (!location) return;
    setIsGenerating(true);
    try {
    await generateWeeklySchedule(supabase, location.id, weekStart);
    await fetchScheduledShifts(); 
      // Format weekStart for the toast message
      const formattedWeekStart = weekStart.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      showSuccessToast(`Schedule for ${capitalize(location.name)} (week of ${formattedWeekStart}) generated successfully.`);
    } catch (error) {
      console.error("Error during schedule generation process:", error);
      // Error handling toast will be added later here
    } finally {
    setIsGenerating(false);
    }
  };

  const handleToggleEditMode = () => {
    setEditMode(!editMode);
    if (editMode) { setIsModalOpen(false); setSelectedShiftModalContext(null); }
  };

  const handleShiftClick = (context: ShiftClickContext) => {
    if (editMode && !isPastWeek) { setSelectedShiftModalContext(context); setIsModalOpen(true); }
  };

  const handleModalClose = () => { setIsModalOpen(false); setSelectedShiftModalContext(null); };
  const handleModalSaveSuccess = async () => { setIsModalOpen(false); setSelectedShiftModalContext(null); await fetchScheduledShifts(); };

  const currentShiftTemplates = location ? allShiftTemplates.filter(t => t.location_id === location.id) : [];
  const isContentLoading = locationLoading || baseMetaLoading || shiftsDataLoading;
  
  const editButtonDisabled = isPastWeek || isGenerating || !location || locationLoading;
  const generateButtonDisabled = isGenerating || editMode || isPastWeek || !location || locationLoading;
  
  const pastWeekTooltipContent = "Past schedules cannot be edited or regenerated.";

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-manrope font-bold text-primary">
          {location && !locationLoading ? capitalize(location.name) : (locationLoading ? "Loading Location..." : "Location Not Found")}
        </h1>
        <div className="flex items-center space-x-2">
          <ButtonWrapper isDisabled={editButtonDisabled} showTooltip={isPastWeek && editButtonDisabled} tooltipText={pastWeekTooltipContent}>
            <Button onClick={handleToggleEditMode} variant="outline" disabled={editButtonDisabled} >
              {editMode ? 'View Mode' : 'Edit Schedule'}
            </Button>
          </ButtonWrapper>
          <ButtonWrapper isDisabled={generateButtonDisabled} showTooltip={isPastWeek && generateButtonDisabled} tooltipText={pastWeekTooltipContent}>
            <Button onClick={handleGenerateSchedule} disabled={generateButtonDisabled} className="relative">
              {isGenerating && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                  <span className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
                </span>
              )}
              Generate New Schedule
            </Button>
          </ButtonWrapper>
        </div>
      </div>
      
      {isContentLoading ? (
        <div className="flex flex-col justify-center items-center h-64">
          <span className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
          <p className="ml-0 mt-4 text-lg text-gray-600">Loading schedule data...</p>
        </div>
      ) : !location ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-xl text-destructive">Location "{locationSlug || 'unknown'}" not found.</p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <WeekNavigator weekStart={weekStart} onPrev={handlePrevWeek} onNext={handleNextWeek} />
          </div>
          <ScheduleGrid
            weekStart={weekStart}
            scheduledShifts={scheduledShifts}
            shiftTemplates={currentShiftTemplates} 
            workers={workers}
            positions={positions}
            editMode={editMode}
            onShiftClick={handleShiftClick}
            locationId={location?.id}
          />
          {isModalOpen && selectedShiftModalContext && (
            <EditShiftModal
              isOpen={isModalOpen}
              onClose={handleModalClose}
              shiftContext={selectedShiftModalContext}
              onSaveSuccess={handleModalSaveSuccess}
            />
          )}
        </>
      )}
    </div>
  );
};

export default SchedulePage; 