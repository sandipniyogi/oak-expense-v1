'use client';

import {useEffect, useState} from 'react';

const yuan = new Intl.NumberFormat('en-CN', {style: 'currency', currency: 'CNY'});

export default function IndividualSettlement({api, personId, reportVersion}) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!personId) return;
    const controller = new AbortController();
    const month = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
    }).format(new Date());
    setResult(null);
    async function refresh() {
      try {
        const response = await fetch(
          api + '/company-funds?summary_only=1&month=' + encodeURIComponent(month),
          {signal: controller.signal, cache: 'no-store'},
        );
        if (!response.ok) throw new Error('Balance unavailable');
        const {summary} = await response.json();
        if (!controller.signal.aborted) setResult({personId, summary});
      } catch {
        if (!controller.signal.aborted) setResult({personId, unavailable: true});
      }
    }
    refresh();
    return () => controller.abort();
  }, [api, personId, reportVersion]);

  if (!personId) return null;
  if (result?.personId !== personId) return <p role="status">Loading settlement balance…</p>;
  if (result.unavailable) return <p role="status">Settlement balance unavailable.</p>;
  const person = result.summary.partners.find(partner => partner.id === personId);
  if (!person) return null;
  return (
    <section aria-label="Individual settlement" className="simple-stat-card">
      <strong>{person.name} · Settlement through {result.summary.month}</strong>
      <p>Company owes {person.name} <b>{yuan.format(Math.max(person.closing_cents, 0) / 100)}</b></p>
      <p>{person.name} holds or owes the company <b>{yuan.format(Math.max(-person.closing_cents, 0) / 100)}</b></p>
      {result.summary.provisional && <small>Provisional balance. Expenses awaiting funding review are excluded.</small>}
      <p><a href="/company-funds">Review in Company Funds →</a></p>
    </section>
  );
}
