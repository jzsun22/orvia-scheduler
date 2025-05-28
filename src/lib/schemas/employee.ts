import { z } from 'zod';
import { JobLevel } from '@/lib/types';

export const employeeSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  preferred_name: z.string().trim().optional(),
  job_level: z.enum(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] as [JobLevel, ...JobLevel[]]),
  is_lead: z.boolean(),
  positions: z.array(z.string()).min(1, 'At least one position is required'),
  location_ids: z.array(z.string()).min(1, 'At least one location is required'),
  preferred_hours_per_week: z
    .preprocess(
      // Input `val` from form with `valueAsNumber: true` will be number or NaN.
      // Convert NaN to undefined; otherwise, pass the number through.
      (val) => (typeof val === 'number' && Number.isNaN(val) ? undefined : val),
      z.coerce // Using z.coerce.number() to align with EditEmployeeModal's approach
        .number({
          invalid_type_error: "Preferred hours must be a number.",
        })
        .int({ message: "Preferred hours must be a whole number." })
        .positive({ message: "Preferred hours must be a positive number." })
        .optional(),
    ),
  inactive: z.boolean().default(false).optional(),
});

export type EmployeeFormData = z.infer<typeof employeeSchema>; 