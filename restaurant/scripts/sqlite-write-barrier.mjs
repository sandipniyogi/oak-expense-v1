// Isolated prototype. SQLite file owners can alter triggers: file access is a trust boundary.
import {randomUUID} from 'node:crypto';
export function installBarrier(db,tables){
 if(!tables.length||tables.some(t=>!/^test_[a-z_]+$/.test(t)))throw Error('Disposable test tables required');
 db.exec(`CREATE TABLE oak_test_fence(singleton INTEGER PRIMARY KEY CHECK(singleton=1),generation INTEGER NOT NULL,frozen INTEGER NOT NULL,operation TEXT,mode TEXT);
 INSERT INTO oak_test_fence VALUES(1,0,1,NULL,NULL)`);
 for(const table of tables)for(const action of ['INSERT','UPDATE','DELETE'])db.exec(`CREATE TRIGGER fence_${table}_${action} BEFORE ${action} ON ${table} BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM oak_test_fence WHERE singleton=1 AND operation=oak_operation() AND generation=oak_generation() AND mode=oak_mode() AND ((mode='application' AND frozen=0) OR (mode='synchronization' AND frozen=1))) THEN RAISE(ABORT,'STRICT_SYNC_WRITE_LOCKED') END; END`);
}
export function controller(db){
 function change(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
 return {
  freeze(){return change(()=>{db.exec('UPDATE oak_test_fence SET frozen=1,operation=NULL,mode=NULL,generation=generation+1 WHERE singleton=1');return db.prepare('SELECT generation FROM oak_test_fence').get().generation})},
  begin(mode='application'){if(!['application','synchronization'].includes(mode))throw Error('Invalid mode');return change(()=>{const state=db.prepare('SELECT * FROM oak_test_fence').get();if(!state.frozen||state.operation)throw Error('Barrier busy');const claim={id:randomUUID(),generation:state.generation+1,mode};db.prepare('UPDATE oak_test_fence SET frozen=?,operation=?,generation=?,mode=? WHERE singleton=1').run(mode==='application'?0:1,claim.id,claim.generation,mode);return claim})}
 };
}
export function writer(db){
 let current=null;
 db.function('oak_operation',()=>current?.id??'');db.function('oak_generation',()=>current?.generation??-1);db.function('oak_mode',()=>current?.mode??'');
 return {transaction(claim,fn){
  if(current)throw Error('Nested write operation refused');
  if(!claim||claim.closed)throw Error('Missing or closed operation');
  db.exec('BEGIN IMMEDIATE');current=claim;
  try{const result=fn(db);if(result&&typeof result.then==='function')throw Error('SQLite transaction callback must be synchronous');if(claim.closed)throw Error('Operation closed');db.exec('COMMIT');return result}
  catch(e){db.exec('ROLLBACK');throw e}finally{current=null}
 }};
}
