'use client';

import { useState, useEffect } from 'react';
import { fetchWorkers } from '@/lib/supabase';
import { supabase } from '@/lib/supabase/client'
import { PlusCircle, Search, ChevronDown } from 'lucide-react';
import { AddEmployeeModal } from '@/components/modals/AddEmployeeModal';
import { EditEmployeeModal } from '@/components/modals/EditEmployeeModal';
import { AvailabilityModal } from '@/components/modals/AvailabilityModal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuCheckboxItem,
  DropdownMenuContent, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatWorkerName } from '@/lib/utils';
import { JobLevel } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

interface DatabaseWorker {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  job_level: JobLevel;
  availability: any;
  preferred_hours_per_week: number | null;
  is_lead: boolean;
  created_at: string;
  inactive?: boolean | null;
  positions: {
    position: {
      name: string;
      id: string;
    }
  }[];
  locations: {
    location: {
      id: string;
      name: string;
    }
  }[];
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  job_level: JobLevel;
  is_lead: boolean;
  location_ids: string[];
  positions: string[];
  availability: any;
  preferred_hours_per_week: number | null;
  created_at: string;
  inactive?: boolean | null;
}

interface Location {
  id: string;
  name: string;
}

export default function EmployeesPage() {
  const [workers, setWorkers] = useState<DatabaseWorker[]>([]);
  const [filteredWorkers, setFilteredWorkers] = useState<DatabaseWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingAvailability, setEditingAvailability] = useState<DatabaseWorker | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);
  
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  // Filter state hooks for future implementation
  const [jobLevelFilter, setJobLevelFilter] = useState<string[]>([]);
  const [positionFilter, setPositionFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);

  useEffect(() => {
    // Initial check for session, mostly for immediate UI, auth state listener is primary
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        console.warn('[EmployeesPage] Initial session check: No active session.');
        // Potentially set loading to false here if not handled by onAuthStateChange for unauthed users
      } else {
        console.log('[EmployeesPage] Initial session check: Session found.');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[EmployeesPage] onAuthStateChange event:', event, 'session status:', session ? 'active' : 'inactive');
      if (session) {
        // User is signed in or session restored
        if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && !isInitialDataLoaded) {
          console.log(`[EmployeesPage] ${event} and initial data not loaded. Calling loadInitialData.`);
          await loadInitialData();
          setIsInitialDataLoaded(true); // Mark that initial data has been loaded
        } else if (event === 'SIGNED_IN' && isInitialDataLoaded) {
            console.log('[EmployeesPage] SIGNED_IN event, but initial data already loaded. Currently NOT reloading workers to prevent potential infinite loop on tab refocus.');
            // To prevent the loop, we are not calling loadWorkers() here on subsequent SIGNED_IN events (e.g., tab refocus).
            // If data refresh on tab focus is strictly required and this SIGNED_IN event is the correct trigger,
            // then the robustness of loadWorkers() on such calls would need further investigation.
        } else if (event === 'TOKEN_REFRESHED') {
            console.log('[EmployeesPage] TOKEN_REFRESHED. Data not automatically reloaded, but consider if needed.');
            // If data needs to be refreshed when token is updated, you might call loadWorkers() here:
            // await loadWorkers();
        }
      } else {
        // User is signed out or no session
        console.log('[EmployeesPage] No active session or user signed out. Resetting state.');
        setError('User not authenticated. Please log in to view employees.');
        setWorkers([]);
        setFilteredWorkers([]);
        setLoading(false);
        setIsInitialDataLoaded(false); // Reset flag
      }
    });

    // Cleanup listener on component unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [isInitialDataLoaded]); // Added isInitialDataLoaded to dependency array

  // Apply search and filters whenever workers or filter criteria change
  useEffect(() => {
    console.log('[EmployeesPage] Filtering effect triggered. workers:', workers, 'searchQuery:', searchQuery);
    let result = [...workers];
    
    // Apply search filter (case-insensitive)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(worker => 
        worker.first_name.toLowerCase().includes(query) || 
        worker.last_name.toLowerCase().includes(query) ||
        (worker.preferred_name && worker.preferred_name.toLowerCase().includes(query))
      );
    }
    
    // Apply job level filter
    if (jobLevelFilter.length > 0) {
      result = result.filter(worker => jobLevelFilter.includes(worker.job_level.toString()));
    }
    
    // Apply position filter
    if (positionFilter.length > 0) {
      result = result.filter(worker => 
        worker.positions.some(p => positionFilter.includes(p.position.id))
      );
    }
    
    // Apply location filter
    if (locationFilter.length > 0) {
      result = result.filter(worker => 
        worker.locations.some(loc => locationFilter.includes(loc.location.id))
      );
    }
    
    setFilteredWorkers(result);
    console.log('[EmployeesPage] Filtered workers result:', result);
  }, [workers, searchQuery, jobLevelFilter, positionFilter, locationFilter]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    console.log('[EmployeesPage] loadInitialData: Starting to fetch initial data...');
    try {
      // Fetch workers
      const fetchedWorkers = await fetchWorkers(supabase);
      console.log('[EmployeesPage] loadInitialData: Raw data from fetchWorkers:', fetchedWorkers);
      setWorkers(fetchedWorkers);
      setFilteredWorkers(fetchedWorkers); // Initialize filteredWorkers with all workers
      console.log('[EmployeesPage] loadInitialData: Set workers and filteredWorkers state. Workers:', fetchedWorkers);

      // Fetch locations
      const { data: locationsData, error: locationsError } = await supabase
        .from('locations')
        .select('id, name');
      
      if (locationsError) {
        console.error('Error fetching locations:', locationsError);
        throw new Error(locationsError.message);
      }
      console.log('[EmployeesPage] loadInitialData: Raw data from locations fetch:', locationsData);
      setAllLocations(locationsData || []);

      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching initial data:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const loadWorkers = async () => {
    // This function can be kept if you need to reload only workers later,
    // or can be merged into loadInitialData if workers and locations are always loaded together.
    // For now, let's assume loadInitialData is the primary way to load data.
    // If loadWorkers is still called from somewhere else (e.g. after adding/editing an employee),
    // ensure it behaves as expected. Consider if it should also reload locations or if that's not needed.
    // For simplicity, this example will have modals call loadInitialData to refresh everything.
    setLoading(true);
    setError(null);
    console.log('[EmployeesPage] loadWorkers: Starting to fetch workers (potentially redundant if loadInitialData is used everywhere)...');
    try {
      const fetchedData = await fetchWorkers(supabase);
      console.log('[EmployeesPage] loadWorkers: Raw data from fetchWorkers:', fetchedData);
      setWorkers(fetchedData);
      setFilteredWorkers(fetchedData);
      console.log('[EmployeesPage] loadWorkers: Set workers and filteredWorkers state. Workers:', fetchedData);
      setLoading(false);
    } catch (err: any) {
      console.error('Error fetching workers:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleEditClick = (worker: DatabaseWorker) => {
    const employeeData: Employee = {
      id: worker.id,
      first_name: worker.first_name,
      last_name: worker.last_name,
      preferred_name: worker.preferred_name || null,
      job_level: worker.job_level,
      is_lead: worker.is_lead,
      location_ids: worker.locations.map(l => l.location.id),
      positions: worker.positions.map(p => p.position.id),
      availability: worker.availability,
      preferred_hours_per_week: worker.preferred_hours_per_week || null,
      created_at: worker.created_at,
      inactive: worker.inactive,
    };
    
    setEditingEmployee(employeeData);
  };

  const handleAvailabilityClick = (worker: DatabaseWorker) => {
    setEditingAvailability(worker);
  };

  const handleLocationFilterChange = (locationId: string) => {
    setLocationFilter(prev => 
      prev.includes(locationId) 
        ? prev.filter(id => id !== locationId) 
        : [...prev, locationId]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-2xl w-full p-8 bg-card rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4 text-red-600">Error Loading Employees</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-[#f8f9f7]">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Employees</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#0d5442] rounded-md hover:bg-[#0d5442]/90 transition-colors"
          >
            <PlusCircle className="h-5 w-5" />
            Add Employee
          </button>
        </div>

        {/* Search and Filter Controls */}
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          {/* Search Bar */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search employees by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          
          {/* Location Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                className="flex items-center justify-between whitespace-nowrap rounded-md border-input bg-background px-3 h-10 w-auto min-w-[200px] text-sm" // Adjusted min-width
              >
                <div className="flex items-center">
                  <span className="text-muted-foreground mr-1">Location:</span>
                  <span>
                    {locationFilter.length === 0
                      ? 'All'
                      : locationFilter.length === 1
                      ? allLocations.find(loc => loc.id === locationFilter[0])?.name || `${locationFilter.length} selected`
                      : `${locationFilter.length} selected`}
                  </span>
                </div>
                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Locations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allLocations.map((location) => (
                <DropdownMenuCheckboxItem
                  key={location.id}
                  checked={locationFilter.includes(location.id)}
                  onCheckedChange={() => handleLocationFilterChange(location.id)}
                >
                  {location.name}
                </DropdownMenuCheckboxItem>
              ))}
              {allLocations.length === 0 && (
                  <DropdownMenuLabel className="text-xs text-muted-foreground">No locations found</DropdownMenuLabel>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Job Level Filter - Placeholder */}
          <div className="hidden">
            {/* Job level filter will be implemented in future iterations */}
          </div>
          
          {/* Position Filter - Placeholder */}
          <div className="hidden">
            {/* Position filter will be implemented in future iterations */}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary/10 text-primary font-semibold">
                  <th className="text-left py-3 px-4">Name</th>
                  <th className="text-left py-3 px-4">Job Level</th>
                  <th className="text-left py-3 px-4">Position(s)</th>
                  <th className="text-left py-3 px-4">Location(s)</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-3 px-4">
                      {formatWorkerName(worker.first_name, worker.last_name, worker.preferred_name)}
                      {worker.is_lead && (
                        <Badge variant="outline" className="ml-2 px-2 py-1 text-xs bg-primary/10 text-primary rounded-full">
                          Lead
                        </Badge>
                      )}
                      {worker.inactive === true && (
                        <Badge variant="secondary" className="ml-2 px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-700">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">{worker.job_level.toString()}</td>
                    <td className="py-3 px-4">
                      {worker.positions?.map(p => p.position.name).join(', ')}
                    </td>
                    <td className="py-3 px-4">
                      {worker.locations?.map(l => l.location.name.charAt(0).toUpperCase() + l.location.name.slice(1)).join(', ')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditClick(worker)}
                          className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors"
                        >
                          Edit Profile
                        </button>
                        <button
                          onClick={() => handleAvailabilityClick(worker)}
                          className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 transition-colors"
                        >
                          Set Availability
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddModal && (
      <AddEmployeeModal
          isOpen={true}
        onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadInitialData(); // Use loadInitialData to refresh all data
          }}
      />
      )}

      {editingEmployee && (
        <EditEmployeeModal
          isOpen={true}
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSuccess={() => {
            setEditingEmployee(null);
            loadInitialData(); // Use loadInitialData
          }}
        />
      )}

      {editingAvailability && (
        <AvailabilityModal
          isOpen={true}
          employee={editingAvailability}
          onClose={() => setEditingAvailability(null)}
          onSuccess={() => {
            setEditingAvailability(null);
            loadInitialData(); // Use loadInitialData
          }}
        />
      )}
    </div>
  );
} 