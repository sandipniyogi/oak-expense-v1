"""Pure three-way record merge. Missing != explicit deletion (None)."""
import hashlib,json
TABLES=('users','categories','merchants','expenses','oak_phone_saves')
MISSING={'$oak_missing':True}
def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()
def merge(base,mac,vps,resolutions=None):
    target={t:{} for t in TABLES}; conflicts=[]; resolutions=resolutions or {}
    for table in TABLES:
        b=base.get(table,{}) if base is not None else {}
        for rid in sorted(set(b)|set(mac.get(table,{}))|set(vps.get(table,{}))):
            left=mac.get(table,{}).get(rid,MISSING);right=vps.get(table,{}).get(rid,MISSING)
            lf,rf=fingerprint(left),fingerprint(right)
            cid=fingerprint([table,rid,lf,rf])
            if left==right: chosen=left
            elif cid in resolutions:
                chosen=left if resolutions[cid]=='mac' else right
                if chosen==MISSING:chosen=None  # Explicitly choosing absence means a deletion tombstone
            elif base is None:
                # No shared history yet: missing may mean an old deletion, not a
                # new row. Initial differences require explicit review.
                chosen=MISSING
                conflicts.append(dict(id=cid,table=table,row_id=rid,mac=left,vps=right))
            else:
                previous=b.get(rid,fingerprint(MISSING))
                if lf==previous:chosen=right
                elif rf==previous:chosen=left
                else:chosen=MISSING;conflicts.append(dict(id=cid,table=table,row_id=rid,mac=left,vps=right))
            if chosen!=MISSING:target[table][rid]=chosen
    if not conflicts:
        for table in ('categories',):
            names={}
            for rid,row in target[table].items():
                if row is None:continue
                if row['name'] in names:
                    conflicts.append(dict(id=fingerprint([table,'unique',row['name']]),table=table,row_id=rid,reason='Same category name has different IDs. Merge/remap categories manually.'))
                names[row['name']]=rid
        for table,cols in {'merchants':{'default_category_id':'categories'},'expenses':{'user_id':'users','merchant_id':'merchants','category_id':'categories'}}.items():
            for rid,row in target[table].items():
                if row is None:continue
                for col,parent in cols.items():
                    if row.get(col) and not target[parent].get(str(row[col])):
                        conflicts.append(dict(id=fingerprint([table,rid,col]),table=table,row_id=rid,reason='Reference to deleted or missing '+parent))
    return target,conflicts
def baseline(rows):return {t:{rid:fingerprint(row) for rid,row in rows[t].items()} for t in TABLES}
