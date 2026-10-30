export function payerTotals(groups){
 const result=new Map();
 for(const g of groups){
  const key=JSON.stringify([g.user_id,g.currency]);
  if(!result.has(key))result.set(key,{user_id:g.user_id,paid_by:g.paid_by,currency:g.currency,cents:0n,count:0});
  const item=result.get(key);const [whole,fraction='']=String(g.total_amount).split('.');
  item.cents+=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));item.count+=Number(g.transaction_count);
 }
 return [...result.values()].map(g=>({...g,total_amount:`${g.cents/100n}.${String(g.cents%100n).padStart(2,'0')}`}));
}
