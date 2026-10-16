import { Link } from 'react-router-dom';
export function AdminAccessBar({enabled,onChange,busy=false,subject,backTo='/admin?section=members'}:{enabled:boolean;onChange:(enabled:boolean)=>void;busy?:boolean;subject:string;backTo?:string}){
 return <section className="pl-adminview admin-access" aria-label="Admin access mode"><div><strong>{enabled?'Admin edit mode':'Admin preview — read-only'}</strong><p>{subject}. {enabled?'Changes are saved under your administrator account.':'Turn on editing to manage this account or organization.'}</p></div><button type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={()=>onChange(!enabled)}>{enabled?'Return to read-only':'Enable admin editing'}</button><Link to={backTo}>Back to admin</Link></section>;
}
