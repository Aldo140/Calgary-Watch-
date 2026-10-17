/** Date-only schedules use calendar dates, independent of runtime timezone/DST tables. End is exclusive. */
export function lastEventDate(end:string):string{
 return new Date(Date.parse(`${end.slice(0,10)}T12:00:00Z`)-86400000).toISOString().slice(0,10);
}
export function calendarDateForDisplay(day:string):Date{return new Date(`${day.slice(0,10)}T18:00:00Z`);}
