import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a worker's name based on the context
 * @param firstName The worker's first name
 * @param lastName The worker's last name
 * @param preferredName The worker's preferred name (nickname)
 * @param format The format to use: 'full' for "nickname (first_name) last_name" or 'display' for just "nickname"
 * @returns Formatted name string
 */
export function formatWorkerName(
  firstName: string,
  lastName: string,
  preferredName?: string | null,
  format: 'full' | 'display' = 'full'
): string {
  if (!preferredName) {
    return `${firstName} ${lastName}`;
  }

  if (format === 'display') {
    return preferredName;
  }

  return `${preferredName} (${firstName}) ${lastName}`;
} 