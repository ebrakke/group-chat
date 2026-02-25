import { api, setSessionToken, getSessionToken } from '$lib/api';
import type { User } from '$lib/types';

class AuthStore {
  user = $state<User | null>(null);
  loading = $state(true);
  hasUsers = $state(true);

  get isLoggedIn() {
    return this.user !== null;
  }

  get isAdmin() {
    return this.user?.role === 'admin';
  }

  async checkAuth() {
    this.loading = true;
    try {
      const token = getSessionToken();
      if (token) setSessionToken(token);
      this.user = await api<User>('GET', '/api/auth/me');
    } catch {
      this.user = null;
    } finally {
      this.loading = false;
    }
  }

  async checkHasUsers() {
    try {
      const res = await api<{ hasUsers: boolean }>('GET', '/api/auth/has-users');
      this.hasUsers = res.hasUsers;
    } catch {
      this.hasUsers = true;
    }
  }

  async login(username: string, password: string) {
    const res = await api<{ user: User; token: string }>('POST', '/api/auth/login', {
      username,
      password
    });
    this.user = res.user;
    setSessionToken(res.token);
  }

  async bootstrap(username: string, password: string, displayName: string) {
    const res = await api<{ user: User; token: string }>('POST', '/api/auth/bootstrap', {
      username,
      password,
      displayName
    });
    this.user = res.user;
    setSessionToken(res.token);
  }

  async signup(username: string, password: string, displayName: string, inviteCode: string) {
    const res = await api<{ user: User; token: string }>('POST', '/api/auth/signup', {
      username,
      password,
      displayName,
      inviteCode
    });
    this.user = res.user;
    setSessionToken(res.token);
  }

  async logout() {
    try {
      await api('POST', '/api/auth/logout');
    } catch {
      // ignore logout errors
    }
    this.user = null;
    setSessionToken(null);
  }
}

export const authStore = new AuthStore();
