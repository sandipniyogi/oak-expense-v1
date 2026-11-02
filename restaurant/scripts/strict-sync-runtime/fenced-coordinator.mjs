import crypto from 'node:crypto';
import {Coordinator,Locked} from './coordinator.mjs';
export class FencedCoordinator extends Coordinator {
 constructor(options){super(options);if(!options.databases)throw Error('Paired database controller required');this.databases=options.databases;}
 async freezeOrRetain(){try{await this.databases.freeze()}catch{this.state.dirty=true;this.state.reason='paired_freeze_incomplete_manual_recovery';this.persist();throw new Locked(this.state.reason)}}
 async sync(){return this.exclusive(async()=>{
  if(this.state.active)throw new Locked('write_still_active_or_uncertain');
  this.state.dirty=true;this.state.reason='freezing_for_sync';this.persist();
  await this.freezeOrRetain();
  try{
   const id=crypto.randomUUID();const claims=await this.databases.begin(id,'synchronization');
   await this.provider.sync(claims);
   await this.freezeOrRetain(); // wait for sync transactions; withdraw sync permits
   await this.check(); // fresh snapshots while application writes remain fenced
   this.state.dirty=false;this.state.reason='verified_next_write_requires_fresh_check';this.persist();return {ok:true,rehearsal:this.provider.rehearsal===true};
  }catch(e){this.state.dirty=true;this.state.reason='sync_or_verification_failed';this.persist();await this.freezeOrRetain();throw e}
 })}
 async acquire(peer){return this.exclusive(async()=>{
  if(!['mac','vps'].includes(peer))throw new Locked('invalid_peer');
  if(this.state.active)throw new Locked('write_still_active_or_uncertain');
  if(this.state.dirty)throw new Locked('sync_required');
  this.state.dirty=true;this.state.reason='freezing_before_write';this.persist();
  await this.freezeOrRetain();
  try{
   await this.check();const id=crypto.randomUUID();
   // Persist intent BEFORE activating either DB. A crash cannot forget the permit.
   this.state.active={id,peer};this.state.reason='activating_paired_permit';this.persist();
   const claims=await this.databases.begin(id,'application');
   this.state.reason='write_in_progress';this.persist();
   return {id,peer,database_claim:claims[peer],rehearsal:this.provider.rehearsal===true};
  }catch(e){this.state.reason='write_acquisition_failed';this.persist();await this.freezeOrRetain();throw e}
 })}
 async complete(peer,id,uncertain=false){return this.exclusive(async()=>{
  if(this.state.active?.id!==id||this.state.active?.peer!==peer)throw new Locked('invalid_write_completion');
  await this.freezeOrRetain();this.state.dirty=true;
  if(uncertain)this.state.reason='uncertain_write_manual_recovery_required';
  else{this.state.active=null;this.state.reason='sync_required_after_write';}
  this.persist();return {ok:true,locked:true};
 })}
}
