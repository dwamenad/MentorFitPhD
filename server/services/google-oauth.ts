import { fetchJsonWithPolicy } from './http';
import { getAppUrl } from './auth';

type GoogleTokenResponse = {
  access_token: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
};

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function isGoogleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleCallbackUrl() {
  return new URL('/auth/google/callback', getAppUrl()).toString();
}

export function buildGoogleAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error('Google OAuth is not configured.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured.');
  }

  const token = await fetchJsonWithPolicy<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleCallbackUrl(),
      grant_type: 'authorization_code',
    }).toString(),
  });

  const profile = await fetchJsonWithPolicy<GoogleUserInfo>(GOOGLE_USERINFO_URL, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
    },
  });

  if (!profile.email || !profile.sub || !profile.email_verified) {
    throw new Error('Google account email could not be verified.');
  }

  return {
    email: profile.email,
    googleSubject: profile.sub,
    name: profile.name?.trim() || profile.email.split('@')[0],
  };
}
