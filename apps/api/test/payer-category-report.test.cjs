const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
const code=source.slice(source.indexOf('function parseReportFilters('),source.indexOf('function reportRowDate('));
const payer='11111111-1111-1111-1111-111111111111',category='22222222-2222-2222-2222-222222222222';
function context(){
 const queries=[];const groups=[{user_id:payer,paid_by:'Sandip',category_id:category,category:'Food',currency:'CNY',transaction_count:6001,total_amount:'20000.00'}];
 const pool={query:async(sql,params)=>{queries.push({sql,params});if(sql.startsWith('select name from categories'))return {rows:[{name:'Food'}]};if(sql.startsWith('select name from users'))return {rows:[{name:'Sandip'}]};if(sql.includes('group by e.user_id'))return {rows:groups};if(sql.includes('count(*)::int as transaction_count'))return {rows:[{transaction_count:6001,total_amount:'20000.00'}]};return {rows:[{id:'latest',amount:'10.00',paid_by:'Sandip',category:'Food'}]};}};
 const ctx={pool,Date};vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,queries,groups};
}
test('category input is validated before SQL; uncategorized is supported',()=>{
 const {ctx}=context();assert.throws(()=>ctx.parseReportFilters({category_id:'bad'}),/valid category ID/);const f=ctx.parseReportFilters({category_id:'uncategorized'});assert.match(f.whereSql,/e.category_id is null/);assert.equal(f.params.length,0);
});
test('same paid-by/category/date/amount filter parameters apply to all report queries',async()=>{
 const {ctx,queries}=context();const result=await ctx.getExpenseReport({user_id:payer,category_id:category,amount:'10.00',from:'2026-10-01',to:'2026-10-30'});
 assert.equal(result.filter.paid_by,'Sandip');assert.equal(result.filter.category,'Food');assert.equal(result.filter.category_id,category);
 const reportQueries=queries.filter(q=>!q.sql.startsWith('select name'));
 assert.equal(reportQueries.length,3);for(const q of reportQueries)assert.deepEqual(Array.from(q.params),[category,'10.00',payer,'2026-10-01','2026-10-30']);
});
test('payer-category totals come from complete aggregate rather than limited details',async()=>{
 const {ctx,groups}=context();const result=await ctx.getExpenseReport({});assert.equal(result.rows.length,1);assert.equal(result.paid_by_category,groups);assert.equal(result.paid_by_category[0].total_amount,'20000.00');assert.equal(result.details_limited,true);
});
