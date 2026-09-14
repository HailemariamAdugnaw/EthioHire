
/**
 * EthioHire — Client-side authentication
 *
 * Works in two modes (detected at runtime from /api/auth/config):
 *  - FIREBASE: real Firebase Authentication (Email/Password + Google),
 *    API calls carry `Authorization: Bearer <idToken>`.
 *  - DEMO: local session cookie issued by /api/auth/demo-login, so the whole
 *    platform can be evaluated without a Firebase project.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "@/hooks/use-toast";

export type Role = "ADMIN" | "RECRUITER" | "CANDIDATE";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthConfig {
  mode: "FIREBASE" | "DEMO";
}

// ---- module-level auth state (mode + firebase app) ----

let cachedMode: AuthConfig["mode"] | null = null;
type FirebaseBundle = {
  app: import("firebase/app").FirebaseApp;
  auth: import("firebase/auth").Auth;
};
let firebaseAppPromise: Promise<FirebaseBundle> | null = null;
let currentIdToken: string | null = null;

// Demo-mode session token fallback (localStorage). Used when cookies are
// unavailable (strict third-party-cookie blocking inside embedded previews).
const SESSION_TOKEN_KEY = "eh_session_token";
let currentSessionToken: string | null = null;
if (typeof window !== "undefined") {
  try {
    currentSessionToken = window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    currentSessionToken = null;
  }
}

function storeSessionToken(token: string | null) {
  currentSessionToken = token;
  try {
    if (token) window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    else window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

/**
 * Fired globally whenever an API call returns 401 so the AuthProvider can
 * reset to the login screen gracefully instead of letting portals crash with
 * an unhandled "Authentication required" error.
 */
export const AUTH_UNAUTHORIZED_EVENT = "eh:unauthorized";

function notifyUnauthorized() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
  }
}

export async function getAuthMode(): Promise<AuthConfig["mode"]> {
  if (cachedMode) return cachedMode;
  const res = await fetch("/api/auth/config");
  const data = await res.json();
  cachedMode = data.mode === "FIREBASE" ? "FIREBASE" : "DEMO";
  return cachedMode;
}

async function getFirebase() {
  if (!firebaseAppPromise) {
    firebaseAppPromise = (async () => {
      const cfgRes = await fetch("/api/auth/config");
      const cfg = await cfgRes.json();
      const { initializeApp, getApps, getApp } = await import("firebase/app");
      const { getAuth } = await import("firebase/auth");
      const app = getApps().length ? getApp() : initializeApp(cfg.firebase);
      return { app, auth: getAuth(app) };
    })();
  }
  return firebaseAppPromise;
}

// ---- low-level fetch wrapper ----

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (currentIdToken) headers.set("Authorization", `Bearer ${currentIdToken}`);
  if (currentSessionToken) headers.set("X-Session-Token", currentSessionToken);
  const res = await fetch(url, { ...options, headers, credentials: "include" });
  return res;
}

export async function apiJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Session expired / missing — tell the app so it can fall back to the
    // sign-in view instead of throwing an unrecoverable runtime error.
    if (res.status === 401) notifyUnauthorized();
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

// ---- sign in / sign up / sign out ----

/**
 * POST /api/auth/firebase-sync — provision/refresh the local database row for
 * a verified Firebase identity and return the unified AuthUser. The endpoint
 * answers `{ user: { id, email, name, role } }`; anything else (error JSON,
 * missing user) is surfaced as a thrown Error so the UI shows a readable
 * message instead of crashing later on `undefined.name`.
 */
async function syncFirebaseUser(body: Record<string, unknown>): Promise<AuthUser> {
  const res = await apiFetch("/api/auth/firebase-sync", { method: "POST", body: JSON.stringify(body) });
  const payload = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string };
  if (!res.ok || !payload?.user) {
    throw new Error(payload?.error || "Could not link your Firebase account to EthioHire. Please try again.");
  }
  return payload.user;
}

/**
 * Google sign-in with a resilient resolver: the popup flow is preferred, but
 * browsers/environments that enforce Cross-Origin-Opener-Policy (embedded
 * previews, some SSO setups) isolate the popup from its opener, which breaks
 * Firebase's window.closed polling ("Cross-Origin-Opener-Policy policy would
 * block the window.closed call"). For those cases fall back to the full-page
 * redirect flow; the session is restored automatically after returning.
 */
const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-failed-to-open",
  "auth/operation-not-supported-in-this-environment",
  "auth/cordova-not-ready",
]);

async function signInWithGoogleResolver(
  auth: import("firebase/auth").Auth,
  provider: import("firebase/auth").GoogleAuthProvider,
): Promise<import("firebase/auth").UserCredential> {
  const { signInWithPopup, signInWithRedirect } = await import("firebase/auth");
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string })?.code || "";
    if (!POPUP_FALLBACK_CODES.has(code)) throw err;
    await signInWithRedirect(auth, provider);
    throw new Error("Opening Google sign-in…");
  }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const mode = await getAuthMode();
  if (mode === "FIREBASE") {
    const { auth } = await getFirebase();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const cred = await signInWithEmailAndPassword(auth, email, password);
    currentIdToken = await cred.user.getIdToken();
    return await syncFirebaseUser({ email, name: cred.user.displayName || "" });
  }
  const res = await fetch("/api/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Sign-in failed");
  if (data.sessionToken) storeSessionToken(data.sessionToken);
  return data.user as AuthUser;
}

export async function signUp(email: string, password: string, name: string, role: Role): Promise<AuthUser> {
  const mode = await getAuthMode();
  if (mode === "FIREBASE") {
    const { auth } = await getFirebase();
    const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await updateProfile(cred.user, { displayName: name });
    } catch {
      /* cosmetic only — never block registration on a profile update hiccup */
    }
    currentIdToken = await cred.user.getIdToken();
    return await syncFirebaseUser({ email, name, role });
  }
  const res = await fetch("/api/auth/demo-register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role }),
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Registration failed");
  if (data.sessionToken) storeSessionToken(data.sessionToken);
  return data.user as AuthUser;
}

export async function signInWithGoogle(): Promise<AuthUser> {
  const mode = await getAuthMode();
  if (mode !== "FIREBASE") throw new Error("Google sign-in requires Firebase to be configured.");
  const { auth } = await getFirebase();
  const { GoogleAuthProvider } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  const cred = await signInWithGoogleResolver(auth, provider);
  currentIdToken = await cred.user.getIdToken();
  return await syncFirebaseUser({
    email: cred.user.email || "",
    name: cred.user.displayName || "",
    role: "CANDIDATE",
  });
}

/**
 * After a Google REDIRECT sign-in (or a page reload with a persisted Firebase
 * session) the local database row may not exist yet — /api/auth/me answers
 * 401 until firebase-sync provisions it. Self-heal by syncing once; a no-op
 * when the visitor is actually signed out.
 */
export async function ensureFirebaseSynced(): Promise<AuthUser | null> {
  const mode = await getAuthMode();
  if (mode !== "FIREBASE") return null;
  const { auth } = await getFirebase();
  const { getRedirectResult } = await import("firebase/auth");
  await getRedirectResult(auth).catch(() => null);
  if (!auth.currentUser) return null;
  currentIdToken = await auth.currentUser.getIdToken();
  return await syncFirebaseUser({
    email: auth.currentUser.email || "",
    name: auth.currentUser.displayName || "",
    role: "CANDIDATE",
  });
}

export async function signOutUser(): Promise<void> {
  const mode = await getAuthMode();
  if (mode === "FIREBASE") {
    try {
      const { auth } = await getFirebase();
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch {
      /* ignore */
    }
    currentIdToken = null;
    return;
  }
  await fetch("/api/auth/demo-logout", { method: "POST", credentials: "include" });
  storeSessionToken(null);
}

/**
 * In FIREBASE mode, wait for the Firebase SDK to restore the persisted
 * session after a page reload, then refresh the ID token so API calls carry
 * a valid Bearer header. Resolves without a token in DEMO mode.
 */
async function restoreFirebaseSession(): Promise<void> {
  const mode = await getAuthMode();
  if (mode !== "FIREBASE") return;
  const { auth } = await getFirebase();
  const { onAuthStateChanged } = await import("firebase/auth");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 4000); // never hang the boot sequence
    const unsub = onAuthStateChanged(auth, () => {
      clearTimeout(timeout);
      unsub();
      resolve();
    });
  });
  if (auth.currentUser) {
    currentIdToken = await auth.currentUser.getIdToken();
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.user as AuthUser) || null;
}

// ---- React context ----

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  mode: AuthConfig["mode"] | null;
  refresh: () => Promise<void>;
  login: typeof signIn;
  register: typeof signUp;
  loginGoogle: typeof signInWithGoogle;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthConfig["mode"] | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Restore any persisted Firebase session first so /api/auth/me can
      // verify the Bearer token (page-reload case in FIREBASE mode).
      await restoreFirebaseSession().catch(() => undefined);
      const m = await getAuthMode();
      setMode(m);
      let u = await fetchCurrentUser();
      if (!u && m === "FIREBASE") {
        // Google redirect returns / brand-new Firebase identities have no
        // local row yet — provision it now (no-op when signed out).
        u = await ensureFirebaseSynced().catch(() => null);
      }
      setUser(u);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auth-mode visibility lives in the developer console only — production UI
  // must not advertise infrastructure details to end users.
  useEffect(() => {
    if (!mode) return;
    console.info(
      mode === "FIREBASE"
        ? "[EthioHire] Firebase Authentication active — Email/Password & Google; sessions verified server-side with the Admin SDK."
        : "[EthioHire] Demo authentication mode — set FIREBASE_SERVICE_ACCOUNT_JSON in .env to activate Firebase Authentication (see docs/FIREBASE_SETUP.md).",
    );
  }, [mode]);

  // Central 401 handler: any apiJson() that hits an expired/missing session
  // resets the app to the signed-out state (routers then show the login view).
  useEffect(() => {
    const onUnauthorized = () => {
      currentIdToken = null;
      storeSessionToken(null);
      setUser((prev) => {
        if (prev) toast({ title: "Session expired", description: "Please sign in to continue.", variant: "destructive" });
        return null;
      });
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      mode,
      refresh,
      login: async (email, password) => {
        const u = await signIn(email, password);
        setUser(u);
        return u;
      },
      register: async (email, password, name, role) => {
        const u = await signUp(email, password, name, role);
        setUser(u);
        return u;
      },
      loginGoogle: async () => {
        const u = await signInWithGoogle();
        setUser(u);
        return u;
      },
      logout: async () => {
        await signOutUser();
        setUser(null);
      },
    }),
    [user, loading, mode, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
