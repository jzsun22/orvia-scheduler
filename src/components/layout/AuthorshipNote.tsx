"use client";

export default function AuthorshipNote() {
  return (
    <div className="relative flex items-center justify-center text-xs font-mono text-gray-500 text-center mt-8 py-2 px-4 mb-2 select-none group">
      <span className="block transition-opacity duration-300 ease-in-out group-hover:opacity-0">
        made with ♥ by jocelyn · © 2025
      </span>
      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out">
        did this just for you ♡
      </span>
    </div>
  );
} 