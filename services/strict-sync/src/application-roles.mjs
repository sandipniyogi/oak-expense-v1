// Explicit runtime table scope. No schema ownership, DDL, TRUNCATE or coordinator controls.
export const APPLICATION_TABLES=Object.freeze({
 expense:['users','categories','merchants','expenses','oak_phone_saves','oak_sync_tombstones'],
 inventory:['oak_inv_categories','oak_inv_locations','oak_inv_products','oak_inv_packs','oak_inv_barcodes','oak_inv_suppliers','oak_inv_receipts','oak_inv_receipt_lines','oak_inv_ai_audit','oak_inv_movements','oak_inv_stock_counts','oak_inv_transfers','oak_inv_audit'],
 keg:['keg_stations','keg_readings'],
 social:['oak_social_assets','oak_social_campaigns','oak_social_agent_settings','oak_social_audit','oak_social_brand','oak_social_projects']
});
export function identifier(value){if(!/^[a-z_][a-z0-9_]{0,62}$/.test(value))throw Error('Invalid SQL identifier');return '"'+value+'"'}
export async function grantApplicationRole(client,role,service,{probeTable=null}={}){
 if(!Object.hasOwn(APPLICATION_TABLES,service))throw Error('Unknown application service');
 const quoted=identifier(role);const tables=[...APPLICATION_TABLES[service],...(probeTable?[probeTable]:[])];
 // Role creation and database/schema defaults are administrative migration steps.
 // This helper grants access to existing, explicitly listed objects only.
 await client.query('GRANT USAGE ON SCHEMA public TO '+quoted);
 for(const table of tables){
  identifier(table);
  const found=await client.query("SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1",[table]);
  if(found.rows.length!==1||!['r','p'].includes(found.rows[0].relkind))throw Error('Required application table missing: '+table);
  await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON public.'+identifier(table)+' TO '+quoted);
  const sequences=await client.query("SELECT pg_get_serial_sequence(format('%I.%I',table_schema,table_name),column_name) AS name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table]);
  for(const row of sequences.rows)if(row.name){
   // Resolve to catalog identifiers, then quote each component. No SQL from callers.
   const sequence=await client.query('SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=$1::regclass AND c.relkind=\'S\'',[row.name]);
   if(sequence.rows.length!==1)throw Error('Sequence scope unavailable');const s=sequence.rows[0];
   await client.query('GRANT USAGE ON SEQUENCE '+identifier(s.nspname)+'.'+identifier(s.relname)+' TO '+quoted);
  }
 }
}
