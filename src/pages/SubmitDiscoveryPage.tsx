import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/FirebaseProvider';
import { SiteLayout } from '../components/site/SiteLayout';
import { InventoryForm } from '../components/discovery/InventoryForm';
import { discoveryCall } from '../lib/discoveryApi';
export default function SubmitDiscoveryPage() {
  const {user,signIn}=useAuth();const [busy,setBusy]=useState(false);const [sent,setSent]=useState(false);const [error,setError]=useState('');
  const [params]=useSearchParams();const requestedType=params.get('type');const defaultKind=requestedType==='market'?'market':requestedType==='event'?'event':undefined;
  return <SiteLayout><div className="cw-wrap cw-page"><h1>Share an event or market</h1><p>Suggest confirmed Calgary plans with an official source. We check every submission before publication.</p>{sent?<p role="status">Thank you. Your suggestion is awaiting review.</p>:!user?<><button className="cw-button" onClick={()=>void signIn().catch(e=>setError(e.message))}>Sign in to suggest a listing</button>{error&&<p role="alert">{error}</p>}</>:<InventoryForm busy={busy} defaultKind={defaultKind} onSave={async input=>{setBusy(true);try{await discoveryCall('submitDiscovery',input);setSent(true);}finally{setBusy(false);}}}/>}</div></SiteLayout>;
}
