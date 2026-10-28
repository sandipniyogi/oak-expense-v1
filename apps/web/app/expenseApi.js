// The API URL is baked into the web build. When that URL points to
// localhost, a phone must use the hostname it used to reach the Mac instead.
export function expenseApiBase(){
  const configured=process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  if(typeof window==='undefined') return configured.replace(/\/$/,'');
  try{
    const url=new URL(configured);
    const localHosts=['localhost','127.0.0.1','[::1]','::1'];
    if(localHosts.includes(url.hostname) && !localHosts.includes(window.location.hostname)) url.hostname=window.location.hostname;
    return url.toString().replace(/\/$/,'');
  }catch{return configured.replace(/\/$/,'');}
}
// randomUUID is unavailable on ordinary HTTP connections from a phone.
let uploadSequence=0;
export function newUploadId(){uploadSequence+=1;return `${Date.now()}-${uploadSequence}`;}
