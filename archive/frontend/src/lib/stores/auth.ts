/**
 * Authentication state store
 * Centralized auth state management for the application
 */

import { writable, derived } from 'svelte/store';
import type { User } from '$lib/types/api';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  return {
    subscribe,
    
    /**
     * Set the current user and token (e.g., after login/signup)
     */
    setUser: (user: User, token: string) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token, loading: false });
    },
    
    /**
     * Log out the current user
     */
    logout: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ user: null, token: null, loading: false });
    },
    
    /**
     * Initialize auth state from localStorage
     * Call this on app startup
     */
    init: () => {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr) as User;
          set({ user, token, loading: false });
        } catch {
          // Invalid stored data, clear it
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          set({ user: null, token: null, loading: false });
        }
      } else {
        set({ user: null, token: null, loading: false });
      }
    },
    
    /**
     * Update the current user info (e.g., after profile update)
     */
    updateUser: (user: User) => {
      update(state => {
        if (state.token) {
          localStorage.setItem('user', JSON.stringify(user));
          return { ...state, user };
        }
        return state;
      });
    },
  };
}

export const auth = createAuthStore();

// Derived stores for convenience
export const currentUser = derived(auth, $auth => $auth.user);
export const isAuthenticated = derived(auth, $auth => $auth.user !== null);
export const isAdmin = derived(auth, $auth => $auth.user?.role === 'admin');
export const authToken = derived(auth, $auth => $auth.token);
