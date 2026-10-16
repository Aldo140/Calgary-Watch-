import { useEffect, useRef } from 'react';
import type { OrganizationChange } from '../lib/organizationWorkspace';
/** Keep typing responsive, but flush the latest draft before leaving or changing accounts. */
export function useOrganizationDraftPersistence(key:string,readOnly:boolean,operations:OrganizationChange[],request:React.RefObject<string|undefined>,onError:(message:string)=>void){
  const latest=useRef(operations),error=useRef(onError);
  latest.current=operations;error.current=onError;
  const persist=useRef<()=>void>(()=>{});
  useEffect(()=>{
    if(readOnly)return;
    const save=()=>{try{
      localStorage.setItem(key,JSON.stringify(latest.current));
      if(request.current)localStorage.setItem(key+':request',request.current);else localStorage.removeItem(key+':request');
    }catch{error.current('Draft storage is unavailable. Keep this page open until you submit.');}};
    persist.current=save;
    window.addEventListener('pagehide',save);
    const visibility=()=>{if(document.hidden)save();};
    document.addEventListener('visibilitychange',visibility);
    return()=>{save();persist.current=()=>{};window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',visibility);};
  },[key,readOnly,request]);
  useEffect(()=>{if(readOnly)return;const timer=setTimeout(()=>persist.current(),300);return()=>clearTimeout(timer);},[key,readOnly,operations]);
}
