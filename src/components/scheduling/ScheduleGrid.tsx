import React from "react";
import { Edit3 } from 'lucide-react';

// Define Pacific Timezone constant
const PT_TIMEZONE = 'America/Los_Angeles';

interface Worker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name?: string | null;
  job_level?: string | null;
}

interface ScheduledShiftForGridDisplay {
  id: string;
  shift_date: string;
  template_id: string | null;
  start_time: string | null;
  end_time: string | null;
  is_recurring_generated: boolean | null;
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
  if (!workerName) return null;

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
  const ptDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const weekDates = getWeekDates(weekStart);
  const groupedData = React.useMemo(() => {
    const rolesMap = new Map<string, ProcessedColumn[]>();
    const sortedRoleNamesList: string[] = []; // Renamed to avoid conflict with sortedRoleNames in return value

    if (!shiftTemplates || !positions) {
      return { rolesMap, sortedRoleNames: sortedRoleNamesList };
    }

    // Step 1: Group templates by their primary role name (e.g., "Barista")
    const templatesByPrimaryRole = new Map<string, ShiftTemplate[]>();
    shiftTemplates.forEach(template => {
      const position = positions.find(p => p.id === template.position_id);
      if (!position || !template.position_id) return;

      let primaryRoleName = position.name.split(' - ')[0];
      if (position.name === "Prep + Barista") {
        primaryRoleName = "Barista"; // Consolidate Prep + Barista under Barista for initial grouping
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
        if (!position || !template.position_id) return;

        let groupKey: string;
        if (template.schedule_column_group !== null && template.schedule_column_group !== undefined) {
          groupKey = `${template.position_id}-${template.start_time}-${template.schedule_column_group}`;
        } else {
          groupKey = `${template.position_id}-${template.start_time}-NULL-${template.id}`;
        }

        if (!processedColumnsMap.has(groupKey)) {
          const groupLeadType = template.lead_type;
          let headerText = `${position.name}${groupLeadType ? ` - ${capitalize(groupLeadType)}` : ''}`;
          
          if (primaryRoleName === "Barista" && position.name === "Prep + Barista") {
             if (template.start_time === "09:30:00" || template.start_time === "09:30") {
               headerText = "Prep";
             } else if (template.start_time === "12:00:00" || template.start_time === "12:00") {
               headerText = "Barista";
             }
          }

          const headerTimeText = `${formatTime12hr(template.start_time || '')} - ${formatTime12hr(template.end_time || '')}`;
          processedColumnsMap.set(groupKey, {
            id: groupKey,
            positionId: template.position_id,
            positionName: position.name,
            startTime: template.start_time,
            headerText: headerText,
            headerTimeText: headerTimeText,
            leadType: groupLeadType,
            memberTemplates: [template],
          });
        } else {
          const existingGroup = processedColumnsMap.get(groupKey)!;
          existingGroup.memberTemplates.push(template);
          const allEndTimesInGroup = existingGroup.memberTemplates.map(mt => mt.end_time);
          const uniqueEndTimes = Array.from(new Set(allEndTimesInGroup));
          if (uniqueEndTimes.length > 1) {
            const definedClosingTimes = new Set(["21:00:00", "21:30:00"]);
            const allVaryingTimesAreDefinedClosingTimes = uniqueEndTimes.every(et => definedClosingTimes.has(et));
            if (allVaryingTimesAreDefinedClosingTimes) {
              existingGroup.headerTimeText = `${formatTime12hr(existingGroup.startTime)} - Close`;
            } else {
              existingGroup.headerTimeText = `${formatTime12hr(existingGroup.startTime)} - Various`;
            }
          } else {
            existingGroup.headerTimeText = `${formatTime12hr(existingGroup.startTime)} - ${formatTime12hr(uniqueEndTimes[0])}`;
          }
        }
      });
      
      const sortedColumns = Array.from(processedColumnsMap.values()).sort((a, b) => {
        const getEffectiveStartTime = (col: ProcessedColumn): string => {
          // If the column is specifically "Prep" derived from "Prep + Barista" for the "Barista" role
          if (primaryRoleName === "Barista" && col.positionName === "Prep + Barista" && (col.startTime === "09:30:00" || col.startTime === "09:30")) {
            return "09:30:00"; 
          }
          return col.startTime;
        };
        const effectiveStartTimeA = getEffectiveStartTime(a);
        const effectiveStartTimeB = getEffectiveStartTime(b);
        if (effectiveStartTimeA !== effectiveStartTimeB) return effectiveStartTimeA.localeCompare(effectiveStartTimeB);
        const aIsLead = !!a.leadType;
        const bIsLead = !!b.leadType;
        if (aIsLead && !bIsLead) return -1;
        if (!aIsLead && bIsLead) return 1;
        if (aIsLead && bIsLead) { 
            const leadTypeOrder: { [key: string]: number } = { 'opening': 1, 'closing': 2 };
            const orderA = a.leadType && leadTypeOrder[a.leadType] ? leadTypeOrder[a.leadType] : Number.MAX_SAFE_INTEGER;
            const orderB = b.leadType && leadTypeOrder[b.leadType] ? leadTypeOrder[b.leadType] : Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            if (a.leadType && b.leadType && a.leadType !== b.leadType) return a.leadType.localeCompare(b.leadType);
        }
        const scgA = a.memberTemplates[0]?.schedule_column_group;
        const scgB = b.memberTemplates[0]?.schedule_column_group;
        const aHasScg = scgA !== null && scgA !== undefined;
        const bHasScg = scgB !== null && scgB !== undefined;
        if (aHasScg && !bHasScg) return -1; 
        if (!aHasScg && bHasScg) return 1; 
        if (aHasScg && bHasScg && typeof scgA === 'number' && typeof scgB === 'number' && scgA !== scgB) return scgA - scgB; 
        return a.positionName.localeCompare(b.positionName);
      });
      rolesMap.set(primaryRoleName, sortedColumns);
    });
    
    const roleOrder = ["Barista", "Front desk", "Kitchen"];
    Array.from(rolesMap.keys())
      .sort((a, b) => {
        const indexA = roleOrder.indexOf(a);
        const indexB = roleOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
      })
      .forEach(name => sortedRoleNamesList.push(name));
    return { rolesMap, sortedRoleNames: sortedRoleNamesList };
  }, [shiftTemplates, positions]);

  // Helper function to render a table for a given role
  const renderRoleTableSection = (roleName: string, columnsForRole: ProcessedColumn[], isSideBySideItem: boolean) => {
    if (!columnsForRole || columnsForRole.length === 0) return null;

    const layoutClass = isSideBySideItem ? 'flex-1 min-w-[400px]' : 'w-full';

    return (
      <div key={roleName} className={layoutClass}> 
        <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
          <table className="w-full border-collapse text-xs sm:text-sm">
            <thead className="bg-[#f8f9f7]"> 
              <tr>
                <th 
                  colSpan={columnsForRole.length + 1}
                  className="p-3 text-xl font-manrope font-bold text-primary text-left border-b border-gray-300"
                >
                  {capitalize(roleName)}
                </th>
              </tr>
              <tr>
                <th className="text-left pl-3 pr-4 py-2 font-semibold border-b border-r whitespace-nowrap align-top w-[100px] sm:w-[120px]">Day</th>
                {columnsForRole.map(pCol => (
                  <th key={pCol.id} className="pl-2 pr-3 py-2 font-semibold border-b border-r text-center whitespace-nowrap align-top min-w-[100px] max-w-[180px]">
                    <div className="truncate font-medium" title={pCol.headerText}>{pCol.headerText}</div>
                    <div className="text-[11px] sm:text-xs text-gray-500 truncate">{pCol.headerTimeText}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {weekDates.map((date, dayIndex) => {
                const dateString = ptDateFormatter.format(date);
                const shiftsForThisDayAndRole = scheduledShifts.filter(s => {
                  const shiftPos = positions.find(p => p.name === s.positionName || p.id === s.template_id);
                  if (!shiftPos) return false;
                  let primaryRoleOfShift = shiftPos.name.split(' - ')[0];
                  if (shiftPos.name === "Prep + Barista") primaryRoleOfShift = "Barista";
                  return s.shift_date === dateString && primaryRoleOfShift === roleName;
                });

                if (!editMode && shiftsForThisDayAndRole.length === 0) {
                  const templatesForThisDayAndRole = columnsForRole.some(col =>
                    col.memberTemplates.some(mt => mt.days_of_week && mt.days_of_week.includes(DAYS_OF_WEEK[dayIndex].toLowerCase()))
                  );
                  if (!templatesForThisDayAndRole) return null;
                }

                const isToday = dateString === ptDateFormatter.format(new Date());
                let rowClass = "border-t";
                if (isToday) {
                  rowClass += " bg-blue-50 font-semibold text-blue-700";
                } else {
                  rowClass += dayIndex % 2 !== 0 ? ' bg-gray-50' : ' bg-white';
                }
                rowClass += " hover:bg-gray-100";

                return (
                  <tr key={dateString} className={rowClass}>
                    <td className="pl-3 pr-4 py-2.5 border-b border-r font-medium whitespace-nowrap align-top w-[100px] sm:w-[120px] bg-white sticky left-0 z-[1]">
                      <div className="flex flex-col">
                        <span>{DAYS_OF_WEEK[dayIndex]}</span>
                        <span className="text-xs text-gray-500">{date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}</span>
                      </div>
                    </td>
                    {columnsForRole.map((column) => {
                      const templatesForCell = column.memberTemplates.filter(template =>
                        template.days_of_week && template.days_of_week.includes(DAYS_OF_WEEK[dayIndex].toLowerCase())
                      );
                      const shiftsInCell = scheduledShifts.filter(s => 
                        s.shift_date === dateString && templatesForCell.some(t => t.id === s.template_id)
                      );
                      
                      let cellClasses = "px-2 py-2.5 border-b border-r text-center h-[52px] align-middle relative";
                      if (editMode && templatesForCell.length > 0) {
                        cellClasses += " cursor-pointer group hover:bg-gray-100 dark:hover:bg-slate-800";
                      } else if (templatesForCell.length === 0) {
                        cellClasses += " bg-gray-50";
                      }

                      return (
                        <td
                          key={`${column.id}-${dateString}`}
                          className={cellClasses}
                          onClick={() => {
                            if (editMode && onShiftClick && locationId) {
                              if (shiftsInCell.length > 0) {
                                onShiftClick({ type: 'existing', shiftId: shiftsInCell[0].id });
                              } else if (templatesForCell.length > 0) {
                                const primaryTemplateForCell = templatesForCell[0];
                                if (primaryTemplateForCell.position_id) {
                                  onShiftClick({ 
                                    type: 'new', 
                                    templateId: primaryTemplateForCell.id, 
                                    dateString: dateString,
                                    startTime: primaryTemplateForCell.start_time,
                                    endTime: primaryTemplateForCell.end_time,
                                    locationId: locationId,
                                    positionId: primaryTemplateForCell.position_id,
                                    leadType: primaryTemplateForCell.lead_type 
                                  });
                                } else {
                                  console.warn("Cannot create new shift: template is missing position_id", primaryTemplateForCell);
                                }
                              }
                            }
                          }}
                        >
                          {shiftsInCell.length > 0 ? (
                            shiftsInCell.map(shift => {
                              // Check if this specific shift instance has a worker
                              if (shift.workerName) {
                                return (
                                  <div key={shift.id} className="mb-1 last:mb-0"> 
                                    <div className="font-semibold text-green-800">
                                      {formatWorkerDisplay(shift.workerName, shift.job_level, shift.start_time || '', shift.end_time || '', shift.assigned_start, shift.assigned_end)}
                                    </div>
                                    {shift.trainingWorkerName && (
                                      <div className="mt-0.5 pt-0.5 border-t border-gray-200 text-xs text-blue-700">
                                        <span>trn: {shift.trainingWorkerName}</span>
                                        {(shift.trainingWorkerAssignedStart && shift.trainingWorkerAssignedEnd && 
                                          (shift.trainingWorkerAssignedStart !== (shift.start_time || '') || shift.trainingWorkerAssignedEnd !== (shift.end_time || ''))) && (
                                          <span className="text-gray-500 text-xs block">
                                            ({formatTime12hr(shift.trainingWorkerAssignedStart || '')} - {formatTime12hr(shift.trainingWorkerAssignedEnd || '')})
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              } else {
                                // This shift record exists (it's in shiftsInCell) but is unassigned.
                                // templatesForCell.length > 0 is implied here because shiftsInCell is derived from templatesForCell.
                                if (editMode) {
                                  return (
                                    <div key={`${shift.id}-edit-icon`} className="flex justify-center items-center h-full">
                                      <Edit3 size={16} className="mx-auto text-gray-400 group-hover:text-primary" />
                                    </div>
                                  );
                                } else {
                                  // In view mode, display "-"
                                  return (
                                    <span key={`${shift.id}-unassigned`} className="text-gray-400 text-lg">-</span>
                                  );
                                }
                              }
                            })
                          ) : templatesForCell.length > 0 && editMode ? (
                            <div className="flex justify-center items-center h-full">
                              <Edit3 size={16} className="mx-auto text-gray-400 group-hover:text-primary" />
                            </div>
                          ) : (
                            <span className={`text-gray-400 ${templatesForCell.length > 0 ? 'text-lg' : ''}`}>{templatesForCell.length > 0 ? '-' : ' '}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (groupedData.sortedRoleNames.length === 0 && locationId) {
    return <div className="text-center py-10 w-full"><p className="text-gray-500">No shift templates configured for this location.</p></div>;
  }
  if (groupedData.sortedRoleNames.length === 0 && !locationId) {
    return <div className="text-center py-10 w-full"><p className="text-gray-500">No shift templates found for any location.</p><p className="text-gray-400 text-sm">Please set up shift templates in the admin settings.</p></div>;
  }
  
  const baristaRoleName = "Barista";
  const sideBySideCandidates = ["Front desk", "Kitchen"];
  
  const baristaTableData = groupedData.rolesMap.get(baristaRoleName);
  
  const sideBySideRolesToRender = sideBySideCandidates
    .map(roleName => ({ name: roleName, data: groupedData.rolesMap.get(roleName) }))
    .filter(role => role.data && role.data.length > 0);
    
  const otherFullWidthRolesToRender = groupedData.sortedRoleNames
    .filter(roleName => roleName !== baristaRoleName && !sideBySideCandidates.includes(roleName))
    .map(roleName => ({ name: roleName, data: groupedData.rolesMap.get(roleName) }))
    .filter(role => role.data && role.data.length > 0);

  return (
    <div className="space-y-6">
      {baristaTableData && renderRoleTableSection(baristaRoleName, baristaTableData, false)}

      {sideBySideRolesToRender.length > 0 && (
        <div className="flex flex-col md:flex-row md:space-x-4 space-y-6 md:space-y-0">
          {sideBySideRolesToRender.map(role => 
            renderRoleTableSection(role.name, role.data!, true)
          )}
        </div>
      )}

      {otherFullWidthRolesToRender.map(role => 
        renderRoleTableSection(role.name, role.data!, false)
      )}
    </div>
  );
};

export default ScheduleGrid; 