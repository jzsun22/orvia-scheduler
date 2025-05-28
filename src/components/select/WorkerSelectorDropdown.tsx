'use client'

import { useEffect, useState, RefObject } from 'react'
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils" 
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Worker, JobLevel } from '@/lib/types' 

// Define NewShiftClientContext here or import from a shared location
interface NewShiftClientContext {
  templateId: string;
  shiftDate: string;    // YYYY-MM-DD
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
}

interface WorkerSelectorDropdownProps {
  scheduledShiftId: string | null 
  newShiftClientContext?: NewShiftClientContext | null; // Added for new shift context
  targetAssignmentType: 'lead' | 'regular' | 'training'
  currentWorkerId?: string | null
  onWorkerSelect: (worker: Worker | null) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  popoverContainerRef?: RefObject<HTMLDivElement>;
  excludeWorkerId?: string | null;
}

interface EligibleWorkerResponseItem {
    id: string;
    first_name: string | null;
    last_name: string | null;
    preferred_name: string | null;
    job_level: JobLevel;
}

const formatWorkerName = (worker: { first_name: string | null, last_name: string | null, preferred_name: string | null }): string => {
  const firstName = worker.first_name || '';
  const lastName = worker.last_name || '';
  if (worker.preferred_name && worker.preferred_name.trim() !== '') {
    return `${firstName} (${worker.preferred_name}) ${lastName}`.trim().replace(/\s+/g, ' ');
  }
  return `${firstName} ${lastName}`.trim().replace(/\s+/g, ' ');
};

export function WorkerSelectorDropdown({
  scheduledShiftId,
  newShiftClientContext,
  targetAssignmentType,
  currentWorkerId,
  onWorkerSelect,
  disabled = false,
  className,
  placeholder,
  popoverContainerRef,
  excludeWorkerId
}: WorkerSelectorDropdownProps) {
  const [eligibleWorkers, setEligibleWorkers] = useState<EligibleWorkerResponseItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Determine if we should fetch and what the request body should be
    let shouldFetch = false;
    let apiRequestBody: object | null = null;

    if (scheduledShiftId && scheduledShiftId.startsWith('new-shift-') && newShiftClientContext) {
      // Case: New shift, temporary ID and full context are provided
      console.log('[WorkerSelectorDropdown useEffect] Condition: NEW shift. ID:', scheduledShiftId, 'Context:', newShiftClientContext);
      shouldFetch = !disabled;
      apiRequestBody = {
        scheduledShiftId, // Pass the temporary "new-shift-..." ID
        newShiftClientContext, // Pass the full context for the new shift
        targetAssignmentType,
        excludeWorkerId,
      };
    } else if (scheduledShiftId && !scheduledShiftId.startsWith('new-shift-')) {
      // Case: Existing shift, ID is a UUID
      // console.log('[WorkerSelectorDropdown useEffect] Condition: EXISTING shift. ID:', scheduledShiftId);
      shouldFetch = !disabled;
      apiRequestBody = {
        scheduledShiftId, // Pass the UUID
        targetAssignmentType,
        excludeWorkerId,
      };
    } else {
      // Conditions not met to fetch (e.g., scheduledShiftId is null, or it's a new-shift- ID without context)
      console.log('[WorkerSelectorDropdown useEffect] Condition: NOT FETCHING. ID:', scheduledShiftId, 'Disabled:', disabled, 'HasContext:', !!newShiftClientContext);
      setEligibleWorkers([]);
      setIsLoading(false); // Ensure loading is false if not fetching
      setError(null);      // Clear any previous error
      return;
    }

    if (!shouldFetch) {
      console.log('[WorkerSelectorDropdown useEffect] shouldFetch is false, clearing workers and returning.');
      setEligibleWorkers([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const fetchEligibleWorkers = async () => {
      if (!apiRequestBody) return; // Should not happen if shouldFetch is true

      setIsLoading(true);
      setError(null);
      // console.log('[WorkerSelectorDropdown useEffect] Fetching eligible workers with body:', JSON.stringify(apiRequestBody));
      try {
        const response = await fetch(`/api/get-eligible-workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiRequestBody),
        });

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || `Error fetching workers: ${response.status}`)
        }
        const data: EligibleWorkerResponseItem[] = await response.json()
        setEligibleWorkers(data)
      } catch (e: any) {
        console.error(`Failed to fetch eligible ${targetAssignmentType} workers:`, e)
        setError(e.message || 'Failed to load workers.')
        setEligibleWorkers([])
      }
      setIsLoading(false)
    }

    fetchEligibleWorkers()
  }, [scheduledShiftId, newShiftClientContext, targetAssignmentType, disabled, excludeWorkerId])

  const handleSelect = (selectedWorkerId: string | null) => {
    console.log('[WorkerSelectorDropdown] handleSelect called with workerId:', selectedWorkerId);
    if (!selectedWorkerId || selectedWorkerId === "__unassign__") {
      onWorkerSelect(null);
    } else {
      const worker = eligibleWorkers.find(w => w.id === selectedWorkerId)
      if (worker) {
        onWorkerSelect({ 
          id: worker.id, 
          first_name: worker.first_name, 
          last_name: worker.last_name,
          preferred_name: worker.preferred_name,
          job_level: worker.job_level,
          is_lead: false, // Assuming a default, this might need to be fetched if relevant
          availability: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: [],
            sunday: []
          }, 
          preferred_hours_per_week: null, // Assuming a default
          created_at: new Date().toISOString(), 
        } as Worker);
      }
    }
    setOpen(false)
  }

  const currentSelectedWorkerDetails = currentWorkerId 
    ? eligibleWorkers.find(worker => worker.id === currentWorkerId) 
    : null;
  
  const displayValue = currentSelectedWorkerDetails
    ? formatWorkerName(currentSelectedWorkerDetails)
    : (placeholder || `Select ${targetAssignmentType}...`);

  if (isLoading && !open) {
    return (
      <Button variant="outline" className={cn("w-full justify-start font-normal", className)} disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading {targetAssignmentType}s...
      </Button>
    )
  }

  if (error && !open) {
    return <p className={cn("text-red-500 text-xs h-10 flex items-center", className)}>Error: {error}</p>
  }

  return (
    <>
      <Popover open={open} onOpenChange={(newOpenState) => {
        // console.log('[WorkerSelectorDropdown] Popover onOpenChange. New open state:', newOpenState);
        setOpen(newOpenState);
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={displayValue}
            className={cn("w-full justify-between", className, !currentWorkerId && "text-muted-foreground")}
            disabled={disabled || isLoading || !scheduledShiftId}
          >
            <span className="truncate">{displayValue}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverPrimitive.Portal container={popoverContainerRef?.current}>
          <PopoverContent 
            className="w-[--radix-popover-trigger-width] p-0" 
            align="start"
            style={{ pointerEvents: 'auto' } as React.CSSProperties}
            onCloseAutoFocus={(e) => {
              // console.log('[WorkerSelectorDropdown] PopoverContent onCloseAutoFocus');
              e.preventDefault();
            }}
            onFocusOutside={(e: any) => {
              // console.log('[WorkerSelectorDropdown] PopoverContent onFocusOutside. RelatedTarget:', e.relatedTarget);
              e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              // console.log('[WorkerSelectorDropdown] PopoverContent onPointerDownOutside. Target:', e.target);
              e.preventDefault();
            }}
          >
            <Command shouldFilter={false}> 
              <CommandList>
                <CommandEmpty>
                  No eligible {targetAssignmentType}s.
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    key="unassign-option"
                    value="__unassign__" 
                    onSelect={() => {
                      console.log('[WorkerSelectorDropdown] Unassign CommandItem onSelect');
                      handleSelect(null);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        !currentWorkerId ? "opacity-100" : "opacity-0"
                      )}
                    />
                    -- Select {targetAssignmentType} --
                  </CommandItem>
                  {eligibleWorkers.map((worker) => (
                    <CommandItem
                      key={worker.id}
                      value={worker.id} 
                      onSelect={() => {
                        console.log('[WorkerSelectorDropdown] Worker CommandItem onSelect. Worker ID:', worker.id);
                        handleSelect(worker.id);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          currentWorkerId === worker.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {formatWorkerName(worker)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </PopoverPrimitive.Portal>
      </Popover>
    </>
  )
}

// TEMPORARY TEST: Render WorkerSelectorDropdown outside of modal for debugging
// Remove or comment out after testing
import React from 'react';

const mockWorker = {
  id: 'mock-worker-id',
  first_name: 'Test',
  last_name: 'User',
  preferred_name: 'Tester',
  job_level: 'junior',
  is_lead: false,
  availability: null,
  preferred_hours_per_week: null,
  created_at: new Date().toISOString(),
};

export default function WorkerSelectorDropdownTestPage() {
  return (
    <div style={{ maxWidth: 400, margin: '2rem auto', padding: 24, border: '1px solid #ccc', borderRadius: 8 } as React.CSSProperties}>
      <h2>Test WorkerSelectorDropdown (Standalone)</h2>
      <WorkerSelectorDropdown
        scheduledShiftId={"test-shift-id"}
        targetAssignmentType={"regular"}
        currentWorkerId={null}
        onWorkerSelect={(worker) => console.log('Selected worker:', worker)}
        disabled={false}
        placeholder="Select a worker..."
        excludeWorkerId={null}
      />
    </div>
  );
} 