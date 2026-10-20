import React, { useState } from 'react';
import { sounds } from '../../audio/soundEffects';
import { emailSignIn, emailRegister } from '../../services/emailAuth';

interface EmailAuthScreenProps {
  onAuthSuccess: () => void;
  onBack: () => void;
}

/**
 * Email/password sign-in & register screen.
 * Toggles between Sign In and Register modes. On success, calls onAuthSuccess.
 */
export const EmailAuthScreen: React.FC<EmailAuthScreenProps> = ({
  onAuthSuccess,
  onBack,
}) => {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (mode === 'register' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'register') {
        await emailRegister(email.trim(), password);
      } else {
        await emailSignIn(email.trim(), password);
      }
      sounds.playClick();
      onAuthSuccess();
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setError('Incorrect email or password.');
      } else if (code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Check your connection and try again.');
      } else {
        setError(err?.message ?? 'Authentication failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: 'signin' | 'register') => {
    sounds.playClick();
    setMode(newMode);
    setError(null);
    setConfirmPassword('');
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950/95 px-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => {
          sounds.playClick();
          onBack();
        }}
        className="absolute top-4 left-4 inline-flex items-center min-h-[48px] px-2 text-amber-400/80 hover:text-amber-300 text-sm font-serif uppercase tracking-wider transition-colors"
      >
        ← Back
      </button>

      {/* Panel */}
      <div className="w-full max-w-sm flex flex-col gap-5 bg-neutral-900/80 border border-amber-900/40 rounded-2xl p-7 shadow-2xl">
        <h1 className="font-serif text-2xl text-amber-200 text-center tracking-wide">
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </h1>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-neutral-800/60 rounded-full">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 py-2 rounded-full font-serif text-sm uppercase tracking-wider transition-all ${
              mode === 'signin'
                ? 'bg-[#4a0d0d] text-amber-50 shadow-lg'
                : 'text-neutral-400 hover:text-amber-300'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 rounded-full font-serif text-sm uppercase tracking-wider transition-all ${
              mode === 'register'
                ? 'bg-[#4a0d0d] text-amber-50 shadow-lg'
                : 'text-neutral-400 hover:text-amber-300'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full px-4 py-3 rounded-lg bg-neutral-800/80 border border-neutral-700 text-amber-50 placeholder-neutral-500 text-sm focus:outline-none focus:border-amber-600/60 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="w-full px-4 py-3 rounded-lg bg-neutral-800/80 border border-neutral-700 text-amber-50 placeholder-neutral-500 text-sm focus:outline-none focus:border-amber-600/60 transition-colors"
          />
          {mode === 'register' && (
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-lg bg-neutral-800/80 border border-neutral-700 text-amber-50 placeholder-neutral-500 text-sm focus:outline-none focus:border-amber-600/60 transition-colors"
            />
          )}

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 min-h-[48px] rounded-full font-serif font-bold text-sm uppercase tracking-wider text-amber-50 bg-gradient-to-r from-[#4a0d0d] via-[#6b1a1a] to-[#4a0d0d] hover:from-[#5c1010] hover:to-[#7a2020] shadow-[0_0_20px_rgba(107,26,26,0.5)] border border-[#8b2a2a]/60 active:scale-95 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isLoading
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};
