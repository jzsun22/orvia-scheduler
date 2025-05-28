'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';
import { fetchAllLocations } from '../../../lib/supabase';
import { Location } from '@/lib/types';

// Interface for the displayed data
interface LocationPositionDisplayData {
  id: string;
  location_id: string;
  location_name: string;
  position_id: string;
  position_name: string;
}

export default function TestDataPage() {
  const [displayData, setDisplayData] = useState<LocationPositionDisplayData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allLocations, setAllLocations] = useState<Location[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all locations for potential ID -> Name mapping
        const locations = await fetchAllLocations(supabase);
        setAllLocations(locations);
        const locationMap = new Map(locations.map(loc => [loc.id, loc.name]));

        // Basic query - fetch relevant IDs
        const { data: basicData, error: basicError } = await supabase
          .from('location_positions')
          .select('id, location_id, position_id');
        
        if (basicError) throw basicError;
        
        console.log('Basic location_positions data (IDs):', basicData);
        // We will use the joinData for display

        // Query with joins for names
        const { data: joinData, error: joinError } = await supabase
          .from('location_positions')
          .select(`
            id,
            location_id,
            position_id,
            location:locations (id, name),
            position:positions (id, name)
          `);

        if (joinError) throw joinError;
        console.log('Join data (with names):', joinData);

        // Transform joinData for display state
        const transformedData = (joinData || []).map((item: any) => {
          const locationObj = Array.isArray(item.location) ? item.location[0] : item.location;
          const positionObj = Array.isArray(item.position) ? item.position[0] : item.position;
          return {
            id: item.id,
            location_id: item.location_id,
            location_name: locationObj?.name || 'Unknown Location',
            position_id: item.position_id,
            position_name: positionObj?.name || 'Unknown Position',
          };
        });
        setDisplayData(transformedData);

      } catch (err: any) {
        console.error('Error fetching test data:', err);
        setError(err.message);
      }
    }

    fetchData();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Location Positions Test Data</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead>
            <tr>
              <th className="px-6 py-3 border-b text-left">ID</th>
              <th className="px-6 py-3 border-b text-left">Location Name</th>
              <th className="px-6 py-3 border-b text-left">Position Name</th>
              <th className="px-6 py-3 border-b text-left">Location ID</th>
              <th className="px-6 py-3 border-b text-left">Position ID</th>
            </tr>
          </thead>
          <tbody>
            {displayData.map((item) => (
              <tr key={item.id}>
                <td className="px-6 py-4 border-b">{item.id}</td>
                <td className="px-6 py-4 border-b">{item.location_name}</td>
                <td className="px-6 py-4 border-b">{item.position_name}</td>
                <td className="px-6 py-4 border-b">{item.location_id}</td>
                <td className="px-6 py-4 border-b">{item.position_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <p className="text-sm text-gray-600">
          Check the browser console for detailed data logs
        </p>
      </div>
    </div>
  );
} 