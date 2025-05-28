"use client";

import React from 'react';
import { WorkerSelectorDropdown } from '@/components/select/WorkerSelectorDropdown';

export default function ComboboxTestPage() {
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
      />
    </div>
  );
} 