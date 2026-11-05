// Read-only preview using the authoritative movement signs returned by the API.
export function describeBalance(net) {
 if (!Number.isSafeInteger(net)) throw Error('Invalid balance');
 return {company_owes_cents:Math.max(net,0),individual_owes_cents:Math.max(-net,0),status:net>0?'Company owes individual':net<0?'Individual holds / owes company money':'Settled'};
}
function inputCents(value) {
 const text=String(value??'').trim();
 if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) return null;
 const [whole,fraction='']=text.split('.');
 const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return Number.isSafeInteger(amount)&&amount>0&&amount<=999999999999?amount:null;
}
export function movementPreview(summary,form) {
 const partner=summary?.partners?.find(p=>p.id===form.partner_id);
 const amount=inputCents(form.amount),effect=summary?.movement_balance_effects?.[form.kind];
 if (!partner||amount===null||![-1,0,1].includes(effect)) return null;
 if (!/^\d{4}-\d{2}-\d{2}$/.test(form.occurred_on||'')) return null;
 const date=new Date(form.occurred_on+'T00:00:00Z');
 if (+form.occurred_on.slice(0,4)<1900||+form.occurred_on.slice(0,4)>2100) return null;
 if (!Number.isFinite(+date)||date.toISOString().slice(0,10)!==form.occurred_on) return null;
 if (form.occurred_on.slice(0,7)>summary.month) return {included:false,month:summary.month};
 const before=partner.closing_cents,after=before+effect*amount;
 if (!Number.isSafeInteger(before)||!Number.isSafeInteger(after)) return null;
 return {included:true,before,after,effect:effect*amount,beforeAmounts:describeBalance(before),afterAmounts:describeBalance(after),changesOpening:form.occurred_on.slice(0,7)<summary.month,provisional:summary.provisional};
}
