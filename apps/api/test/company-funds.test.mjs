import {test} from 'node:test';import assert from 'node:assert/strict';import {cents,isoDate,monthRange,settlement} from '../src/company-funds-model.mjs';
const users=[{id:'a',name:'Sandip',role:'partner'},{id:'b',name:'Yolanda',role:'partner'},{id:'c',name:'Company',role:'company'}];
function expense(amount,source='personal',day='2026-11-02',user='a'){return {id:'e-'+amount+'-'+user,amount,currency:'CNY',funding_source:source,day,user_id:user,snapshot_user_id:user,snapshot_cents:cents(amount)}}
function entry(kind,amount,date='2026-11-02',partner_id='a'){return {kind,amount_cents:cents(amount),occurred_on:date,partner_id}}
const report=(expenses=[],entries=[],month='2026-11')=>settlement({users,expenses,entries,month});
test('exact cents and invalid monetary input',()=>{assert.equal(cents('0.29'),29);for(const s of ['-1','0','1.001','1e3','NaN'])assert.throws(()=>cents(s))});
test('valid calendar dates and year rollover',()=>{assert.equal(isoDate('2024-02-29'),'2024-02-29');assert.throws(()=>isoDate('2026-02-29'));assert.deepEqual(monthRange('2026-12'),{start:'2026-12-01',end:'2027-01-01'})});
test('8000 costs minus 5000 advance minus 1000 reimbursed leaves 2000 owed',()=>assert.equal(report([expense('8000')],[entry('advance','5000'),entry('reimbursement','1000')]).partners[0].closing_cents,200000));
test('5000 advance, 3200 advance spending, 1000 returned leaves 800 held',()=>{const p=report([expense('3200','advance')],[entry('advance','5000'),entry('return','1000')]).partners[0];assert.equal(p.closing_cents,-80000);assert.equal(p.cash_held_cents,80000)});
test('direct company expense is not a partner reimbursement',()=>{const r=report([expense('250','company')]);assert.equal(r.company_paid_cents,25000);assert.equal(r.partners[0].closing_cents,0)});
test('unreviewed expenses are excluded',()=>{const e=expense('100');delete e.funding_source;const r=report([e]);assert.equal(r.partners[0].closing_cents,0);assert.ok(r.provisional)});
test('changed amount or paid by invalidates review',()=>{const a=expense('100');a.amount='200';const b=expense('50');b.user_id='b';assert.equal(report([a,b]).unreviewed_expense_ids.length,2)});
test('opening balance carries forward and future entries excluded',()=>{const p=report([expense('100','personal','2026-10-31'),expense('500','personal','2026-12-01')],[entry('reimbursement','20')]).partners[0];assert.equal(p.opening_cents,10000);assert.equal(p.closing_cents,8000)});
test('capital and drawings are separate',()=>{const p=report([],[entry('capital','5000'),entry('personal_withdrawal','500')]).partners[0];assert.equal(p.closing_cents,0);assert.equal(p.capital_cents,500000)});
test('voids excluded while records remain in history',()=>{const e=entry('advance','100');e.voided_at='today';assert.equal(report([],[e]).partners[0].closing_cents,0)});
test('both directions of opening adjustments',()=>assert.equal(report([],[entry('opening_due_partner','100'),entry('opening_due_company','30')]).partners[0].closing_cents,7000));
test('individuals stay separate',()=>{const r=report([expense('20','personal','2026-11-03','b')],[entry('advance','100')]);assert.equal(r.partners[0].closing_cents,-10000);assert.equal(r.partners[1].closing_cents,2000)});
test('company cash movements differ from business expense total',()=>{const r=report([expense('100'),expense('50','company')],[entry('advance','200'),entry('reimbursement','40'),entry('return','20'),entry('capital','500')]);assert.equal(r.company_cash_out_cents,29000);assert.equal(r.company_cash_in_cents,52000);assert.equal(r.company_business_expense_cents,15000)});
