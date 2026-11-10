'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Lock, Loader2, LogIn, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import { authClient } from '@/lib/authClient';
import { storage } from '@/lib/storage';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!username.trim() || !password) {
      setError('Заполните все поля');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        const res = await authClient.login(username.trim(), password);
        if (!res.success) {
          setError(res.error || 'Ошибка входа');
          setIsLoading(false);
          return;
        }
      } else {
        const res = await authClient.register(username.trim(), password);
        if (!res.success) {
          setError(res.error || 'Ошибка регистрации');
          setIsLoading(false);
          return;
        }
      }

      setSuccessMsg(mode === 'login' ? 'Успешный вход!' : 'Регистрация завершена!');

      // Synchronize database favorites & progress with client
      await storage.syncWithServer();

      setTimeout(() => {
        setIsLoading(false);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Произошла непредвиденная ошибка');
      setIsLoading(false);
    }
  };

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto bg-surface border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5 my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 text-primary flex items-center justify-center mx-auto shadow-glow-primary">
            {mode === 'login' ? <LogIn className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
          </div>
          <h3 className="text-lg font-black text-white pt-2">
            {mode === 'login' ? 'Вход в аккаунт' : 'Создать аккаунт'}
          </h3>
          <p className="text-xs text-zinc-400">
            {mode === 'login'
              ? 'Войдите, чтобы синхронизировать избранное и историю'
              : 'Простая регистрация для сохранения вашего прогресса'}
          </p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-black/50 border border-white/5 text-xs font-semibold">
          <button
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-1.5 rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-primary text-white shadow-glow-primary'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Вход
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-1.5 rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-primary text-white shadow-glow-primary'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Регистрация
          </button>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-300">Логин</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                required
                placeholder="Ваш логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-300">Пароль</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                placeholder="Ваш пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-glow-primary transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Обработка...</span>
              </>
            ) : mode === 'login' ? (
              <span>Войти в аккаунт</span>
            ) : (
              <span>Зарегистрироваться</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
