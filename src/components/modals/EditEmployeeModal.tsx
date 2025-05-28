'use client';

import { useState, useEffect } from 'react';
import { useForm, SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { employeeSchema, type EmployeeFormData } from '@/lib/schemas/employee';
import { supabase } from '@/lib/supabase/client';
import { fetchAllLocations } from '@/lib/supabase';
import { Worker, Location, Position, JobLevel, LocationPosition as LocationPositionBase } from '@/lib/types';
import { useAppToast } from "@/lib/toast-service";
import { Switch } from '@/components/ui/switch';

// Define a type for the shape returned by the Supabase query
interface FetchedLocationPosition {
  id: string;
  location_id: string;
  position: Position; // Nested position object
}

interface ExtendedWorker {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  job_level: JobLevel;
  is_lead: boolean;
  location_ids: string[];
  positions: string[];
  preferred_hours_per_week: number | null;
  inactive?: boolean | null;
}

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employee: ExtendedWorker;
}

const JOB_LEVELS: JobLevel[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];

export function EditEmployeeModal({ isOpen, onClose, onSuccess, employee }: EditEmployeeModalProps) {
  const { showSuccessToast } = useAppToast();
  const [allLocations, setAllLocations] = useState<Location[]>([]); // State for all locations
  const [allLocationPositions, setAllLocationPositions] = useState<FetchedLocationPosition[]>([]); // State for all mappings
  const [filteredPositions, setFilteredPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true); // Start loading true
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
    control
  } = useForm<EmployeeFormData>({
    // @ts-ignore - Suppressing complex type mismatch between Zod schema and RHF resolver
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      first_name: employee.first_name,
      last_name: employee.last_name,
      preferred_name: employee.preferred_name || '',
      job_level: employee.job_level,
      is_lead: employee.is_lead,
      positions: employee.positions,
      location_ids: employee.location_ids,
      preferred_hours_per_week: employee.preferred_hours_per_week ?? undefined,
      inactive: employee.inactive !== true,
    }
  });

  // Fetch initial data (locations, positions) on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Fetch all locations
        const locations = await fetchAllLocations(supabase);
        setAllLocations(locations);

        // 2. Fetch all location-position mappings with position details
        const { data: locationPositionsData, error: lpError } = await supabase
          .from('location_positions')
          .select(`
            id,
            location_id,
            position:positions (
              id,
              name
            )
          `);

        if (lpError) throw lpError;

        // Map the potentially nested array structure from Supabase
        const fetchedData: FetchedLocationPosition[] = (locationPositionsData || []).map((item: any) => {
          const positionObject = Array.isArray(item.position) ? item.position[0] : item.position;
          return {
            id: item.id,
            location_id: item.location_id,
            position: positionObject && typeof positionObject === 'object' && 'id' in positionObject && 'name' in positionObject 
                      ? positionObject 
                      : { id: '', name: 'Unknown' } 
          };
        }).filter(lp => lp.position.id !== '');

        setAllLocationPositions(fetchedData);

      } catch (err: any) {
        console.error('Error fetching initial modal data:', err);
        setError('Failed to load required data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) { // Only fetch when the modal is open
       fetchInitialData();
    }
  }, [isOpen]);

  // Effect to reset form when modal opens or employee data changes
  useEffect(() => {
    if (isOpen && employee) {
      // console.log('Resetting form. Employee preferred_hours_per_week:', employee.preferred_hours_per_week); // Intentionally commented out
      reset({
        first_name: employee.first_name,
        last_name: employee.last_name,
        preferred_name: employee.preferred_name || '',
        job_level: employee.job_level,
        is_lead: employee.is_lead,
        positions: employee.positions,
        location_ids: employee.location_ids,
        preferred_hours_per_week: employee.preferred_hours_per_week ?? undefined,
        inactive: employee.inactive !== true,
      });
    }
  }, [isOpen, employee, reset]);

  // Watch selected locations to filter available positions
  const watchLocationIds = watch('location_ids'); // Renamed from watchLocations
  useEffect(() => {
    if (watchLocationIds && watchLocationIds.length > 0) {
      // Filter all mappings based on currently selected location IDs
      const relevantMappings = allLocationPositions.filter(lp => 
        watchLocationIds.includes(lp.location_id) // Filter by location_id
      );
      
      // Get unique positions available in the selected locations
      const positionsInSelectedLocations = relevantMappings
        .map(lp => lp.position)
        .filter((pos, index, self) => 
          pos && index === self.findIndex(p => p?.id === pos.id)
        );
      
      setFilteredPositions(positionsInSelectedLocations);

    } else if (employee.positions.length > 0) {
      // If no locations selected but we have employee positions, show all positions from their assigned locations
      const employeeLocationMappings = allLocationPositions.filter(lp => 
        employee.location_ids.includes(lp.location_id)
      );
      
      const employeeAvailablePositions = employeeLocationMappings
        .map(lp => lp.position)
        .filter((pos, index, self) => 
          pos && index === self.findIndex(p => p?.id === pos.id)
        );
      
      setFilteredPositions(employeeAvailablePositions);
    } else {
      setFilteredPositions([]); // No locations selected and no employee positions, clear available positions
    }
  // Depend on watchLocationIds, allLocationPositions, and employee data
  }, [watchLocationIds, allLocationPositions, employee.positions, employee.location_ids]); 

  const onSubmit: SubmitHandler<EmployeeFormData> = async (data) => {
    setLoading(true);
    setError(null);

    try {
      // Create an object with only the fields to update on the workers table
      const workerUpdateData = {
        first_name: data.first_name,
        last_name: data.last_name,
        preferred_name: data.preferred_name || null,
        job_level: data.job_level,
        is_lead: data.is_lead,
        // Convert undefined (from empty/invalid input after preprocess) or null to null for DB
        preferred_hours_per_week: data.preferred_hours_per_week ?? null,
        inactive: data.inactive ? null : true,
      };

      // Update worker
      const { error: workerError } = await supabase
        .from('workers')
        .update(workerUpdateData) // Pass the specific update object
        .eq('id', employee.id);

      if (workerError) throw workerError;

      // ---- Update worker_locations ----
      // 1. Get existing worker_locations
      const { data: existingLocations, error: fetchLocationsError } = await supabase
        .from('worker_locations')
        .select('location_id')
        .eq('worker_id', employee.id);

      if (fetchLocationsError) throw fetchLocationsError;
      const existingLocationIds = existingLocations?.map(loc => loc.location_id) || [];

      // 2. Determine locations to add and remove
      const selectedLocationIds = data.location_ids || []; // Ensure it's an array
      const locationsToAdd = selectedLocationIds.filter(id => !existingLocationIds.includes(id));
      const locationsToRemove = existingLocationIds.filter(id => !selectedLocationIds.includes(id));

      // 3. Add new worker_locations
      if (locationsToAdd.length > 0) {
        const newWorkerLocations = locationsToAdd.map(locationId => ({
          worker_id: employee.id,
          location_id: locationId
        }));
        const { error: insertLocError } = await supabase
          .from('worker_locations')
          .insert(newWorkerLocations);
        if (insertLocError) throw insertLocError;
      }

      // 4. Remove old worker_locations
      if (locationsToRemove.length > 0) {
        const { error: deleteLocError } = await supabase
          .from('worker_locations')
          .delete()
          .eq('worker_id', employee.id)
          .in('location_id', locationsToRemove);
        if (deleteLocError) throw deleteLocError;
      }
      // ---- End Update worker_locations ----

      // ---- Update worker_positions ----
      // First, get existing positions to compare
      const { data: existingPositions, error: fetchError } = await supabase
        .from('worker_positions')
        .select('position_id')
        .eq('worker_id', employee.id);

      if (fetchError) throw fetchError;

      const existingPositionIds = existingPositions?.map(p => p.position_id) || [];
      
      // Positions to add (in new but not in existing)
      const positionsToAdd = data.positions.filter(id => !existingPositionIds.includes(id));
      
      // Positions to remove (in existing but not in new)
      const positionsToRemove = existingPositionIds.filter(id => !data.positions.includes(id));
      
      // Add new positions
      if (positionsToAdd.length > 0) {
        const workerPositions = positionsToAdd.map(positionId => ({
          worker_id: employee.id,
          position_id: positionId
        }));

        const { error: insertError } = await supabase
          .from('worker_positions')
          .insert(workerPositions);

        if (insertError) throw insertError;
      }
      
      // Remove positions that are no longer assigned
      if (positionsToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('worker_positions')
          .delete()
          .eq('worker_id', employee.id)
          .in('position_id', positionsToRemove);

        if (deleteError) throw deleteError;
      }

      showSuccessToast(`Employee ${data.first_name} ${data.last_name}'s details updated.`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error updating employee:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      setLoading(true);
      // Delete worker positions first (foreign key constraint)
      const { error: positionsError } = await supabase
        .from('worker_positions')
        .delete()
        .eq('worker_id', employee.id);

      if (positionsError) throw positionsError;

      // Delete worker
      const { error: workerError } = await supabase
        .from('workers')
        .delete()
        .eq('id', employee.id);

      if (workerError) throw workerError;

      showSuccessToast(`Employee ${employee.first_name} ${employee.last_name} deleted successfully.`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Error deleting employee:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleClose = () => {
    reset();
    setError(null);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px] bg-[#f8f9f7]">
          <DialogHeader>
            <DialogTitle className="text-xl font-manrope font-semibold">Edit Employee</DialogTitle>
          </DialogHeader>
          {error && <p className="text-sm text-red-500 text-center mb-4">Error: {error}</p>}
          {loading && <p className="text-sm text-muted-foreground text-center mb-4">Loading data...</p>}
          
          {!loading && !error && (
            // @ts-ignore - Suppressing complex type mismatch between validated type and handleSubmit expectation
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    {...register('first_name')}
                    placeholder="Enter first name"
                    className={errors.first_name ? 'border-red-500' : ''}
                  />
                  {errors.first_name && (
                    <p className="text-sm text-red-500">{errors.first_name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    {...register('last_name')}
                    placeholder="Enter last name"
                    className={errors.last_name ? 'border-red-500' : ''}
                  />
                  {errors.last_name && (
                    <p className="text-sm text-red-500">{errors.last_name.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferred_name">Nickname (optional)</Label>
                <Input
                  id="preferred_name"
                  {...register('preferred_name')}
                  placeholder="Enter nickname"
                />
                <p className="text-xs text-muted-foreground">
                  This name will be displayed on schedules. If left empty, first name will be used.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferred_hours_per_week">Preferred hours per week (optional)</Label>
                <Input
                  id="preferred_hours_per_week"
                  type="number"
                  min="0"
                  max="40"
                  {...register('preferred_hours_per_week', { valueAsNumber: true })}
                  placeholder="Enter number of preferred hours"
                  className={errors.preferred_hours_per_week ? 'border-red-500' : ''}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty if no preference.
                </p>
                {errors.preferred_hours_per_week && (
                  <p className="text-sm text-red-500">{errors.preferred_hours_per_week.message}</p>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="job_level">Job Level</Label>
                  <Select
                    value={watch('job_level')}
                    onValueChange={(value) => {
                      if (JOB_LEVELS.includes(value as JobLevel)) {
                        setValue('job_level', value as JobLevel);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a job level" />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.job_level && (
                    <p className="text-sm text-red-500">{errors.job_level.message}</p>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_lead"
                    checked={watch('is_lead')}
                    onCheckedChange={(checked) => setValue('is_lead', checked as boolean)}
                  />
                  <Label htmlFor="is_lead" className="text-sm font-normal">
                    Can be assigned as Opening/Closing Lead
                  </Label>
                </div>
              </div>

              {/* Active Status Toggle */}
              <Controller
                name="inactive"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="active_status" className="text-base">Worker Status</Label>
                    <div className="flex items-center space-x-3 p-3 border rounded-md bg-background">
                      <Switch
                        id="active_status"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <Label htmlFor="active_status" className="font-normal text-sm cursor-pointer">
                        {field.value ? 'Active' : 'Inactive'}
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground px-1">
                      Inactive workers will not be included in schedule generation or manual assignments.
                    </p>
                    {errors.inactive && (
                      <p className="text-sm text-red-500">{errors.inactive.message}</p>
                    )}
                  </div>
                )}
              />
              {/* End Active Status Toggle */}

              {/* Location Selection */}
              <Controller
                name="location_ids"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Locations</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {allLocations.map((location) => (
                        <div key={location.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`location-${location.id}`}
                            checked={field.value?.includes(location.id)}
                            onCheckedChange={(checked) => {
                              const currentLocationIds = field.value || [];
                              if (checked) {
                                field.onChange([...currentLocationIds, location.id]);
                              } else {
                                field.onChange(currentLocationIds.filter((id) => id !== location.id));
                              }
                            }}
                          />
                          <Label htmlFor={`location-${location.id}`} className="font-normal">
                            {location.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {allLocations.length === 0 && !loading && (
                       <p className="text-sm text-muted-foreground">No locations available.</p>
                    )}
                     {loading && (
                       <p className="text-sm text-muted-foreground">Loading locations...</p>
                    )}
                    {errors.location_ids && (
                      <p className="text-sm text-red-500">{errors.location_ids.message}</p>
                    )}
                  </div>
                )}
              />
              {/* End Location Selection */}

              {/* Position Selection */}
              <Controller
                name="positions"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label>Positions</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {filteredPositions.map((position) => (
                        <div key={position.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`position-${position.id}`}
                            checked={field.value?.includes(position.id)}
                            onCheckedChange={(checked) => {
                              const currentPositions = field.value || [];
                              if (checked) {
                                field.onChange([...currentPositions, position.id]);
                              } else {
                                field.onChange(currentPositions.filter((id) => id !== position.id));
                              }
                            }}
                          />
                          <Label htmlFor={`position-${position.id}`} className="font-normal">
                            {position.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {filteredPositions.length === 0 && watchLocationIds?.length > 0 && !loading && (
                      <p className="text-sm text-muted-foreground">No positions available for selected locations.</p>
                    )}
                    {(!watchLocationIds || watchLocationIds.length === 0) && !loading && (
                      <p className="text-sm text-muted-foreground">Select locations to see available positions.</p>
                    )}
                    {loading && (
                      <p className="text-sm text-muted-foreground">Loading positions...</p>
                    )}
                    {errors.positions && (
                      <p className="text-sm text-red-500">{errors.positions.message}</p>
                    )}
                  </div>
                )}
              />
              {/* End Position Selection */}

              <div className="flex justify-between items-center border-t border-border pt-8 mt-8">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={loading}
                >
                  Delete Employee
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {employee.first_name} {employee.last_name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={loading}
            >
              No, keep employee
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={loading}
            >
              {loading ? 'Deleting...' : 'Yes, delete employee'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
} 