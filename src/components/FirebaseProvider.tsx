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
import { doc, getDoc, setDoc } from 'firebase/firestore';
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

/**
 * Mirror the signed-in user into the `users` collection.
 *
 * Runs in the background after auth state is published. Never block rendering
 * or data subscriptions on this — it is bookkeeping, not something the UI reads
 * before it can show the map.
 */
async function syncUserProfile(currentUser: User, isApprovedAdmin: boolean): Promise<void> {
  if (!db) return;
  const userRef = doc(db, 'users', currentUser.uid);
  try {
    const existing = await getDoc(userRef);
    await setDoc(
      userRef,
      {
        uid: currentUser.uid,
        displayName: currentUser.displayName || 'Anonymous',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
        role: isApprovedAdmin ? 'admin' : 'user',
        ...(existing.exists() && existing.data()?.createdAt ? {} : {
          createdAt: currentUser.metadata.creationTime
            ? new Date(currentUser.metadata.creationTime).getTime()
            : Date.now(),
        }),
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
}

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

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const isApprovedAdmin = currentUser ? isApprovedAdminEmail(currentUser.email) : false;

      // Publish auth state IMMEDIATELY.
      //
      // This used to happen only after awaiting a getDoc + setDoc profile sync.
      // Because the incidents listener in MapPage is gated on isAuthReady, that
      // made the whole map wait on two Firestore round-trips for signed-in
      // users — and since Firestore retries a stalled request indefinitely
      // rather than throwing, a flaky mobile connection could leave
      // isAuthReady false forever and incidents would never load at all.
      setIsAdmin(isApprovedAdmin);
      setUser(currentUser);
      setLoading(false);
      setIsAuthReady(true);
      setIsSigningIn(false);

      // Profile sync is best-effort and deliberately not awaited — nothing the
      // user sees depends on it completing.
      if (currentUser && db) {
        void syncUserProfile(currentUser, isApprovedAdmin);
      }
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
