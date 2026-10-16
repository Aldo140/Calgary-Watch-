import {db} from '../firebase';
export async function adminMemberAction(input:{subjectUid:string;action:'profile'|'rsvp';draft?:unknown;eventId?:string;start?:string;on?:boolean}){
 if(!db)throw Error('Sign-in is unavailable.');
 const {getFunctions,httpsCallable}=await import('firebase/functions');
 await httpsCallable(getFunctions(db.app,'northamerica-northeast1'),'adminMemberAction')(input);
}
