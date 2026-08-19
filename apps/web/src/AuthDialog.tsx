// Copyright (c) 2026 Casual Office
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import {
  AuthService,
  DeviceInfo,
  EntitlementInfo,
  UserPlanInfo,
} from '@casualoffice/pdf/auth';

export interface AuthDialogProps {
  isOpen: boolean;
  isMandatory?: boolean;
  onClose?: () => void;
  onAuthenticated?: (user: UserPlanInfo, entitlement: EntitlementInfo) => void;
  authService: AuthService;
}

export type LoginState =
  | 'idle'
  | 'starting'
  | 'opening_browser'
  | 'waiting_confirmation'
  | 'verifying_device'
  | 'signed_in'
  | 'rate_limited'
  | 'upgrade_required'
  | 'device_limit_reached'
  | 'ip_reauth_required'
  | 'device_revoked'
  | 'error';

export function AuthDialog({ isOpen, isMandatory, onClose, onAuthenticated, authService }: AuthDialogProps) {
  const [state, setState] = useState<LoginState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<UserPlanInfo | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementInfo | null>(null);
  const [activeDevices, setActiveDevices] = useState<DeviceInfo[]>([]);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);

  // Deep-link listener (Tauri or DOM custom event / URL params)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check startup URL or hash
    const handleUrl = async (urlStr: string) => {
      if (urlStr.includes('cookapps-cpdf://auth')) {
        setState('verifying_device');
        setErrorMessage(null);
        const res = await authService.handleCallbackUrl(urlStr);
        if (res.success && res.data?.authenticated && res.data.user && res.data.entitlement) {
          setUser(res.data.user);
          setEntitlement(res.data.entitlement);
          setState('signed_in');
          if (onAuthenticated) onAuthenticated(res.data.user, res.data.entitlement);
        } else {
          if (res.data?.errorCode === 'UPGRADE_REQUIRED') {
            setEntitlement(res.data.entitlement || null);
            setState('upgrade_required');
          } else if (res.data?.errorCode === 'DEVICE_LIMIT_REACHED') {
            setActiveDevices(res.data.activeDevices || []);
            setState('device_limit_reached');
          } else if (res.data?.errorCode === 'IP_REAUTH_REQUIRED') {
            setState('ip_reauth_required');
          } else if (res.data?.errorCode === 'DEVICE_REVOKED') {
            setState('device_revoked');
          } else {
            setErrorMessage(res.error || res.data?.error || 'Authentication failed');
            setState('error');
          }
        }
      }
    };

    // Listen for custom deep link event from desk bridge (DOM)
    const domListener = (e: CustomEvent<{ url?: string }>) => {
      if (e.detail?.url) {
        void handleUrl(e.detail.url);
      }
    };
    window.addEventListener('cpdf:deeplink' as any, domListener);

    return () => {
      window.removeEventListener('cpdf:deeplink' as any, domListener);
    };
  }, [authService, onAuthenticated]);

  if (!isOpen) return null;

  const openExternalUrl = async (url: string) => {
    if (typeof window === 'undefined' || !url) return;
    const tauri = (window as any).__TAURI__;
    if (tauri?.opener?.openUrl) {
      try {
        await tauri.opener.openUrl(url);
        return;
      } catch {
        /* fallback */
      }
    }
    if (tauri?.core?.invoke) {
      try {
        await tauri.core.invoke('plugin:opener|open_url', { value: url });
        return;
      } catch {
        /* fallback */
      }
    }
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleStartLogin = async () => {
    setState('starting');
    setErrorMessage(null);

    const res = await authService.startLogin();

    if (!res.success) {
      if (res.errorCode === 'RATE_LIMITED') {
        setState('rate_limited');
        setErrorMessage('Too many requests. Please wait 1 minute before retrying.');
      } else {
        setState('error');
        setErrorMessage(res.error || 'Failed to start authentication');
      }
      return;
    }

    setLoginUrl(res.loginUrl);
    setState('opening_browser');

    await openExternalUrl(res.loginUrl);

    setState('waiting_confirmation');
  };

  return (
    <div className="cpdf-dialog-backdrop" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: 'var(--font-sans, system-ui, sans-serif)'
    }}>
      <div className="cpdf-dialog-card" style={{
        backgroundColor: 'var(--surface-color, #ffffff)',
        color: 'var(--text-color, #1a1a1a)',
        borderRadius: '12px',
        padding: '24px 32px',
        maxWidth: '460px',
        width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        border: '2px solid var(--border-color, #000000)',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>
            CPDF Account Sign-In
          </h2>
          {!isMandatory && onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#666',
                padding: '0 4px'
              }}
              aria-label="Close dialog"
            >
              ✕
            </button>
          )}
        </div>

        {state === 'idle' && (
          <div>
            <p style={{ fontSize: '14px', color: '#555', marginBottom: '20px' }}>
              Sign in with your CookApps Account to access CPDF desktop capabilities and synchronized plan features.
            </p>
            <button
              onClick={handleStartLogin}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#7c2d12',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '15px',
                cursor: 'pointer'
              }}
            >
              Login by CookApps Account
            </button>
          </div>
        )}

        {state === 'starting' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p>Initializing secure device key and PKCE session...</p>
          </div>
        )}

        {state === 'opening_browser' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontWeight: 600 }}>Opening CookApps...</p>
          </div>
        )}

        {state === 'waiting_confirmation' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontWeight: 600, color: '#2563eb' }}>Waiting for confirmation...</p>
            <p style={{ fontSize: '13px', color: '#666' }}>
              Please complete login in your system browser. This window will automatically sign in once confirmed.
            </p>
            {loginUrl && (
              <button
                onClick={() => void openExternalUrl(loginUrl)}
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid #2563eb',
                  color: '#2563eb',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Re-open browser login
              </button>
            )}
          </div>
        )}

        {state === 'verifying_device' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontWeight: 600, color: '#2563eb' }}>Verifying device...</p>
          </div>
        )}

        {state === 'signed_in' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <h3 style={{ color: '#16a34a', margin: '0 0 8px 0' }}>Signed in</h3>
            <p style={{ fontSize: '14px' }}>Welcome back, <strong>{user?.name || user?.email}</strong>!</p>
            <p style={{ fontSize: '12px', color: '#666' }}>Plan: {user?.planCode}</p>
            {onClose && (
              <button
                onClick={onClose}
                style={{
                  marginTop: '16px',
                  padding: '8px 24px',
                  backgroundColor: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Continue to CPDF
              </button>
            )}
          </div>
        )}

        {state === 'rate_limited' && (
          <div style={{ padding: '12px 0' }}>
            <p style={{ color: '#dc2626', fontWeight: 600 }}>Rate Limited (429)</p>
            <p style={{ fontSize: '13px' }}>{errorMessage}</p>
            <button
              onClick={handleStartLogin}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Retry Login
            </button>
          </div>
        )}

        {state === 'upgrade_required' && (
          <div style={{ padding: '12px 0' }}>
            <h3 style={{ color: '#d97706', margin: '0 0 8px 0' }}>Subscription Upgrade Required</h3>
            <p style={{ fontSize: '14px' }}>
              {entitlement?.reason || 'CPDF requires an active Personal or Family plan subscription.'}
            </p>
            {entitlement?.checkoutUrl ? (
              <a
                href={entitlement.checkoutUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: '12px',
                  padding: '10px 20px',
                  backgroundColor: '#d97706',
                  color: '#fff',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                Upgrade Subscription
              </a>
            ) : (
              <a
                href={`${authService.getBaseUrl()}/account`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: '12px',
                  padding: '10px 20px',
                  backgroundColor: '#d97706',
                  color: '#fff',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                Visit CookApps Website
              </a>
            )}
          </div>
        )}

        {state === 'device_limit_reached' && (
          <div style={{ padding: '12px 0' }}>
            <h3 style={{ color: '#dc2626', margin: '0 0 8px 0' }}>Device Limit Reached</h3>
            <p style={{ fontSize: '13px' }}>
              Your plan limit for active desktop devices has been reached. Please manage active devices on the CookApps website to sign in on this device.
            </p>
            {activeDevices.length > 0 && (
              <div style={{ marginTop: '10px', fontSize: '12px', backgroundColor: '#f3f4f6', padding: '8px', borderRadius: '4px' }}>
                <p style={{ fontWeight: 600, margin: '0 0 4px 0' }}>Active Devices:</p>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {activeDevices.map((d) => (
                    <li key={d.id}>{d.name} ({d.platform})</li>
                  ))}
                </ul>
              </div>
            )}
            <a
              href={`${authService.getBaseUrl()}/account/devices`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: '#fff',
                borderRadius: '4px',
                textDecoration: 'none'
              }}
            >
              Manage Devices on Website
            </a>
          </div>
        )}

        {state === 'ip_reauth_required' && (
          <div style={{ padding: '12px 0' }}>
            <h3 style={{ color: '#d97706', margin: '0 0 8px 0' }}>Network IP Changed</h3>
            <p style={{ fontSize: '13px' }}>
              Your network IP address has changed. Please re-authenticate your session via the website.
            </p>
            <button
              onClick={handleStartLogin}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Re-authenticate Now
            </button>
          </div>
        )}

        {state === 'device_revoked' && (
          <div style={{ padding: '12px 0' }}>
            <h3 style={{ color: '#dc2626', margin: '0 0 8px 0' }}>Device Revoked</h3>
            <p style={{ fontSize: '13px' }}>
              This device has been signed out from another session or account settings.
            </p>
            <button
              onClick={handleStartLogin}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Sign In Again
            </button>
          </div>
        )}

        {state === 'error' && (
          <div style={{ padding: '12px 0' }}>
            <h3 style={{ color: '#dc2626', margin: '0 0 8px 0' }}>Authentication Error</h3>
            <p style={{ fontSize: '13px', color: '#dc2626' }}>{errorMessage || 'An unexpected error occurred.'}</p>
            <button
              onClick={handleStartLogin}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Retry Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
