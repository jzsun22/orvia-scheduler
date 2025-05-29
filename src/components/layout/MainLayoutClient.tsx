'use client';

import { usePathname } from 'next/navigation';
import { SidebarNav } from "@/components/layout/SidebarNav";
import AuthorshipNote from "@/components/layout/AuthorshipNote";

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
      <main className="flex-1 overflow-y-auto pt-8 px-8 flex flex-col min-h-full">
        <div className="flex-grow">
          {children}
        </div>
        <AuthorshipNote />
      </main>
    </div>
  );
} 