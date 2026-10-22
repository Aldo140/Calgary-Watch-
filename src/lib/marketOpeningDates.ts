import {ownerInstant} from './ownerListingEdits';
/** Build actual daily openings, never a continuously-open date range. Days use JS Sunday=0. */
export function marketOpeningDates(first:string,last:string,opens:string,closes:string,days:readonly number[]){
 const validDay=(s:string)=>/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 if(!validDay(first)||!validDay(last)||first>last)throw Error('Choose a valid first and last opening date.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(opens)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(closes)||opens>=closes)throw Error('Enter opening and closing times, with closing later the same day.');
 if(!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Choose at least one opening day.');
 const start=Date.parse(first+'T12:00:00Z'),end=Date.parse(last+'T12:00:00Z');if(end-start>366*86400000)throw Error('Generate openings for up to one year at a time.');
 const result=[];for(let t=start;t<=end;t+=86400000){const date=new Date(t),day=date.toISOString().slice(0,10);if(!days.includes(date.getUTCDay()))continue;result.push({sourceRecordId:'opening-'+day,start:ownerInstant(day+'T'+opens),end:ownerInstant(day+'T'+closes),cancelled:false});if(result.length>100)throw Error('A market can include up to 100 opening dates. Shorten the range or choose fewer weekdays.');}
 if(!result.length)throw Error('No selected weekdays fall within these dates.');return result;
}
