import crypto from 'node:crypto';
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const digest=v=>crypto.createHash('sha256').update(stable(v)).digest('hex');
const policies={
 oak_inv_categories:{keys:['name'],omit:['id','created_at']},
 oak_inv_locations:{keys:['name'],omit:['id','created_at']},
 oak_social_agent_settings:{keys:['id'],omit:['updated_at']},
 oak_social_brand:{keys:['id'],omit:['updated_at']},
 oak_sync_tombstones:{keys:['table_name','row_id'],omit:['deleted_at']},
};
const restaurantPolicies={menu:{keys:['category','name'],omit:['id','updated_at']},events:{keys:['title'],omit:['id','updated_at']},migrations:{keys:['id'],omit:['applied_at']}};
function identity(row,policy){if(policy.keys.some(k=>!Object.hasOwn(row,k)||row[k]===null))throw Error('Missing comparison key');return digest(policy.keys.map(k=>row[k]));}
// This equality policy NEVER rekeys, merges, deletes or applies records. An ID
// mapping must be retained by future replication adapters; matching content alone
// is not authorization to copy foreign keys between independent databases.
function normalize(tables,policies,foreignKeys=[]){
 const maps={},seen={};
 for(const [table,policy] of Object.entries(policies)){
  maps[table]=new Map();seen[table]=new Set();
  for(const row of tables[table]||[]){const key=identity(row,policy);if(seen[table].has(key))throw Error('Ambiguous comparison key: '+table);seen[table].add(key);if(Object.hasOwn(row,'id')){if(maps[table].has(String(row.id)))throw Error('Duplicate local ID');maps[table].set(String(row.id),key)}}
 }
 const result={};
 for(const [table,rows] of Object.entries(tables)){
  if(!Array.isArray(rows))throw Error('Expected table rows');
  result[table]=rows.map(original=>{
   const row=structuredClone(original);
   for(const fk of foreignKeys.filter(f=>f.table===table&&policies[f.references])){
    if(fk.columns?.length!==1||fk.referencedColumns?.length!==1||fk.referencedColumns[0]!=='id')throw Error('Unsupported mapped foreign key');
    const col=fk.columns[0];if(row[col]!==null&&row[col]!==undefined){const key=maps[fk.references].get(String(row[col]));if(!key)throw Error('Dangling mapped foreign key');row[col]={entity:fk.references,key};}
   }
   const p=policies[table];if(p){for(const column of p.omit)delete row[column];}
   return stable(row);
  }).sort();
 }
 return result;
}
export function contentDigest({postgres,foreignKeys,restaurant,referencedUploads,schema}){
 if(!Array.isArray(foreignKeys)||!schema)throw Error('Verified schema/foreign-key inventory required');
 // Matching whole-table snapshots do not imply absent tables are safe. Adapters
 // must separately attest full expected scope before setting complete=true.
 return digest({postgres:normalize(postgres,policies,foreignKeys),restaurant:normalize(restaurant,restaurantPolicies),referencedUploads,schema});
}
