'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase/client';

export default function TestConnection() {
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        // Attempt to fetch a simple query to test the connection
        const { data, error } = await supabase.from('workers').select('count').limit(1);
        
        if (error) {
          throw error;
        }
        
        setConnectionStatus('success');
      } catch (error: any) {
        console.error('Supabase connection error:', error);
        setConnectionStatus('error');
        setErrorMessage(error.message || 'Unknown error occurred');
      }
    }

    testConnection();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full p-8 bg-card rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Supabase Connection Test</h1>
        
        {connectionStatus === 'loading' && (
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-4">Testing connection to Supabase...</p>
          </div>
        )}
        
        {connectionStatus === 'success' && (
          <div className="text-center text-green-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="mt-4 text-xl font-semibold">Connection Successful!</p>
            <p className="mt-2">Your Supabase connection is working properly.</p>
          </div>
        )}
        
        {connectionStatus === 'error' && (
          <div className="text-center text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="mt-4 text-xl font-semibold">Connection Failed</p>
            <p className="mt-2">Error: {errorMessage}</p>
            <div className="mt-4 p-4 bg-red-50 rounded-md text-left">
              <p className="font-medium">Troubleshooting tips:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Check your Supabase URL and anon key in .env.local</li>
                <li>Verify your Supabase project is active</li>
                <li>Check if the 'workers' table exists in your database</li>
                <li>Ensure your database has the correct permissions set</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 