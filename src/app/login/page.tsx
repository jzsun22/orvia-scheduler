'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      if (rememberMe) {
        localStorage.setItem('rememberUser', 'true');
      } else {
        localStorage.removeItem('rememberUser');
      }
      router.push('/dashboard'); // Redirect to dashboard on successful login
      router.refresh(); // Ensure the layout re-renders and middleware runs
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8f9f7] p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#1f1f1f]">Login</h1>
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[#1f1f1f]">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-gray-300 focus:border-[#0d5442] focus:ring-[#0d5442]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-[#1f1f1f]">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-gray-300 focus:border-[#0d5442] focus:ring-[#0d5442]"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              className="border-gray-300 data-[state=checked]:bg-[#0d5442] data-[state=checked]:text-white"
            />
            <Label htmlFor="rememberMe" className="cursor-pointer select-none text-sm text-[#4d4d4d]">
              Remember Me
            </Label>
          </div>
          <Button type="submit" className="w-full bg-[#0d5442] text-white hover:bg-[#0a4335]">
            Login
          </Button>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        </form>
      </div>
    </div>
  );
} 