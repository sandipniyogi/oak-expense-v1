import {AsyncLocalStorage} from 'node:async_hooks';
export const operationContext=new AsyncLocalStorage();
export function validateClaim(claim){
 if(!claim||!['application','synchronization'].includes(claim.mode)||!['mac','vps'].includes(claim.peer)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(claim.id||'')||!(/^[1-9][0-9]*$/).test(String(claim.generation)))throw Error('Invalid database write claim');
 if(claim.closed)throw Error('Write operation is closed');return claim;
}
export function withOperation(claim,fn){return operationContext.run(validateClaim(claim),fn);}
export function closeOperation(claim){if(claim)claim.closed=true;}
