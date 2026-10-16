import { ownerEditPatch,ownerEditableFields } from './ownerListingEdits';
import type {DiscoveryEntity,EntityImage} from '../types/discovery';
export function adminEditableFields(kind:string){return [...ownerEditableFields(kind),'image',...(['market','business'].includes(kind)?['images']:[])];}
function image(value:unknown):EntityImage|null{
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Use an image URL and alternative text, or remove the image.');
 const item=value as Record<string,unknown>;
 if(Object.keys(item).some(k=>!['src','alt','credit','presentation'].includes(k)))throw Error('Invalid image metadata.');
 if(typeof item.src!=='string'||item.src.length>2000||typeof item.alt!=='string'||!item.alt.trim()||item.alt.length>300)throw Error('Images need a URL and alternative text.');
 let valid=item.src.startsWith('/images/')&&!item.src.includes('..')&&!item.src.includes('\\');
 try{const url=new URL(item.src);valid=url.protocol==='https:'&&!url.username&&!url.password;}catch{/* Relative CalgaryWatch image paths are supported. */}
 if(!valid)throw Error('Use an HTTPS image URL or a CalgaryWatch /images/ path.');
 if(item.credit!==undefined&&(typeof item.credit!=='string'||item.credit.length>200))throw Error('Keep the image credit under 200 characters.');
 if(item.presentation!==undefined&&item.presentation!=='poster')throw Error('Choose poster presentation or leave it unset.');
 return item as unknown as EntityImage;
}
export function adminListingPatch(entity:DiscoveryEntity,changes:Record<string,unknown>):Record<string,unknown>{
 const {image:primary,images,...ordinary}=changes;
 const patch=Object.keys(ordinary).length?ownerEditPatch(entity,ordinary):{};
 if('image'in changes)patch.image=image(primary);
 if('images'in changes){if(!['business','market'].includes(entity.kind)||!Array.isArray(images)||images.length>30)throw Error('Use up to 30 gallery images for a business or market.');patch.images=images.map(value=>{const result=image(value);if(!result)throw Error('Remove gallery items instead of adding empty images.');return result;});}
 if(!Object.keys(patch).length)throw Error('Change at least one field before saving.');
 return patch;
}
