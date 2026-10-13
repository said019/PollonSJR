"use client";

import { useEffect, useRef, useState } from 'react';
import { getAdminToken } from '@/lib/auth';

type Notice = { texto: string; fecha: string; ciclo: string };

export function PaymentNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissed = useRef('');
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    let stopped = false;
    let controller: AbortController | undefined;
    async function refresh() {
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      const timeout = setTimeout(() => current.abort(), 4000);
      try {
        const token = getAdminToken();
        if (!token) { setNotice(null); return; }
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/admin/platform-payment-notice`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: current.signal,
        });
        const a = response.ok ? (await response.json()).aviso : null;
        if (!stopped && controller === current) setNotice(a && typeof a.texto === 'string' && a.texto.length <= 300 && typeof a.fecha === 'string' ? a : null);
      } catch { if (!stopped && controller === current) setNotice(null); }
      finally { clearTimeout(timeout); }
    }
    void refresh();
    const interval = setInterval(refresh, 300000);
    window.addEventListener('focus', refresh);
    return () => { stopped = true; controller?.abort(); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (notice && dismissed.current !== `${notice.fecha}:${notice.texto}`) dialog.current?.showModal();
    else dialog.current?.close();
  }, [notice]);
  function close() {
    if (notice) dismissed.current = `${notice.fecha}:${notice.texto}`;
    dialog.current?.close();
  }
  return <dialog ref={dialog} aria-labelledby="payment-notice-title" aria-describedby="payment-notice-text" onCancel={close}
    className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-outline-variant/25 bg-surface-container-high p-6 text-on-surface shadow-xl backdrop:bg-black/60">
    <p className="text-sm font-semibold text-primary">Recordatorio de Wallet Club</p>
    <h2 id="payment-notice-title" className="mt-2 text-xl font-bold">Fecha de pago de tu plataforma</h2>
    <p id="payment-notice-text" className="mt-4 whitespace-pre-line break-words">{notice?.texto}</p>
    <p className="mt-4 text-sm text-on-surface-variant">Este aviso es informativo. Puedes cerrarlo y seguir trabajando.</p>
    <button type="button" onClick={close} className="mt-6 min-h-11 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-on-primary">Entendido, continuar</button>
  </dialog>;
}
