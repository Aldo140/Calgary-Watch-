import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { isApprovedAdminEmail } from '@/src/constants/admin';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthReady: boolean;
  isAdmin: boolean;
  /** Build has VITE_FIREBASE_* vars (CI secrets or local .env). */
  isFirebaseConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      setIsAuthReady(true);
      return;
    }

    void setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error('Failed to set auth persistence:', error);
    });

    // Explicitly resolve redirect results so redirect flow finalizes cleanly.
    void getRedirectResult(auth).catch((error) => {
      console.error('Redirect sign-in result error:', error);
    });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const isApprovedAdmin = isApprovedAdminEmail(currentUser.email);
        if (!db) {
          console.error("Firestore is not initialized.");
          return;
        }
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const role = isApprovedAdmin ? 'admin' : 'user';
          await setDoc(
            userRef,
            {
              uid: currentUser.uid,
              displayName: currentUser.displayName || 'Anonymous',
              email: currentUser.email || '',
              photoURL: currentUser.photoURL || '',
              role,
            },
            { merge: true }
          );
        } catch (error: unknown) {
          const code = error instanceof Error ? (error as { code?: string }).code : undefined;
          if (code === 'unavailable') {
            console.warn('Firestore temporarily unavailable while syncing user profile. Retrying automatically when connectivity is restored.');
          } else {
            console.error('Error syncing user profile:', error);
          }
        }
        setIsAdmin(isApprovedAdmin);
      } else {
        setIsAdmin(false);
      }
      setUser(currentUser);
      setLoading(false);
      setIsAuthReady(true);
      setIsSigningIn(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    if (!auth) {
      console.warn(
        'Sign-in unavailable: Firebase env vars were not set at build time. See README / GitHub Actions secrets.'
      );
      return;
    }
    if (isSigningIn) return;

    setIsSigningIn(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      const code = (error instanceof Error ? (error as { code?: string }).code : undefined) ?? '';
      const shouldFallbackToRedirect = [
        'auth/popup-blocked',
        'auth/operation-not-supported-in-this-environment',
      ].includes(code);

      if (shouldFallbackToRedirect) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          console.error('Sign in redirect error:', redirectError);
        }
      }

      if (code === 'auth/unauthorized-domain') {
        console.error('Sign in failed: current domain is not authorized in Firebase Authentication settings.');
      }

      console.error('Sign in error:', error);
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        logout,
        isAuthReady,
        isAdmin,
        isFirebaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context;
}
