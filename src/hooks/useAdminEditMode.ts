import { useState } from 'react';
/** Deliberately local: a URL, another account or a previous page cannot enable editing. */
export function useAdminEditMode(isAdmin:boolean,scope:string){
 const [mode,setMode]=useState({scope:'',enabled:false});
 return {enabled:isAdmin&&mode.scope===scope&&mode.enabled,setEnabled:(enabled:boolean)=>setMode({scope,enabled:isAdmin&&enabled})};
}
