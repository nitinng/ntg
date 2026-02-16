import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import Input from './Input';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

interface AuthViewProps {
    initialMode?: AuthMode;
    onFinishReset?: () => void;
}

const AuthView = ({ initialMode = 'login', onFinishReset }: AuthViewProps) => {
    const [mode, setMode] = useState<AuthMode>(initialMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSocialLoading, setIsSocialLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync mode if initialMode changes externally (e.g. from App.tsx recovery event)
    useEffect(() => {
        setMode(initialMode);
    }, [initialMode]);

    const handleGoogleLogin = async () => {
        setIsSocialLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/`,
                },
            });
            if (error) throw error;
        } catch (err: any) {
            console.error("Google Auth Error:", err);
            setError(err.message || "Failed to connect to Google. Please try email login.");
            toast.error("Google login failed");
            setIsSocialLoading(false);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            if (mode === 'login') {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                toast.success("Welcome back!");
            } else if (mode === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                        },
                    },
                });
                if (error) throw error;
                toast.success("Registration successful!");
            } else if (mode === 'forgot') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/`,
                });
                if (error) throw error;
                toast.success("Password reset link sent to your email!");
                setMode('login');
            } else if (mode === 'reset') {
                const { error } = await supabase.auth.updateUser({
                    password: password
                });
                if (error) throw error;
                toast.success("Password updated successfully!");
                if (onFinishReset) onFinishReset();
                setMode('login');
            }
        } catch (err: any) {
            console.error("Supabase Auth Error:", err);
            setError(err.message || "An error occurred during authentication");
            toast.error(err.message || "Authentication failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 transition-all duration-500">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-500">
                <div className="p-8 md:p-10">
                    <header className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white text-3xl font-black shadow-xl shadow-indigo-600/30 mb-6 transition-transform hover:scale-105">N</div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                            {mode === 'login' && 'Welcome Back'}
                            {mode === 'signup' && 'Create Account'}
                            {mode === 'forgot' && 'Reset Password'}
                            {mode === 'reset' && 'Update Password'}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium px-4">
                            {mode === 'login' && 'Access the travel desk with your Google account'}
                            {mode === 'signup' && 'Join the Navgurukul travel management system'}
                            {mode === 'forgot' && 'Enter your email to receive a reset link'}
                            {mode === 'reset' && 'Enter your new password below'}
                        </p>
                    </header>

                    {error && (
                        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <i className="fa-solid fa-circle-exclamation text-rose-500 mt-0.5"></i>
                            <p className="text-xs font-bold text-rose-700 dark:text-rose-400 leading-relaxed">{error}</p>
                        </div>
                    )}

                    {/* Social Login Section */}
                    {(mode === 'login' || mode === 'signup') && (
                        <div className="space-y-4">
                            <button
                                onClick={handleGoogleLogin}
                                disabled={isSocialLoading || isLoading}
                                className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 py-3.5 rounded-2xl font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                                {isSocialLoading ? (
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                ) : (
                                    <svg viewBox="0 0 24 24" width="20" height="20" className="mr-1">
                                        <path
                                            fill="#4285F4"
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        />
                                        <path
                                            fill="#34A853"
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        />
                                        <path
                                            fill="#FBBC05"
                                            d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                                        />
                                        <path
                                            fill="#EA4335"
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                                        />
                                    </svg>
                                )}
                                {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
                            </button>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-200 dark:border-slate-800"></span>
                                </div>
                                <div className="relative flex justify-center text-2xs uppercase font-black tracking-widest px-4">
                                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-400">Or use email</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleAuth} className="space-y-5">
                        {mode === 'signup' && (
                            <Input
                                label="Full Name"
                                placeholder="John Doe"
                                required
                                value={fullName}
                                onChange={(e: any) => setFullName(e.target.value)}
                            />
                        )}
                        {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
                            <Input
                                label="Email Address"
                                type="email"
                                placeholder="name@navgurukul.org"
                                required
                                value={email}
                                onChange={(e: any) => setEmail(e.target.value)}
                            />
                        )}
                        {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
                            <div className="space-y-1">
                                <Input
                                    label={mode === 'reset' ? "New Password" : "Password"}
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    value={password}
                                    onChange={(e: any) => setPassword(e.target.value)}
                                />
                                {mode === 'login' && (
                                    <div className="text-right">
                                        <button
                                            type="button"
                                            onClick={() => { setMode('forgot'); setError(null); }}
                                            className="text-xs font-bold text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                        >
                                            Forgot Password?
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading || isSocialLoading}
                            className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-4 rounded-xl font-bold transition-all active:scale-[0.98] disabled:opacity-50 mt-4 border border-transparent hover:border-slate-300 dark:hover:border-slate-600"
                        >
                            {isLoading ? (
                                <i className="fa-solid fa-spinner fa-spin mr-2"></i>
                            ) : (
                                <i className={`fa-solid ${mode === 'login' ? 'fa-right-to-bracket' : mode === 'signup' ? 'fa-user-plus' : mode === 'forgot' ? 'fa-paper-plane' : 'fa-check'} mr-2`}></i>
                            )}
                            {mode === 'login' && 'Sign In with Password'}
                            {mode === 'signup' && 'Sign Up with Password'}
                            {mode === 'forgot' && 'Send Reset Link'}
                            {mode === 'reset' && 'Update Password'}
                        </button>
                    </form>

                    <footer className="mt-8 text-center space-y-4">
                        {(mode === 'forgot' || mode === 'reset') ? (
                            <button
                                onClick={() => { setMode('login'); setError(null); if (onFinishReset) onFinishReset(); }}
                                className="text-sm font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-all"
                            >
                                <i className="fa-solid fa-arrow-left mr-2"></i>Back to Login
                            </button>
                        ) : (
                            <button
                                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
                                className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline transition-all"
                            >
                                {mode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                            </button>
                        )}
                    </footer>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 border-t border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">
                        Powered by <span className="text-emerald-600 dark:text-emerald-400 font-bold">Supabase</span> Security
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AuthView;
