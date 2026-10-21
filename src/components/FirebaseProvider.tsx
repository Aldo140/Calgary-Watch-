import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, updateProfile, reload, signOut
} from 'firebase/auth';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { isApprovedAdminEmail } from '@/src/constants/admin';
import { AuthDialog } from './auth/AuthDialog';
import { continueUriRefused, rememberSignIn, returnLink, syncVerifiedToken, type AuthRequest } from '../lib/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Opens the sign-in dialog and resolves once someone is signed in or the dialog is closed. */
  signIn: (request?: AuthRequest) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  /** Opens the dialog's verify screen for a signed-in account that hasn't verified yet. */
  openVerification: () => void;
  refreshCurrentUser: () => Promise<User | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthReady: boolean;
  isAdmin: boolean;
  isEmailVerified: boolean;
  isSigningIn: boolean;
  isAuthActionLoading: boolean;
  /** The sign-in dialog is showing, so other account prompts stay out of its way. */
  isAuthDialogOpen: boolean;
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
        emailVerified: currentUser.emailVerified,
        authProviders: currentUser.providerData.map(provider => provider.providerId),
        updatedAt: Date.now(),
        role: isApprovedAdmin || existing.data()?.role === 'admin' ? 'admin' : 'user',
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
  const [authOpen, setAuthOpen] = useState(false);
  const [authRequest, setAuthRequest] = useState<AuthRequest>({});
  const [, setAuthRevision] = useState(0);
  const pendingAuth = useRef<(() => void) | null>(null);

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

    let stopRole:(()=>void)|undefined;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const isApprovedAdmin = currentUser ? currentUser.emailVerified && isApprovedAdminEmail(currentUser.email) : false;

      // Publish auth state IMMEDIATELY.
      //
      // This used to happen only after awaiting a getDoc + setDoc profile sync.
      // Because the incidents listener in MapPage is gated on isAuthReady, that
      // made the whole map wait on two Firestore round-trips for signed-in
      // users — and since Firestore retries a stalled request indefinitely
      // rather than throwing, a flaky mobile connection could leave
      // isAuthReady false forever and incidents would never load at all.
      stopRole?.();
      stopRole=undefined;
      setIsAdmin(isApprovedAdmin);
      if(currentUser)stopRole=onSnapshot(doc(db!, 'users', currentUser.uid),snapshot=>{if(auth?.currentUser?.uid===currentUser.uid)setIsAdmin(isApprovedAdmin||currentUser.emailVerified&&snapshot.data()?.role==='admin');},()=>{if(auth?.currentUser?.uid===currentUser.uid)setIsAdmin(isApprovedAdmin);});
      setUser(currentUser);
      if (currentUser?.emailVerified) setAuthOpen(false);
      setLoading(false);
      setIsAuthReady(true);
      setIsSigningIn(false);
      if (currentUser) pendingAuth.current?.();

      // Profile sync is best-effort and deliberately not awaited — nothing the
      // user sees depends on it completing.
      // Remember how this browser signs in, so the dialog can steer the next visit to the same method.
      if (currentUser) rememberSignIn(currentUser.providerData.some(p => p.providerId === 'google.com') ? { method: 'google' } : { method: 'email', email: currentUser.email ?? undefined });
      if (currentUser) void syncVerifiedToken(currentUser).catch(error => console.error('Token refresh error:', error));
      if (currentUser && db) {
        void syncUserProfile(currentUser, isApprovedAdmin);
      }
    });

    return () => {unsubscribe();stopRole?.();};
  }, []);

  const requireAuth = async (request: AuthRequest = {}) => {
    if (auth?.currentUser) return;
    // Guard against an event object when signIn is passed straight to onClick.
    const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
    setAuthRequest({ mode: request?.mode, email: text(request?.email), title: text(request?.title), intro: text(request?.intro) });
    setAuthOpen(true);
    await new Promise<void>(resolve => { pendingAuth.current = resolve; });
    pendingAuth.current = null;
  };

  const signInWithGoogleAccount = async () => {
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
      throw error;
    }
  };

  const withAuthAction = async <T,>(action: () => Promise<T>): Promise<T> => {
    if (!auth) throw new Error('Firebase is not configured.');
    if (isSigningIn) throw new Error('An authentication action is already running.');
    setIsSigningIn(true);
    try { return await action(); } finally { setIsSigningIn(false); }
  };
  const sendVerificationTo = async (account: User) => {
    const settings = returnLink(window.location.href);
    try { await sendEmailVerification(account, settings); }
    catch (error) { if (!settings || !continueUriRefused(error)) throw error; await sendEmailVerification(account); }
  };
  const signUpWithEmail = (email: string, password: string, displayName?: string) => withAuthAction(async () => {
    const credential = await createUserWithEmailAndPassword(auth!, email, password);
    if (displayName) await updateProfile(credential.user, { displayName }).catch(error => console.error('Display name error:', error));
    // The account exists now; a failed email is offered again from the verify screen.
    await sendVerificationTo(credential.user).catch(error => console.error('Verification email error:', error));
    setUser(credential.user);
    void syncUserProfile(credential.user, false);
  });
  const signInWithEmailAccount = (email: string, password: string) => withAuthAction(async () => {
    await signInWithEmailAndPassword(auth!, email, password);
  });
  const sendVerificationEmail = () => withAuthAction(async () => {
    if (!auth?.currentUser) throw new Error('Sign in before requesting verification.');
    await sendVerificationTo(auth.currentUser);
  });
  const refreshCurrentUser = () => withAuthAction(async () => {
    if (!auth?.currentUser) return null;
    await reload(auth.currentUser);
    const refreshed = auth.currentUser;
    if (refreshed) await syncVerifiedToken(refreshed);
    setUser(refreshed);
    setAuthRevision(value => value + 1);
    if (refreshed) void syncUserProfile(refreshed, refreshed.emailVerified && isApprovedAdminEmail(refreshed.email));
    return refreshed;
  });
  const sendPasswordReset = (email: string) => withAuthAction(async () => {
    const settings = returnLink(window.location.href);
    try { await sendPasswordResetEmail(auth!, email, settings); }
    catch (error) {
      const code = error instanceof Error ? (error as Error & { code?: string }).code : '';
      if (settings && continueUriRefused(error)) { await sendPasswordResetEmail(auth!, email).catch(retry => { if ((retry as { code?: string }).code !== 'auth/user-not-found') throw retry; }); return; }
      if (code !== 'auth/user-not-found') throw error;
    }
  });

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
        signIn: requireAuth,
        signInWithGoogle: signInWithGoogleAccount,
        signUpWithEmail,
        signInWithEmail: signInWithEmailAccount,
        sendVerificationEmail,
        openVerification: () => { if (auth?.currentUser && !auth.currentUser.emailVerified) { setAuthRequest({}); setAuthOpen(true); } },
        refreshCurrentUser,
        sendPasswordReset,
        logout,
        isAuthReady,
        isAdmin,
        isEmailVerified: Boolean(user?.emailVerified),
        isSigningIn,
        isAuthActionLoading: isSigningIn,
        isAuthDialogOpen: authOpen,
        isFirebaseConfigured,
      }}
    >
      {children}
      <AuthDialog open={authOpen} request={authRequest} user={user} busy={isSigningIn} onClose={() => { setAuthOpen(false); pendingAuth.current?.(); pendingAuth.current=null; }} onGoogle={signInWithGoogleAccount} onSignIn={signInWithEmailAccount} onSignUp={signUpWithEmail} onReset={sendPasswordReset} onResend={sendVerificationEmail} onRefresh={refreshCurrentUser} onLogout={logout} />
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
