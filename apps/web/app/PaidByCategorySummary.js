import {payerTotals} from './payerTotals.mjs';
export default function PaidByCategorySummary({groups=[],detailsLimited=false,onSelect,busy=false}){
 return <section aria-label="Who paid for what" style={{marginTop:24}}>
  <h3>Who paid for what</h3>
  <p>Spend grouped by payer and expense category, using the report filters above. Paid by is selected by a person; AI does not assign the payer.</p>
  <div style={{display:'flex',flexWrap:'wrap',gap:12,margin:'16px 0'}}>{payerTotals(groups).map(g=><div key={JSON.stringify([g.user_id,g.currency])} style={{padding:16,border:'1px solid #d6d0c5',borderRadius:12,flex:'1 1 180px'}}><strong>{g.paid_by}</strong><p style={{fontSize:24,margin:'8px 0'}}>{g.currency} {g.total_amount}</p><p>{g.count} expenses</p>{onSelect&&g.user_id&&<button type="button" disabled={busy} onClick={()=>onSelect(g.user_id)}>View {g.paid_by}'s payments</button>}</div>)}</div>
  {groups.length?<div className="tablewrap"><table><thead><tr><th>Paid by</th><th>Category</th><th>Currency</th><th>Expenses</th><th>Total paid</th></tr></thead><tbody>{groups.map((group,i)=><tr key={`${group.user_id||'unassigned'}:${group.category_id||'uncategorized'}:${group.currency}:${i}`}><td>{group.paid_by}</td><td>{group.category}</td><td>{group.currency}</td><td>{group.transaction_count}</td><td className="money">{Number(group.total_amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>)}</tbody></table></div>:<p>No expenses match these filters.</p>}
  {detailsLimited&&<p className="warn">This summary includes all matching expenses. Transaction details and their screenshot exports are limited to the latest 5,000 matching entries.</p>}
 </section>;
}
