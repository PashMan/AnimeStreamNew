
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { db } from '../services/db';


interface AuthContextType {
  user: User | null;
  login: (credentials: { email: string; password: string }) => Promise<boolean>;
  loginWithGoogle: () => Promise<void>;
  register: (data: { name: string; email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => Promise<boolean>;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
        const saved = localStorage.getItem('as_session');
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    // Function to fetch and set user profile
    const fetchUserProfile = async (email: string, force = false) => {
      const profile = await db.getProfile(email);
      if (profile) {
        setUser(profile);
      }
    };

    // Check for existing session
    const checkSession = async () => {
      // First try to use the stored session's email to fetch the latest profile
      if (user?.email) {
         await fetchUserProfile(user.email);
      } else {
          // If no local user, check backend auth session
          const { data: { session } } = await db.getSession();
          if (session?.user?.email) {
            await fetchUserProfile(session.user.email);
          }
      }
    };
    
    checkSession();

    // Listen for custom profile updates
    const handleProfileUpdate = () => {
      checkSession();
    };
    window.addEventListener('profileUpdated', handleProfileUpdate);

    // Listen for auth changes
    const { data: { subscription: authSubscription } } = db.onAuthStateChange(async (event: string, session: any) => {
      if (event === 'SIGNED_IN' && session?.user?.email) {
        await fetchUserProfile(session.user.email, true);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      authSubscription.unsubscribe();
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, []);

  useEffect(() => {
    try {
        if (user) {
            localStorage.setItem('as_session', JSON.stringify(user));
        } else {
            localStorage.removeItem('as_session');
        }
    } catch (e) {
        // Ignore storage errors
    }
  }, [user]);

  const login = async (credentials: { email: string; password: string }) => {
    try {
      const foundUser = await db.login(credentials);
      if (foundUser) {
        setUser(foundUser);
        closeAuthModal();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const loginWithGoogle = async () => {
    try {
      await db.loginWithGoogle();
    } catch (e) {
      console.error(e);
    }
  };

  const register = async (data: { name: string; email: string; password: string }) => {
    try {
      const result = await db.register(data);
      if (result.user) {
        setUser(result.user);
        closeAuthModal();
        return { success: true };
      } else if (result.message === 'Confirmation email sent') {
          return { success: true, message: 'На вашу почту отправлено письмо для подтверждения регистрации.' };
      } else if (result.message) {
          return { success: false, message: result.message };
      }
    } catch (e) {
      console.error(e);
    }
    return { success: false, message: 'Ошибка регистрации' };
  };

  const logout = async () => {
    try {
        await db.logout();
    } catch (e) {
        console.error("Logout error:", e);
    } finally {
        // Always clear local state even if server logout fails
        setUser(null);
        try {
            localStorage.removeItem('as_session');
        } catch {}
        window.location.reload(); // Force reload to clear any lingering state
    }
  };

  const resetPassword = async (email: string) => {
      return await db.resetPassword(email);
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user?.email) return false;
    try {
        const updatedUser = await db.updateProfile(user.email, updates);
        if (updatedUser) {
          setUser(updatedUser);
          return true;
        }
    } catch (e) {
        throw e;
    }
    return false;
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, register, resetPassword, logout, updateProfile, isAuthModalOpen, openAuthModal, closeAuthModal }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};