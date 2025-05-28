'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import React from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      router.push('/dashboard'); // Redirect to dashboard on successful login
      router.refresh(); // Ensure the layout re-renders and middleware runs
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' } as React.CSSProperties}>
      <h1>Login</h1>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', width: '300px', gap: '10px' } as React.CSSProperties}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' } as React.CSSProperties}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' } as React.CSSProperties}
        />
        <button type="submit" style={{ padding: '10px', backgroundColor: '#0d5442', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' } as React.CSSProperties}>
          Login
        </button>
        {error && <p style={{ color: 'red' } as React.CSSProperties}>{error}</p>}
      </form>
    </div>
  );
} 