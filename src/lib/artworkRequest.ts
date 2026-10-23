import {LISTING_CONTACT_EMAIL} from '../config/contact';
/** Opens the sender's own email client; never uploads or sends a file automatically. */
export function artworkRequestUrl(title:string,path:string){
 const url=path.startsWith('/')?`https://calgarywatch.ca${path}`:path;
 const body=`Organization or event: ${title}\nCalgaryWatch listing: ${url}\n\nPlease add or update the approved artwork for this listing.\n\nFiles or download link: [attach the original files or paste a shared link]\nArtist / photographer credit: [credit exactly as it should appear]\nPermission: [confirm that we may publish these images on CalgaryWatch; mention any limits]\nWhich event dates use each image: [details]\nAlternative text / image description: [details]\n`;
 return `mailto:${LISTING_CONTACT_EMAIL}?subject=${encodeURIComponent(`Approved artwork — ${title}`)}&body=${encodeURIComponent(body)}`;
}
