import React from "react";
import { Edit3 } from 'lucide-react';

// Define Pacific Timezone constant
const PT_TIMEZONE = 'America/Los_Angeles';

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  job_level?: string | null;
}

interface ScheduledShiftForGridDisplay {
  id: string;
  shift_date: string;
  template_id: string;
  start_time: string;
  end_time: string;
  is_recurring_generated: boolean;
  positionName?: string;
  
  worker_id: string | null;
  workerName?: string;
  job_level?: string | null;
  assigned_start?: string | null;
  assigned_end?: string | null;
  is_manual_override?: boolean | null;

  // Training worker details
  trainingWorkerId?: string | null;
  trainingWorkerName?: string; // Trainee's Preferred or First name
  trainingWorkerAssignedStart?: string | null;
  trainingWorkerAssignedEnd?: string | null;
  isTrainingAssignmentManuallyOverridden?: boolean | null;
}

interface ShiftTemplate {
  id: string;
  location_id: string;
  position_id: string;
  days_of_week: string[];
  start_time: string;
  end_time: string;
  lead_type?: string;
  schedule_column_group?: number | null;
}

interface Position {
  id: string;
  name: string;
}

interface ProcessedColumn {
  id: string;
  positionId: string;
  positionName: string;
  startTime: string;
  headerText: string;
  headerTimeText: string;
  leadType?: string | null;
  memberTemplates: ShiftTemplate[];
}

export type ShiftClickContext = 
  | { type: 'existing'; shiftId: string } 
  | { type: 'new'; templateId: string; dateString: string; startTime: string; endTime: string; locationId: string; positionId: string; leadType?: string | null };

interface ScheduleGridProps {
  weekStart: Date;
  scheduledShifts: ScheduledShiftForGridDisplay[];
  shiftTemplates: ShiftTemplate[];
  workers: Worker[];
  positions: Position[];
  editMode?: boolean;
  onShiftClick?: (context: ShiftClickContext) => void;
  locationId?: string;
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Generates an array of 7 Date objects, each representing midnight PT for a successive day.
// 'start' is assumed to be a JS Date object already representing midnight PT for the week's start.
function getWeekDates(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime()); // Clone the start date
    // Advance the date by 'i' days in UTC. If 'start' was midnight PT (e.g., 07:00 UTC),
    // this preserves that UTC time of day, effectively moving to midnight PT of the next day.
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

function formatTime12hr(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(":");
  const date = new Date();
  date.setHours(Number(h), Number(m));
  
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  if (minutes === 0) {
    return `${hours}${ampm}`;
  } else {
    const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString(); 
    return `${hours}:${minutesStr}${ampm}`;
  }
}

function formatWorkerDisplay(
  workerName: string | undefined,
  jobLevel: string | undefined | null,
  mainShiftStartTime: string,
  mainShiftEndTime: string,
  assignedStart: string | undefined | null,
  assignedEnd: string | undefined | null
): React.ReactNode {
  if (!workerName) return "Unassigned";

  let namePartElements: React.ReactNode[] = [];
  let nameOnly = workerName;

  if (jobLevel) {
    const levelDisplay = jobLevel.startsWith('L') ? jobLevel : `L${jobLevel}`;
    nameOnly = `${workerName}-${levelDisplay}`;
  }
  namePartElements.push(<span key="name">{nameOnly}</span>);

  if (assignedStart && assignedEnd &&
      (assignedStart !== mainShiftStartTime || assignedEnd !== mainShiftEndTime)) {
    namePartElements.push(
      <span key="time" className="font-normal text-gray-600 text-xs">
        {` (${formatTime12hr(assignedStart)} - ${formatTime12hr(assignedEnd)})`}
      </span>
    );
  }
  return <>{namePartElements}</>;
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Helper function to convert HH:MM:SS or HH:MM to minutes from midnight
function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1]; // HH:MM
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // HH:MM:SS
  return 0;
}

const ScheduleGrid: React.FC<ScheduleGridProps> = ({ weekStart, scheduledShifts, shiftTemplates, workers, positions, editMode, onShiftClick, locationId }) => {
  // CRUCIAL ASSUMPTION: weekStart prop is a JS Date object whose UTC timestamp
  // correctly represents midnight on the start_of_the_week IN PACIFIC TIME.
  // E.g., for May 12, 2025 (PDT, UTC-7), weekStart.getTime() would correspond
  // to the milliseconds since epoch for '2025-05-12T07:00:00.000Z'.
  
  // The previous normalization to browser's local midnight is removed as we now strictly use PT.
  const weekDates = getWeekDates(weekStart);

  const groupedData = React.useMemo(() => {
    const rolesMap = new Map<string, ProcessedColumn[]>();
    const sortedRoleNames: string[] = [];

    if (!shiftTemplates || !positions) {
      return { rolesMap, sortedRoleNames };
    }

    // Step 1: Group templates by their primary role name (e.g., "Barista")
    const templatesByPrimaryRole = new Map<string, ShiftTemplate[]>();
    shiftTemplates.forEach(template => {
      const position = positions.find(p => p.id === template.position_id);
      if (!position) return; 

      let primaryRoleName = position.name.split(' - ')[0];
      if (position.name === "Prep + Barista") {
        primaryRoleName = "Barista";
      }

      if (!templatesByPrimaryRole.has(primaryRoleName)) {
        templatesByPrimaryRole.set(primaryRoleName, []);
      }
      templatesByPrimaryRole.get(primaryRoleName)!.push(template);
    });

    // Step 2: For each primary role, further group into ProcessedColumns
    templatesByPrimaryRole.forEach((roleTemplates, primaryRoleName) => {
      const processedColumnsMap = new Map<string, ProcessedColumn>();

      roleTemplates.forEach(template => {
        const position = positions.find(p => p.id === template.position_id);
        if (!position) return;

        let groupKey: string;
        if (template.schedule_column_group !== null && template.schedule_column_group !== undefined) {
          groupKey = `${template.position_id}-${template.start_time}-${template.schedule_column_group}`;
        } else {
          // If schedule_column_group is null, make the group key unique per template to prevent grouping
          groupKey = `${template.position_id}-${template.start_time}-NULL-${template.id}`;
        }

        if (!processedColumnsMap.has(groupKey)) {
          // Determine consistent lead type for the group.
          // This assumes templates grouped by schedule_column_group and start_time under the same position_id SHOULD share a lead_type if specified.
          // If lead_type can vary *within* such a defined visual group, this logic might need adjustment
          // or the headerText might need to be more generic.
          const groupLeadType = template.lead_type;
          
          let headerText = `${position.name}${groupLeadType ? ` - ${capitalize(groupLeadType)}` : ''}`;
          // CUSTOM LOGIC FOR PREP/BARISTA HEADER TEXT
          // Assumes position.name in DB is "Prep + Barista" for these templates
          if (position.name === "Prep + Barista") { 
            if (template.start_time === "09:30:00" || template.start_time === "09:30") {
              headerText = "Prep";
            } else if (template.start_time === "12:00:00" || template.start_time === "12:00") {
              headerText = "Barista";
            }
            // If times don't match expected ones, it will use "Prep + Barista" as header.
          }
          
          // Determine if all templates in this potential group share the same end_time
          // For now, this processed column is new, so it only has one member (the current template)
          // We will update this if more members are added.
          const headerTimeText = `${formatTime12hr(template.start_time)} - ${formatTime12hr(template.end_time)}`;

          processedColumnsMap.set(groupKey, {
            id: groupKey,
            positionId: template.position_id,
            positionName: position.name, // Full position name for context
            startTime: template.start_time,
            headerText: headerText,
            headerTimeText: headerTimeText, // Initial value
            leadType: groupLeadType,
            memberTemplates: [template],
          });
        } else {
          // Add template to existing group and update headerTimeText if necessary
          const existingColumn = processedColumnsMap.get(groupKey)!;
          existingColumn.memberTemplates.push(template);

          // Update headerTimeText if this template's end_time is different
          // This assumes the earliest start_time and latest end_time of grouped templates should define the header.
          // For simplicity, if any template in the group has a different end_time, we generalize the header.
          // A more sophisticated approach might be needed if precise combined time range display is critical.
          
          // Get earliest start and latest end from all members so far
          let earliestStartMinutes = Infinity;
          let latestEndMinutes = -Infinity;
          let commonEndTime = true;
          const firstEndTime = existingColumn.memberTemplates[0].end_time;

          existingColumn.memberTemplates.forEach(memTpl => {
            earliestStartMinutes = Math.min(earliestStartMinutes, timeToMinutes(memTpl.start_time));
            latestEndMinutes = Math.max(latestEndMinutes, timeToMinutes(memTpl.end_time));
            if (memTpl.end_time !== firstEndTime) {
              commonEndTime = false;
            }
          });
          
          // For now, let's keep the start_time of the *first* template encountered for this group
          // But for end_time, if they are not all the same, we might want to indicate a range or use the latest.
          // For simplicity, if end times vary, we just use the latest.
          // Or, if all start times are the same AND all end times are the same, use that.
          
          let allStartTimesSame = true;
          const firstStartTime = existingColumn.memberTemplates[0].start_time;
          existingColumn.memberTemplates.forEach(memTpl => {
            if(memTpl.start_time !== firstStartTime) allStartTimesSame = false;
          });

          if (allStartTimesSame && commonEndTime) {
             existingColumn.headerTimeText = `${formatTime12hr(firstStartTime)} - ${formatTime12hr(firstEndTime)}`;
          } else {
            // If start/end times vary within the group, make the time text more generic or represent a range.
            // For now, just using the original template's start time and the latest end time from any member.
            // This could be refined based on desired UI behavior.
             const earliestStartStr = existingColumn.memberTemplates.reduce((earliest, t) => 
                timeToMinutes(t.start_time) < timeToMinutes(earliest.start_time) ? t : earliest
             ).start_time;
             const latestEndStr = existingColumn.memberTemplates.reduce((latest, t) =>
                timeToMinutes(t.end_time) > timeToMinutes(latest.end_time) ? t : latest
             ).end_time;
            existingColumn.headerTimeText = `${formatTime12hr(earliestStartStr)} - ${formatTime12hr(latestEndStr)}`;
          }
        }
      });
      
      const columnsArray = Array.from(processedColumnsMap.values());
      
      // Sort columns: primarily by start_time, secondarily by position_name (or headerText for more stability)
      columnsArray.sort((a, b) => {
        const startTimeComparison = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
        if (startTimeComparison !== 0) return startTimeComparison;
        return a.headerText.localeCompare(b.headerText); // Fallback to header text for consistent sort
      });

      rolesMap.set(primaryRoleName, columnsArray);
      if (!sortedRoleNames.includes(primaryRoleName)) {
        sortedRoleNames.push(primaryRoleName);
      }
    });

    // Sort primary role names (e.g., "Barista", "Lead", "Prep")
    // Custom sort order: "Lead" first, then alphabetical for others
    sortedRoleNames.sort((a, b) => {
      if (a === "Lead" && b !== "Lead") return -1;
      if (b === "Lead" && a !== "Lead") return 1;
      if (a === "Barista" && b === "Prep") return -1; // Barista before Prep
      if (a === "Prep" && b === "Barista") return 1; // Prep after Barista
      return a.localeCompare(b);
    });
    
    return { rolesMap, sortedRoleNames };
  }, [shiftTemplates, positions]);

  const { rolesMap, sortedRoleNames } = groupedData;

  if (!rolesMap.size) return <div className="p-4">No shift templates configured for this view.</div>;

  // Function to find a specific scheduled shift for a given template, day, and potential lead_type
  const findScheduledShiftForCell = (template: ShiftTemplate, date: Date, columnLeadType?: string | null): ScheduledShiftForGridDisplay | undefined => {
    const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD from JS Date in UTC

    return scheduledShifts.find(shift => {
      // Match by date and primary template ID
      if (shift.shift_date === dateString && shift.template_id === template.id) {
        return true;
      }
      return false;
    });
  };
  
  const getEffectiveStartTime = (col: ProcessedColumn): string => {
    if (!col.memberTemplates || col.memberTemplates.length === 0) return col.startTime; // Fallback
    // Assuming all member templates in a column *should* have the same conceptual start time for the column header
    // Return the start_time of the first member template
    return col.memberTemplates[0].start_time;
  };

  const getEffectiveEndTime = (col: ProcessedColumn): string => {
    if (!col.memberTemplates || col.memberTemplates.length === 0) return col.startTime; // Fallback

    // If headerTimeText is "X - Y", parse Y. Otherwise, parse the end_time of the last member template.
    const parts = col.headerTimeText.split(' - ');
    if (parts.length === 2) {
      // Convert "HH:MM AM/PM" back to "HH:MM:SS" or "HH:MM" if possible, or rely on template.end_time
      // This is tricky because formatTime12hr loses seconds.
      // Simpler: find the latest end_time among member templates.
      let latestEndMinutes = -1;
      let latestEndTimeStr = col.memberTemplates[0].end_time;
      col.memberTemplates.forEach(mt => {
        const mtEndMinutes = timeToMinutes(mt.end_time);
        if (mtEndMinutes > latestEndMinutes) {
          latestEndMinutes = mtEndMinutes;
          latestEndTimeStr = mt.end_time;
        }
      });
      return latestEndTimeStr;
    }
    // Fallback to the end_time of the first member template if parsing fails
    return col.memberTemplates[0].end_time; 
  };


  return (
    <div className="overflow-x-auto bg-white shadow rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 top-0 z-20 bg-gray-50 px-3 py-3.5 text-left text-sm font-semibold text-gray-900 min-w-[150px] border-r">Role</th>
            {DAYS_OF_WEEK.map((day, index) => (
              <th key={day} className="px-3 py-3.5 text-center text-sm font-semibold text-gray-900 min-w-[180px]">
                <div>{day}</div>
                <div className="text-xs font-normal text-gray-500">
                  {weekDates[index].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {sortedRoleNames.map(roleName => (
            rolesMap.get(roleName)?.map((column, colIdx) => (
              <tr key={`${roleName}-${column.id}-${colIdx}`} className={colIdx === 0 ? 'border-t-2 border-gray-300' : ''}>
                {/* Sticky Role/Time Header Cell */}
                <td className={`sticky left-0 z-10 whitespace-nowrap px-3 py-4 text-sm text-gray-900 bg-white hover:bg-gray-50 border-r ${colIdx === 0 ? 'font-semibold' : ''}`}>
                  <div className={colIdx !==0 ? "pl-4" : ""}>
                    {colIdx === 0 && <div className="font-bold text-gray-700">{roleName}</div>}
                    <div className="text-xs text-gray-500">{column.headerText}</div>
                    <div className="text-xs text-indigo-500">{column.headerTimeText}</div>
                  </div>
                </td>
                {/* Shift Cells for each day */}
                {weekDates.map((date, dayIdx) => {
                  // Find the first template within this column that is valid for the current day
                  const dayString = DAYS_OF_WEEK[dayIdx].toLowerCase();
                  const applicableTemplateForDay = column.memberTemplates.find(
                    t => Array.isArray(t.days_of_week) && t.days_of_week.includes(dayString)
                  );

                  if (!applicableTemplateForDay) {
                    return (
                      <td key={`${column.id}-${dayIdx}-empty`} className="whitespace-nowrap px-3 py-4 text-sm text-center bg-gray-50">
                        -
                      </td>
                    );
                  }
                  
                  const scheduledShift = findScheduledShiftForCell(applicableTemplateForDay, date, column.leadType);
                  const cellLocationId = locationId || applicableTemplateForDay.location_id; // Prefer prop, fallback to template

                  const handleCellClick = () => {
                    if (!onShiftClick || !applicableTemplateForDay) return;
                  
                    if (scheduledShift) {
                      onShiftClick({ type: 'existing', shiftId: scheduledShift.id });
                    } else {
                      // For new shifts, use the effective start/end times of the column for consistency
                      const effectiveColStartTime = getEffectiveStartTime(column);
                      const effectiveColEndTime = getEffectiveEndTime(column);
                  
                      onShiftClick({ 
                        type: 'new', 
                        templateId: applicableTemplateForDay.id, 
                        dateString: date.toISOString().split('T')[0],
                        startTime: effectiveColStartTime, // Use column's effective start
                        endTime: effectiveColEndTime,     // Use column's effective end
                        locationId: cellLocationId,
                        positionId: applicableTemplateForDay.position_id,
                        leadType: column.leadType // This comes from the column, which derived it from a template
                      });
                    }
                  };

                  const mainShiftWorkerName = scheduledShift?.workerName;
                  const mainShiftJobLevel = scheduledShift?.job_level;
                  const mainShiftAssignedStart = scheduledShift?.assigned_start;
                  const mainShiftAssignedEnd = scheduledShift?.assigned_end;

                  // Determine if the MAIN assignment is a lead assignment
                  // This needs to check against the SCHEDULED SHIFT details, not the template, as it could be manually assigned.
                  // For now, we assume if a worker is assigned, and the column has a leadType, it implies a lead assignment for THIS worker.
                  // This might need refinement if a shift can have a lead *and* a regular worker from the same column definition.
                  const isMainAssignmentLead = !!(mainShiftWorkerName && column.leadType);
                  
                  // Trainee details
                  const trainingWorkerName = scheduledShift?.trainingWorkerName;
                  const trainingWorkerAssignedStart = scheduledShift?.trainingWorkerAssignedStart;
                  const trainingWorkerAssignedEnd = scheduledShift?.trainingWorkerAssignedEnd;


                  return (
                    <td 
                      key={`${column.id}-${dayIdx}`} 
                      className={`whitespace-nowrap px-3 py-2 text-sm text-center relative group
                        ${editMode ? 'cursor-pointer hover:bg-indigo-50' : ''}
                        ${scheduledShift?.is_recurring_generated ? 'bg-emerald-50' : ''}
                        ${mainShiftWorkerName && scheduledShift?.is_manual_override ? 'border-l-4 border-l-orange-400' : ''}
                      `}
                      onClick={editMode ? handleCellClick : undefined}
                    >
                      {editMode && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Edit3 size={14} className="text-gray-400" />
                        </div>
                      )}

                      {/* Main Assigned Worker */}
                      <div 
                        className={`
                          ${isMainAssignmentLead ? 'font-semibold text-purple-700' : 'text-gray-900'}
                          ${trainingWorkerName ? 'mb-1' : ''} 
                        `}
                      >
                        {formatWorkerDisplay(
                          mainShiftWorkerName, 
                          mainShiftJobLevel, 
                          applicableTemplateForDay.start_time, // Main shift start for comparison
                          applicableTemplateForDay.end_time,   // Main shift end for comparison
                          mainShiftAssignedStart, 
                          mainShiftAssignedEnd
                        )}
                      </div>

                      {/* Training Worker, if any */}
                      {trainingWorkerName && (
                        <div className="text-xs text-blue-600 pt-1 border-t border-dashed border-gray-300 mt-1">
                          <span className="font-medium">(T)</span>{" "}
                          {formatWorkerDisplay(
                            trainingWorkerName,
                            null, // Job level not shown for trainee for simplicity
                            applicableTemplateForDay.start_time, // Main shift start for comparison
                            applicableTemplateForDay.end_time,   // Main shift end for comparison
                            trainingWorkerAssignedStart,
                            trainingWorkerAssignedEnd
                          )}
                        </div>
                      )}
                      
                      {!mainShiftWorkerName && !trainingWorkerName && (
                        <span className="text-gray-400 italic">Empty</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ScheduleGrid;

// Utility: Determine if a shift is a "Lead" shift based on its properties
// This could be expanded based on how "Lead" is defined (e.g. specific position names, a boolean flag on shift, etc.)
// For now, let's assume template.lead_type (e.g. "opening", "closing") implies it's a lead-designated slot.
// And if a worker is assigned, it implies they are taking that lead role.
// A more robust system might have an explicit `assignment_type: 'lead'` on the `shift_assignments` table.
function isLeadShift(shift: ScheduledShiftForGridDisplay | undefined, templates: ShiftTemplate[]): boolean {
  if (!shift || !shift.template_id) return false;
  const template = templates.find(t => t.id === shift.template_id);
  return !!(template && template.lead_type);
} 