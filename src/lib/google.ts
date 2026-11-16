import { appUrl } from "./notify";

/** Google sign-in is switched on by setting GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. */
export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const googleRedirectUri = () => appUrl("/api/auth/google/callback");
export const GOOGLE_STATE_COOKIE = "g_oauth";
