// Explicit expense-only compatibility policy. No prefix wildcard or extra writes.
export const expenseTables=['users','categories','merchants','expenses','oak_phone_saves'];
export const separateModuleTables=[
 'oak_inv_suppliers','oak_inv_receipts','oak_inv_receipt_lines','oak_inv_ai_audit',
 'oak_inv_movements','oak_inv_stock_counts','oak_inv_transfers','oak_inv_audit',
 'oak_inv_categories','oak_inv_locations','oak_inv_products','oak_inv_packs','oak_inv_barcodes',
 'keg_stations','keg_readings','oak_social_assets','oak_social_campaigns',
 'oak_social_agent_settings','oak_social_audit','oak_social_brand','oak_social_projects'
,
 // Legacy inventory tables: staging metadata reviewed; internal FKs and no triggers.
 'inventory_shisha_bowls','inventory_shisha_bowl_items','inventory_products','inventory_stations','inventory_readings','inventory_recipes','inventory_recipe_items','inventory_sales','inventory_stock_movements','inventory_product_packs','inventory_purchase_receipts','inventory_purchase_lines'
];
export async function assertExpenseSyncScope(c){
 const allowed=[...expenseTables,'oak_sync_tombstones',...separateModuleTables];
 const extra=(await c.query("select tablename from pg_tables where schemaname='public' and tablename <> ALL($1)",[allowed])).rows;
 if(extra.length)throw Error('Untracked database tables; sync requires an explicit migration: '+extra.map(x=>x.tablename).join(','));
 // Outside rows must not be cascaded, orphaned or used as parents by expense sync.
 const cross=(await c.query(`select src.relname as source_table,dst.relname as target_table
  from pg_constraint fk join pg_class src on src.oid=fk.conrelid
  join pg_namespace sn on sn.oid=src.relnamespace
  join pg_class dst on dst.oid=fk.confrelid join pg_namespace dn on dn.oid=dst.relnamespace
  where fk.contype='f' and (
   (sn.nspname='public' and src.relname=ANY($1) and not (dn.nspname='public' and dst.relname=ANY($1)))
   or (dn.nspname='public' and dst.relname=ANY($1) and not (sn.nspname='public' and src.relname=ANY($1)))
  )`,[expenseTables])).rows;
 if(cross.length)throw Error('Expense sync crosses an excluded table boundary; explicit migration required: '+cross.map(x=>x.source_table+' -> '+x.target_table).join(','));
}
