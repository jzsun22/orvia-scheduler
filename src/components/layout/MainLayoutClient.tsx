'use client';

import { usePathname } from 'next/navigation';
import { SidebarNav } from "@/components/layout/SidebarNav";

export default function MainLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const showSidebar = pathname !== '/login';

  return (
    <div className="flex h-full">
      {showSidebar && <SidebarNav />}
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
} 