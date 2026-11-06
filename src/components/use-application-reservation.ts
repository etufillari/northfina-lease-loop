'use client';

import { useEffect, useState } from 'react';
import { formatRemainingTime, shouldReleaseReservationOnDecision } from '@/domain/reservation';
import type { Locale } from '@/i18n/locales';
import type { EvaluateState, SignTarget } from './application-form';

export type ReservationState = 'init' | 'active' | 'conflict' | 'expired' | 'released' | 'error';

export function formatRemainingDuration(sec: number): string {
  if (sec >= 86400) {
    const days = Math.ceil(sec / 86400);
    return `${days} d`;
  }
  if (sec >= 3600) {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hours} h ${mins} m`;
  }
  return formatRemainingTime(sec);
}

export function useApplicationReservation({
  signTarget,
  initialToken,
  initialReservationType = 'standard',
  state,
  locale,
  onNavigateHome,
}: {
  signTarget?: SignTarget;
  initialToken?: string;
  initialReservationType?: 'standard' | 'offer';
  state: EvaluateState;
  locale: Locale;
  onNavigateHome: () => void;
}) {
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [resState, setResState] = useState<ReservationState>('init');
  const [reservationType, setReservationType] = useState<'standard' | 'offer'>(
    initialReservationType
  );
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [isReleasing, setIsReleasing] = useState(false);

  // Reserve the asset when the application process starts
  useEffect(() => {
    if (!signTarget) return;
    const assetId = signTarget.assetId;
    const storageKey = `lease_loop_res_${assetId}`;
    const storedToken =
      initialToken ?? (typeof window !== 'undefined' ? sessionStorage.getItem(storageKey) : null);

    let active = true;

    async function initReservation() {
      try {
        const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/reserve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor: 'customer',
            token: storedToken ?? undefined,
          }),
        });
        const json = (await response.json()) as {
          success: boolean;
          data?: {
            reservation: {
              token: string;
              expiresAt: string;
              reservationType?: 'standard' | 'offer';
            };
          };
        };
        if (!active) return;

        if (response.ok && json.success && json.data) {
          const resToken = json.data.reservation.token;
          const expiry = json.data.reservation.expiresAt;
          const resType = json.data.reservation.reservationType ?? 'standard';
          setToken(resToken);
          setExpiresAt(expiry);
          setReservationType(resType);
          sessionStorage.setItem(storageKey, resToken);
          setResState('active');

          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('token', resToken);
          window.history.replaceState({}, '', currentUrl.toString());
        } else if (response.status === 409) {
          setResState('conflict');
        } else {
          setResState('error');
        }
      } catch {
        if (active) setResState('error');
      }
    }

    initReservation();

    return () => {
      active = false;
    };
  }, [signTarget, initialToken]);

  // Reservation countdown ticker
  useEffect(() => {
    if (resState !== 'active' || !expiresAt) return;

    function tick() {
      const ms = new Date(expiresAt!).getTime() - Date.now();
      const sec = Math.max(0, Math.floor(ms / 1000));
      setRemainingSec(sec);
      if (sec <= 0) {
        setResState('expired');
        if (signTarget) {
          sessionStorage.removeItem(`lease_loop_res_${signTarget.assetId}`);
        }
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [resState, expiresAt, signTarget]);

  // Automatically cancel and release reservation if application is rejected
  useEffect(() => {
    if (
      state.status === 'ready' &&
      shouldReleaseReservationOnDecision(state.data.decision.decision) &&
      signTarget &&
      token &&
      resState === 'active'
    ) {
      sessionStorage.removeItem(`lease_loop_res_${signTarget.assetId}`);
      fetch(`/api/assets/${encodeURIComponent(signTarget.assetId)}/reserve`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason: 'rejected' }),
      })
        .then(() => {
          setResState('released');
        })
        .catch(() => {});
    }
  }, [state, signTarget, token, resState]);

  async function handleCancelApplication() {
    if (signTarget && token && resState === 'active') {
      setIsReleasing(true);
      try {
        await fetch(`/api/assets/${encodeURIComponent(signTarget.assetId)}/reserve`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, reason: 'cancelled' }),
        });
      } catch {
        // ignore error during voluntary cancel
      } finally {
        sessionStorage.removeItem(`lease_loop_res_${signTarget.assetId}`);
      }
    }
    onNavigateHome();
  }

  async function handleReReserve() {
    if (!signTarget) return;
    setResState('init');
    try {
      const response = await fetch(
        `/api/assets/${encodeURIComponent(signTarget.assetId)}/reserve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor: 'customer' }),
        }
      );
      const json = (await response.json()) as {
        success: boolean;
        data?: { reservation: { token: string; expiresAt: string } };
      };
      if (response.ok && json.success && json.data) {
        const resToken = json.data.reservation.token;
        const expiry = json.data.reservation.expiresAt;
        setToken(resToken);
        setExpiresAt(expiry);
        setReservationType('standard');
        sessionStorage.setItem(`lease_loop_res_${signTarget.assetId}`, resToken);
        setResState('active');
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('token', resToken);
        window.history.replaceState({}, '', currentUrl.toString());
      } else {
        setResState('conflict');
      }
    } catch {
      setResState('error');
    }
  }

  function updateOfferCreated(newToken: string, newExpiry: string) {
    setToken(newToken);
    setExpiresAt(newExpiry);
    setReservationType('offer');
    setResState('active');
    if (signTarget && typeof window !== 'undefined') {
      sessionStorage.setItem(`lease_loop_res_${signTarget.assetId}`, newToken);
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('token', newToken);
      window.history.replaceState({}, '', currentUrl.toString());
    }
  }

  const isRejected =
    state.status === 'ready' && shouldReleaseReservationOnDecision(state.data.decision.decision);
  const displayResState: ReservationState =
    isRejected && resState === 'active' ? 'released' : resState;

  return {
    token,
    resState,
    displayResState,
    reservationType,
    expiresAt,
    remainingSec,
    isReleasing,
    handleCancelApplication,
    handleReReserve,
    updateOfferCreated,
    locale,
  };
}
