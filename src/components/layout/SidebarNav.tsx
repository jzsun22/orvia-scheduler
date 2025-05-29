"use client"

import Link from "next/link"
// import Image from "next/image" // Image component can be added back if a logo is used
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react" 

import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ChevronDown,
  ChevronUp,
  Briefcase, // Placeholder for Logo
  UserCircle, // Placeholder for user avatar
} from "lucide-react"

interface Location {
  id: string
  name: string
}

const baseNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Employees", href: "/employees", icon: Users },
]

// Helper function to capitalize first letter of each word
const capitalizeLocationName = (name: string): string => {
  if (!name) return ""
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export function SidebarNav() {
  const pathname = usePathname()
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [locations, setLocations] = useState<Array<{ name: string; href: string }>>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(true)
  const [userName, setUserName] = useState<string | null>(null)
  const [isLoadingUser, setIsLoadingUser] = useState(true)

  useEffect(() => {
    // Set schedule open state based on initial path
    if (pathname.startsWith("/schedule")) {
      setIsScheduleOpen(true);
    }

    const fetchLocations = async () => {
      setIsLoadingLocations(true)
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")

      if (error) {
        console.error("Error fetching locations:", error)
        setLocations([]) // Set to empty array on error
      } else if (data) {
        const formattedLocations = data.map((loc: Location) => ({
          name: capitalizeLocationName(loc.name),
          href: `/schedule/${loc.name.toLowerCase().replace(/\s+/g, "-")}`, // Create a slug-like href
        }))
        setLocations(formattedLocations)
      }
      setIsLoadingLocations(false)
    }

    const fetchUserData = async () => {
      setIsLoadingUser(true)
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        console.error("Error fetching user or no user logged in:", authError)
        setUserName("User") // Default or placeholder
        setIsLoadingUser(false)
        return
      }

      // Now fetch from 'workers' table using the user.id
      console.log("[SidebarNav] Attempting to fetch worker details for user.id:", user.id);
      const { data: workerData, error: workerError } = await supabase
        .from("workers")
        .select("preferred_name, first_name, last_name")
        .eq("user_id", user.id) // Assuming the 'id' in 'workers' table is the auth user id
        .single()

      console.log("[SidebarNav] Worker data:", workerData);
      console.log("[SidebarNav] Worker error:", workerError);

      if (workerError) {
        console.error("Error fetching worker details:", workerError)
        setUserName(user.email || "User") // Fallback to email or generic User
      } else if (workerData) {
        setUserName(workerData.preferred_name || workerData.first_name || "User")
      } else {
        console.log("[SidebarNav] No workerData found, falling back to email/User for user.id:", user.id);
        setUserName(user.email || "User") // Fallback if no worker record found
      }
      setIsLoadingUser(false)
    }

    fetchLocations()
    fetchUserData()
  }, [pathname]) // Add pathname to the dependency array

  return (
    <div className="flex h-screen w-72 flex-col border-r border-neutral-200 bg-white p-6">
      {/* Header with Logo and App Name - Reduced size */}
      <div className="mb-8 flex items-center space-x-2 px-1"> {/* Adjusted mb, space-x, px */}
        <Briefcase className="h-7 w-7 text-[#0d5442]" /> {/* Adjusted icon size */}
        <h1 className="text-2xl font-bold text-[#0d5442]">Tong sui</h1> {/* Adjusted text size */}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5"> {/* Adjusted space-y */}
        {baseNavigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href && item.href !== "/" && pathname.startsWith(item.href)); // Adjusted to handle root and other paths

          const linkClasses = cn(
            "group flex items-center rounded-lg px-3 py-2.5 text-sm font-semibold",
            isActive
              ? "bg-[#0d5442] text-white"
              : "text-neutral-700 hover:bg-neutral-100 hover:text-[#0d5442]"
          );

          const iconClasses = cn(
            "mr-3 h-5 w-5 flex-shrink-0",
            isActive
              ? "text-white"
              : "text-neutral-500 group-hover:text-[#0d5442]"
          );

          return (
            <Link
              key={item.name}
              href={item.href!}
              className={linkClasses}
            >
              <item.icon
                className={iconClasses}
                aria-hidden="true"
              />
              {item.name}
            </Link>
          );
        })}

        {/* Schedule Dropdown */}
        <div>
          <button
            onClick={() => setIsScheduleOpen(!isScheduleOpen)}
            disabled={isLoadingLocations} // Disable button while loading
            className={cn(
              "group flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-semibold", // Adjusted padding, text size
              pathname.startsWith("/schedule")
                ? "bg-[#0d5442] text-white"
                : "text-neutral-700 hover:bg-neutral-100 hover:text-[#0d5442]",
              isLoadingLocations && "cursor-not-allowed opacity-50"
            )}
          >
            <CalendarDays
              className={cn(
                "mr-3 h-5 w-5 flex-shrink-0", // Adjusted margin, icon size
                pathname.startsWith("/schedule")
                  ? "text-white"
                  : "text-neutral-500 group-hover:text-[#0d5442]"
              )}
              aria-hidden="true"
            />
            Schedule
            {isLoadingLocations ? (
              <span className="ml-auto text-xs italic">Loading...</span>
            ) : isScheduleOpen ? (
              <ChevronUp className="ml-auto h-4 w-4" /> // Adjusted icon size
            ) : (
              <ChevronDown className="ml-auto h-4 w-4" /> // Adjusted icon size
            )}
          </button>
          {!isLoadingLocations && isScheduleOpen && (
            <div className="mt-1 space-y-1 pl-8"> {/* Adjusted padding */}
              {locations.length > 0 ? (
                locations.map((loc) => (
                  <Link
                    key={loc.name}
                    href={loc.href}
                    className={cn(
                      "group flex items-center rounded-md px-3 py-2 text-sm font-medium", // Changed py-1.5 to py-2 and text-xs to text-sm
                      pathname === loc.href
                        ? "text-[#0d5442] font-semibold" // Bolder active sub-item
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-[#0d5442]"
                    )}
                  >
                    {loc.name}
                  </Link>
                ))
              ) : (
                <span className="block px-3 py-1.5 text-xs text-neutral-500">
                  No locations found.
                </span>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* User Info Footer */}
      <div className="mt-auto border-t border-neutral-200 pt-5"> {/* Adjusted padding */}
        <div className="flex items-center space-x-2.5"> {/* Adjusted spacing */}
          <UserCircle className="h-9 w-9 rounded-full text-neutral-500" /> {/* Adjusted icon size */}
          <div>
            {isLoadingUser ? (
              <p className="text-xs font-semibold text-neutral-800">Loading...</p>
            ) : (
              <p className="text-xs font-semibold text-neutral-800">{userName}</p>
            )}
            <p className="text-[11px] text-neutral-500">Store Manager</p> {/* Adjusted text size */}
          </div>
        </div>
      </div>
    </div>
  )
} 