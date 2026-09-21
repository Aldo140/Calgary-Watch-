import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../firebase';
export async function discoveryCall(name:'submitDiscovery'|'manageDiscovery',data:unknown) {
  if(!auth) throw Error('Sign-in is not configured for this build.');
  return (await httpsCallable(getFunctions(auth.app,'northamerica-northeast1'),name)(data)).data;
}
