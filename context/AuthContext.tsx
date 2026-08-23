
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from '../types';
import { db } from '../services/db';
import { evaluateUnlockedTitles } from '../utils/titleUtils';

interface AuthContextType {
  user: User | null;
  isVip: boolean;
  login: (credentials: { email: string; password: string }) => Promise<boolean>;
  loginWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  register: (data: { name: string; email: string; password: string }) => Promise<{ success: boolean; message?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => Promise<boolean>;
  unlockTitle: (titleId: string) => Promise<void>;
  activateVip: (days: number) => Promise<boolean>;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isPremiumModalOpen: boolean;
  premiumModalFeature: string | null;
  openPremiumModal: (featureTitle?: string) => void;
  closePremiumModal: () => void;
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
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumModalFeature, setPremiumModalFeature] = useState<string | null>(null);

  // Compute isVip reactively
  const isVip = Boolean(
    user?.isPremium &&
    (!user.premiumUntil || new Date(user.premiumUntil).getTime() > Date.now())
  );

  useEffect(() => {
    const handleOpenPremiumModal = (e: any) => {
      const feature = e?.detail?.feature || null;
      setPremiumModalFeature(feature);
      setIsPremiumModalOpen(true);
    };
    window.addEventListener('open_premium_modal', handleOpenPremiumModal);
    return () => {
      window.removeEventListener('open_premium_modal', handleOpenPremiumModal);
    };
  }, []);

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
      return await db.loginWithGoogle();
    } catch (e: any) {
      console.error(e);
      return { success: false, message: e?.message || 'Ошибка входа через Google' };
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

  const unlockTitle = async (titleId: string) => {
    if (!user?.email) return;
    const currentUnlocked = user.unlockedPrefixes || ['newgen'];
    if (!currentUnlocked.includes(titleId)) {
      const updatedUnlocked = [...currentUnlocked, titleId];
      await updateProfile({ unlockedPrefixes: updatedUnlocked });
    }
  };

  // Auto-evaluate unlocked titles whenever user state or criteria changes
  useEffect(() => {
    if (user?.email) {
      const evaluated = evaluateUnlockedTitles(user);
      const currentUnlocked = user.unlockedPrefixes || ['newgen'];
      const hasNewTitles = evaluated.some(id => !currentUnlocked.includes(id));
      if (hasNewTitles) {
        updateProfile({ unlockedPrefixes: evaluated });
      }
    }
  }, [user?.email, user?.isPremium, user?.watchedAnimeIds, user?.createdAt, user?.episodesWatched]);

  const activateVip = async (days: number) => {
    if (!user?.email) return false;
    try {
      const updatedUser = await db.activateVip(user.email, days);
      if (updatedUser) {
        // Unlock premium titles ('first_aid' and 'custom')
        const currentUnlocked = updatedUser.unlockedPrefixes || ['newgen'];
        const newUnlocked = Array.from(new Set([...currentUnlocked, 'first_aid', 'custom']));
        const finalUser = await db.updateProfile(user.email, { unlockedPrefixes: newUnlocked });
        setUser(finalUser || updatedUser);
        return true;
      }
    } catch (e) {
      console.error("activateVip error:", e);
    }
    return false;
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const openPremiumModal = (featureTitle?: string) => {
    setPremiumModalFeature(featureTitle || null);
    setIsPremiumModalOpen(true);
  };
  const closePremiumModal = () => {
    setIsPremiumModalOpen(false);
    setPremiumModalFeature(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isVip,
        login,
        loginWithGoogle,
        register,
        resetPassword,
        logout,
        updateProfile,
        unlockTitle,
        activateVip,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        isPremiumModalOpen,
        premiumModalFeature,
        openPremiumModal,
        closePremiumModal,
      }}
    >
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