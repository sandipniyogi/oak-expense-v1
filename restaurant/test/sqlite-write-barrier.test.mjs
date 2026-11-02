import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {installBarrier,controller,writer} from '../scripts/sqlite-write-barrier.mjs';
test('disposable SQLite transaction barrier',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'oak-sqlite-fence-'));const file=path.join(folder,'test.sqlite');const admin=new DatabaseSync(file);let app,other;
 try{
 admin.exec('PRAGMA journal_mode=WAL;CREATE TABLE test_menu(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO test_menu VALUES(1,\'original\')');installBarrier(admin,['test_menu']);
 app=new DatabaseSync(file);other=new DatabaseSync(file);const writes=writer(app);const control=controller(admin);
 assert.throws(()=>app.prepare("INSERT INTO test_menu VALUES(2,'blocked')").run(),/STRICT_SYNC/);
 assert.throws(()=>app.prepare("UPDATE test_menu SET name='blocked'").run(),/STRICT_SYNC/);
 assert.throws(()=>app.prepare('DELETE FROM test_menu').run(),/STRICT_SYNC/);console.log('PASS: INSERT, UPDATE and DELETE without a claim are blocked');
 assert.equal(other.prepare('SELECT name FROM test_menu').get().name,'original');console.log('PASS: browsing works while frozen');
 const claim=control.begin();writes.transaction(claim,db=>db.prepare('UPDATE test_menu SET name=? WHERE id=1').run('approved'));
 assert.equal(other.prepare('SELECT name FROM test_menu').get().name,'approved');assert.throws(()=>control.begin(),/busy/);console.log('PASS: current permit writes; overlapping operation refused');
 assert.throws(()=>other.prepare("UPDATE test_menu SET name='bypass'").run(),/oak_operation/);console.log('PASS: separate connection without registered claim functions cannot write');
 assert.throws(()=>writes.transaction(claim,db=>{db.prepare("UPDATE test_menu SET name='rollback'").run();throw Error('forced failure')}),/forced failure/);assert.equal(other.prepare('SELECT name FROM test_menu').get().name,'approved');console.log('PASS: failed operation rolls back');
 writes.transaction(claim,()=>{assert.throws(()=>control.freeze(),/locked|busy/)});console.log('PASS: freeze cannot complete while a writer owns the SQLite transaction');
 control.freeze();assert.throws(()=>writes.transaction(claim,db=>db.prepare("UPDATE test_menu SET name='stale'").run()),/STRICT_SYNC/);console.log('PASS: stale permit fails after freeze');
 const sync=control.begin('synchronization');writes.transaction(sync,db=>db.prepare("UPDATE test_menu SET name='replicated'").run());control.freeze();assert.throws(()=>writes.transaction(sync,db=>db.prepare('DELETE FROM test_menu').run()),/STRICT_SYNC/);console.log('PASS: separate sync permit works while frozen and is fenced afterward');
 const closed=control.begin();closed.closed=true;assert.throws(()=>writes.transaction(closed,()=>{}),/closed/);control.freeze();console.log('PASS: closed request claim rejected');
 }finally{other?.close();app?.close();admin.close();fs.rmSync(folder,{recursive:true,force:true})}
 console.log('PASS: disposable SQLite files removed; no application database opened');
});
