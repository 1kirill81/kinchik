'use client';

export interface User {
  id: number;
  username: string;
}

export const AUTH_CHANGE_EVENT = 'kinostream_auth_changed';

let currentUser: User | null = null;
let isLoaded = false;

function notifyAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
  }
}

export const authClient = {
  getUser(): User | null {
    return currentUser;
  },

  isLoggedIn(): boolean {
    return currentUser !== null;
  },

  async checkAuth(): Promise<User | null> {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) {
        currentUser = null;
        isLoaded = true;
        notifyAuthChange();
        return null;
      }
      const data = await res.json();
      currentUser = data.user || null;
      isLoaded = true;
      notifyAuthChange();
      return currentUser;
    } catch {
      currentUser = null;
      isLoaded = true;
      notifyAuthChange();
      return null;
    }
  },

  async login(username: string, password: string):Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Ошибка входа' };
      }
      currentUser = data.user;
      notifyAuthChange();
      return { success: true, user: data.user };
    } catch (e: any) {
      return { success: false, error: e.message || 'Сетевая ошибка' };
    }
  },

  async register(username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Ошибка регистрации' };
      }
      currentUser = data.user;
      notifyAuthChange();
      return { success: true, user: data.user };
    } catch (e: any) {
      return { success: false, error: e.message || 'Сетевая ошибка' };
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    currentUser = null;
    notifyAuthChange();
  },
};
