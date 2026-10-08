import { createContext, useContext, useState, useEffect } from 'react';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onAuthStateChanged,
  setPersistence,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../config/firebase';

const AuthContext = createContext();
const AUTH_SESSION_FLAG = 'shipguard_session_authenticated';
const AUTH_LAST_ACTIVITY_KEY = 'shipguard_last_activity_ms';
const AUTH_REDIRECT_PENDING_KEY = 'shipguard_google_redirect_pending';
const AUTH_REDIRECT_PENDING_AT_KEY = 'shipguard_google_redirect_pending_at';
const REDIRECT_PENDING_MAX_AGE_MS = 15 * 60 * 1000;
const SESSION_TIMEOUT_MINUTES = Math.min(1440, Math.max(15, Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES) || 1440));
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;
const DEFAULT_NOTIFICATIONS = { email: true, push: true, sms: false };
const DEFAULT_PREFERENCES = { riskThreshold: 60, slaWarningHours: 48, digestTime: '08:00' };
const DEFAULT_INTEGRATIONS = { weatherApiKey: '', mapsApiKey: '', newsApiKey: '' };
const ADMIN_EMAIL_WHITELIST = (
  import.meta.env.VITE_ADMIN_EMAILS || ''
).split(',').map(e => e.trim()).filter(Boolean);
const DEFAULT_ROLE = 'viewer';

// ═══ ISSUE #26: ADMIN WHITELIST LOGGING ═══
// Log admin configuration status for visibility
if (ADMIN_EMAIL_WHITELIST.length === 0) {
  console.warn('[Auth] VITE_ADMIN_EMAILS is empty or not configured. No admin users will be available.');
} else {
  console.log(`[Auth] Admin whitelist configured with ${ADMIN_EMAIL_WHITELIST.length} email(s): ${ADMIN_EMAIL_WHITELIST.join(', ')}`);
}

function isLikelyMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(String(navigator.userAgent || ''));
}

function isFirestoreOfflineError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code.includes('unavailable') ||
    message.includes('client is offline') ||
    message.includes('could not reach cloud firestore backend')
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  function formatAuthError(error, fallback = 'Authentication failed. Please try again.') {
    const code = String(error?.code || '').toLowerCase();
    if (!code) return fallback;
    if (code.includes('unauthorized-domain')) return 'Google sign-in failed: this domain is not authorized in Firebase Auth settings.';
    if (code.includes('operation-not-allowed')) return 'Google sign-in is not enabled in Firebase Authentication providers.';
    if (code.includes('network-request-failed')) return 'Network error while signing in. Check your internet connection and retry.';
    if (code.includes('popup-blocked')) return 'Popup was blocked by browser. Allow popups and try again.';
    if (code.includes('popup-closed-by-user')) return 'Sign-in popup was closed before completion. Please try again.';
    if (code.includes('account-exists-with-different-credential')) return 'An account already exists with the same email using another sign-in method.';
    return fallback;
  }

  function markActivity() {
    localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
  }

  function isSessionExpired() {
    const lastActivityRaw = localStorage.getItem(AUTH_LAST_ACTIVITY_KEY);
    const lastActivity = Number(lastActivityRaw || 0);
    if (!lastActivity || !Number.isFinite(lastActivity)) return false;
    return Date.now() - lastActivity > SESSION_TIMEOUT_MS;
  }

  function isRedirectPending() {
    if (localStorage.getItem(AUTH_REDIRECT_PENDING_KEY) !== '1') return false;
    const pendingAt = Number(localStorage.getItem(AUTH_REDIRECT_PENDING_AT_KEY) || 0);
    if (!Number.isFinite(pendingAt) || pendingAt <= 0) return false;
    const fresh = Date.now() - pendingAt <= REDIRECT_PENDING_MAX_AGE_MS;
    if (!fresh) {
      localStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
      localStorage.removeItem(AUTH_REDIRECT_PENDING_AT_KEY);
    }
    return fresh;
  }

  async function createUserDoc(user, extra = {}) {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName: user.displayName || '',
        email: user.email,
        photoURL: user.photoURL || null,
        role: extra.role || 'viewer',
        company: extra.company || '',
        notifications: DEFAULT_NOTIFICATIONS,
        preferences: DEFAULT_PREFERENCES,
        integrations: DEFAULT_INTEGRATIONS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
      });
    } else {
      const existing = snap.data();
      const patch = {};
      if (!existing.notifications) patch.notifications = DEFAULT_NOTIFICATIONS;
      if (!existing.preferences) patch.preferences = DEFAULT_PREFERENCES;
      if (!existing.integrations) patch.integrations = DEFAULT_INTEGRATIONS;

      // Always update lastActive on login
      patch.lastActive = serverTimestamp();
      patch.updatedAt = serverTimestamp();
      
      await updateDoc(ref, patch);
    }
    const updated = await getDoc(ref);
    setUserProfile({ id: updated.id, ...updated.data() });
  }

  async function signup(email, password, displayName, company, role) {
    setAuthError('');
    sessionStorage.setItem(AUTH_SESSION_FLAG, '1');
    
    // Validate admin role restriction
    if (role === 'admin' && !ADMIN_EMAIL_WHITELIST.includes(email)) {
      sessionStorage.removeItem(AUTH_SESSION_FLAG);
      const err = new Error('Only authorized emails can register as Administrator. Please contact support.');
      err.code = 'auth/unauthorized-admin';
      setAuthError(err.message);
      throw err;
    }
    
    // Auto-assign viewer role if not admin
    const finalRole = (role === 'admin' && ADMIN_EMAIL_WHITELIST.includes(email)) ? 'admin' : DEFAULT_ROLE;
    
    if (finalRole) {
      sessionStorage.setItem('shipguard_pending_role', finalRole);
    }
    markActivity();
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      await createUserDoc(cred.user, { displayName, company, role: finalRole });
      return cred;
    } catch (e) {
      setAuthError(formatAuthError(e, 'Failed to create account. Please try again.'));
      sessionStorage.removeItem(AUTH_SESSION_FLAG);
      sessionStorage.removeItem('shipguard_pending_role');
      throw e;
    }
  }

  async function login(email, password, role) {
    setAuthError('');
    sessionStorage.setItem(AUTH_SESSION_FLAG, '1');
    
    // Validate admin role restriction
    if (role === 'admin' && !ADMIN_EMAIL_WHITELIST.includes(email)) {
      sessionStorage.removeItem(AUTH_SESSION_FLAG);
      const err = new Error('Only authorized emails can sign in as Administrator. Please contact support.');
      err.code = 'auth/unauthorized-admin';
      setAuthError(err.message);
      throw err;
    }
    
    if (role) {
      sessionStorage.setItem('shipguard_pending_role', role);
    }
    markActivity();
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const ref = doc(db, 'users', cred.user.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const registeredRole = snap.data()?.role || DEFAULT_ROLE;
        if (role && registeredRole !== role) {
          await signOut(auth);
          sessionStorage.removeItem(AUTH_SESSION_FLAG);
          sessionStorage.removeItem('shipguard_pending_role');
          const err = new Error(`Access denied: Your account is registered as ${registeredRole}, but you selected ${role}.`);
          err.code = 'auth/role-mismatch';
          throw err;
        }
      } else {
        await createUserDoc(cred.user, { role: DEFAULT_ROLE });
      }
      return cred;
    } catch (e) {
      if (e.code === 'auth/role-mismatch') {
        setAuthError(e.message);
      } else if (e.code === 'auth/unauthorized-admin') {
        setAuthError(e.message);
      } else {
        setAuthError(formatAuthError(e, 'Failed to sign in. Please try again.'));
      }
      sessionStorage.removeItem(AUTH_SESSION_FLAG);
      sessionStorage.removeItem('shipguard_pending_role');
      throw e;
    }
  }

  async function loginWithGoogle(role) {
    setAuthError('');
    sessionStorage.setItem(AUTH_SESSION_FLAG, '1');
    localStorage.setItem(AUTH_REDIRECT_PENDING_KEY, '1');
    localStorage.setItem(AUTH_REDIRECT_PENDING_AT_KEY, String(Date.now()));
    
    // SECURITY: role parameter is IGNORED for Google OAuth
    // Role is ALWAYS determined by whitelist check below
    // This prevents users from bypassing the admin whitelist via OAuth
    if (role) {
      sessionStorage.setItem('shipguard_pending_role', role);
    }
    markActivity();

    // ═══ ISSUE #22: REMOVED DEAD CODE ═══
    // Removed: const useRedirectFlow = false;
    // Removed: if (!useRedirectFlow) { ... } - always uses popup, never uses redirect

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      localStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
      localStorage.removeItem(AUTH_REDIRECT_PENDING_AT_KEY);
        
        // SECURITY: Check if user requested admin role but is not whitelisted
        if (role === 'admin' && !ADMIN_EMAIL_WHITELIST.includes(cred.user.email)) {
          await signOut(auth);
          sessionStorage.removeItem(AUTH_SESSION_FLAG);
          sessionStorage.removeItem('shipguard_pending_role');
          const err = new Error('Admin access denied: Only authorized emails can sign in as Administrator. Please try again with a different account or contact support.');
          err.code = 'auth/unauthorized-admin';
          throw err;
        }
        
        // SECURITY: Role determination is WHITELIST-BASED, not user-selected
        // Only emails in ADMIN_EMAIL_WHITELIST can be admin
        // All other emails are automatically assigned 'viewer' role
        const finalRole = ADMIN_EMAIL_WHITELIST.includes(cred.user.email) ? 'admin' : DEFAULT_ROLE;
        
        const ref = doc(db, 'users', cred.user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          // User exists - ensure their role is correct based on whitelist
          const registeredRole = snap.data()?.role || DEFAULT_ROLE;
          // Always enforce whitelist, regardless of what role they selected
          if (registeredRole !== finalRole) {
            // Update their role to match whitelist
            await updateDoc(ref, { 
              role: finalRole,
              updatedAt: serverTimestamp()
            });
          }
        } else {
          // New user - create with correct role based on whitelist
          await createUserDoc(cred.user, { role: finalRole });
        }

        return { method: 'popup', user: cred.user };
    } catch (e) {
      if (e.code === 'auth/role-mismatch') {
        setAuthError(e.message);
      } else if (e.code === 'auth/unauthorized-admin') {
        setAuthError(e.message);
      } else {
        setAuthError(formatAuthError(e, 'Google sign-in failed. Please try again.'));
      }
      sessionStorage.removeItem(AUTH_SESSION_FLAG);
      sessionStorage.removeItem('shipguard_pending_role');
      sessionStorage.removeItem('shipguard_pending_admin_role');
      localStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
      localStorage.removeItem(AUTH_REDIRECT_PENDING_AT_KEY);
      throw e;
    }
  }

  function logout() {
    setUserProfile(null);
    sessionStorage.removeItem(AUTH_SESSION_FLAG);
    localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
    localStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
    localStorage.removeItem(AUTH_REDIRECT_PENDING_AT_KEY);
    return signOut(auth);
  }

  async function updateUserProfileData(data) {
    if (!currentUser) return;
    const ref = doc(db, 'users', currentUser.uid);
    await updateDoc(ref, data);
    const snap = await getDoc(ref);
    setUserProfile({ id: snap.id, ...snap.data() });
  }

  useEffect(() => {
    let unsub = () => {};

    const initializeAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (e) {
        console.error('Failed to set auth persistence:', e);
      }

      try {
        // Ensure redirect result is processed before auth state decisions.
        await getRedirectResult(auth);
      } catch (e) {
        setAuthError(formatAuthError(e, 'Google sign-in failed after redirect. Please try again.'));
        console.error('Failed to process Google redirect result:', e);
      }

      unsub = onAuthStateChanged(auth, async (user) => {
        const redirectPending = isRedirectPending();

        if (user && isSessionExpired()) {
          try {
            await signOut(auth);
          } catch (e) {
            console.error('Failed to sign out expired session:', e);
          }
          sessionStorage.removeItem(AUTH_SESSION_FLAG);
          localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
          setCurrentUser(null);
          setUserProfile(null);
          setLoading(false);
          return;
        }

        if (user) {
          try {
            const ref = doc(db, 'users', user.uid);
            const snap = await getDoc(ref);
            const pendingRole = sessionStorage.getItem('shipguard_pending_role');

            if (snap.exists()) {
              const registeredRole = snap.data()?.role || 'viewer';
              if (pendingRole && registeredRole !== pendingRole) {
                await signOut(auth);
                sessionStorage.removeItem(AUTH_SESSION_FLAG);
                sessionStorage.removeItem('shipguard_pending_role');
                setCurrentUser(null);
                setUserProfile(null);
                setAuthError(`Access denied: Your account is registered as ${registeredRole}, but you selected ${pendingRole}.`);
                setLoading(false);
                return;
              }
            } else {
              const roleToSet = pendingRole || DEFAULT_ROLE;
              await setDoc(ref, {
                displayName: user.displayName || '',
                email: user.email,
                photoURL: user.photoURL || null,
                role: roleToSet,
                company: '',
                notifications: DEFAULT_NOTIFICATIONS,
                preferences: DEFAULT_PREFERENCES,
                integrations: DEFAULT_INTEGRATIONS,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }

            setAuthError('');
            sessionStorage.setItem(AUTH_SESSION_FLAG, '1');
            if (redirectPending) {
              localStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
              localStorage.removeItem(AUTH_REDIRECT_PENDING_AT_KEY);
            }
            markActivity();

            await createUserDoc(user, pendingRole ? { role: pendingRole } : {});
            setCurrentUser(user);
            sessionStorage.removeItem('shipguard_pending_role');
          } catch (e) {
            if (isFirestoreOfflineError(e)) {
              setUserProfile((prev) =>
                prev || {
                  id: user.uid,
                  displayName: user.displayName || '',
                  email: user.email || '',
                  photoURL: user.photoURL || null,
                  role: DEFAULT_ROLE,
                  company: '',
                  notifications: DEFAULT_NOTIFICATIONS,
                  preferences: DEFAULT_PREFERENCES,
                  integrations: DEFAULT_INTEGRATIONS,
                }
              );
              setCurrentUser(user);
              console.warn('Firestore is offline; using temporary profile until reconnection.');
            } else {
              console.error('Failed to load user profile:', e);
              await signOut(auth);
              setCurrentUser(null);
              setUserProfile(null);
            }
          }
        } else {
          if (!redirectPending) {
            localStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
            localStorage.removeItem(AUTH_REDIRECT_PENDING_AT_KEY);
          }
          setCurrentUser(null);
          setUserProfile(null);
        }
        setLoading(false);
      });
    };

    initializeAuth();
    return () => unsub();
  }, []);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const onActivity = () => {
      if (currentUser) markActivity();
    };

    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;

    const timer = setInterval(async () => {
      if (!isSessionExpired()) return;
      try {
        await signOut(auth);
      } catch (e) {
        console.error('Failed to auto-signout expired session:', e);
      }
      sessionStorage.removeItem(AUTH_SESSION_FLAG);
      localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
      setCurrentUser(null);
      setUserProfile(null);
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;

    const tryReloadProfile = async () => {
      try {
        await createUserDoc(currentUser);
      } catch (e) {
        if (!isFirestoreOfflineError(e)) {
          console.error('Failed to refresh user profile after reconnect:', e);
        }
      }
    };

    window.addEventListener('online', tryReloadProfile);
    return () => window.removeEventListener('online', tryReloadProfile);
  }, [currentUser]);

  const value = {
    currentUser,
    userProfile,
    loading,
    authError,
    signup,
    login,
    loginWithGoogle,
    logout,
    updateUserProfile: updateUserProfileData,
    clearAuthError: () => setAuthError(''),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
