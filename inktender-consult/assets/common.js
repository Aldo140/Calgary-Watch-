/* Inktender Consult — shared data + helpers */
(function(){
const INK = window.INK = {};

INK.artists = {
  josh:{id:'josh',name:'Josh Lamoureux',first:'Josh',role:'Owner · Tattooing since 2008',img:'/img/artist-josh.jpg',
    bio:'Owner and tattoo artist. Specializes in biomech, illustrative and realism, and loves big colour work and sleeves that grow over years.',
    styles:['Biomech','Illustrative','Realism','Colour']},
  jimmy:{id:'jimmy',name:'Jimmy Munkaspeni',first:'Jimmy',role:'BA Fine Art, Cardiff University',img:'/img/artist-jimmy.jpg',
    bio:'Brings a painter\u2019s eye to skin. Specializes in painted realism, cover-ups and portraits.',
    styles:['Painted realism','Cover-ups','Portraits']},
  kent:{id:'kent',name:'Kent King',first:'Kent',role:'Detail-focused, clean execution',img:'/img/artist-kent.jpg',
    bio:'Versatile style adapted to your vision, with the kind of clean, careful linework that holds up for decades.',
    styles:['Versatile','Fine detail','Clean lines']}
};

/* Work pulled from @inktender on Instagram (captions paraphrased from Josh's posts) */
INK.work = [
  {img:'/img/work-18.jpg',t:'Biomech neck add-on, tied into a back piece finished the year before',k:['bio','colour'],tags:['Biomech','Colour']},
  {img:'/img/work-04.jpg',t:'Shelby\u2019s dog portrait with ornamental framing and poppies',k:['portrait','colour'],tags:['Portrait','Colour']},
  {img:'/img/work-06.jpg',t:'Steampunk bio \u201cunzipping\u201d hamstring piece for Amber',k:['bio','bg'],tags:['Biomech']},
  {img:'/img/work-02.jpg',t:'Kevin\u2019s Sunwapta Falls sleeve with a little wolf on the cliff edge, healed',k:['realism','bg'],tags:['Realism','Healed']},
  {img:'/img/work-16.jpg',t:'Ariana\u2019s Canadian hockey goose. A cover-up, and a stupid amount of fun',k:['cover','colour'],tags:['Cover-up','Colour']},
  {img:'/img/work-19.jpg',t:'Dane\u2019s Pok\u00e9mon and Studio Ghibli sleeve',k:['pop','colour'],tags:['Pop culture','Colour']},
  {img:'/img/work-14.jpg',t:'Kirk\u2019s biomech sleeve, with a couple of big tribal cover-ups inside it',k:['bio','cover','bg'],tags:['Biomech','Cover-up']},
  {img:'/img/work-17.jpg',t:'Freehand bio filler on Steven\u2019s neck',k:['bio','colour'],tags:['Freehand','Biomech']},
  {img:'/img/work-11.jpg',t:'Full cover-up and rework sleeve, settled and healed',k:['cover','colour'],tags:['Cover-up','Rework']},
  {img:'/img/work-01.jpg',t:'New colour work designed to fit around an existing mask piece',k:['colour','cover'],tags:['Add-on','Colour']},
  {img:'/img/work-23.jpg',t:'Illustrative black and grey, full of character',k:['bg','pop'],tags:['Illustrative','Black & grey']},
  {img:'/img/work-24.jpg',t:'Sword and shield in black and grey realism',k:['realism','bg'],tags:['Realism','Black & grey']},
  {img:'/img/work-26.jpg',t:'Colour leg sleeve: grizzly, blossoms and a toucan',k:['colour'],tags:['Leg sleeve','Colour']},
  {img:'/img/work-10.jpg',t:'Cody\u2019s finished black and grey sleeve',k:['bg','realism'],tags:['Sleeve','Black & grey']},
  {img:'/img/work-22.jpg',t:'Day one of Lance\u2019s biomech leg sleeve: the linework',k:['bio'],tags:['In progress','Biomech']},
  {img:'/img/work-03.jpg',t:'Lance\u2019s biomech leg sleeve, coming together',k:['bio'],tags:['In progress','Biomech']}
];

INK.studio = {
  address:'#206, 1802 1 St NW, Calgary, AB T2M 2T2',
  map:'https://maps.google.com/?q=1802+1+St+NW+%23206+Calgary+AB',
  hours:'11 am to 5 pm, Monday to Sunday',
  phone:'(403) 971-6699', tel:'+14039716699',
  email:'josh@inktender.com',
  ig:'https://www.instagram.com/inktender/', site:'https://www.inktender.com'
};

/* ---------- personal link params ----------
   /c/greg?a=josh&d=2026-11-26T14:00  or  /?n=Greg&a=josh&d=... */
INK.params = function(){
  const u = new URL(location.href);
  let n = u.searchParams.get('n') || '';
  const m = location.pathname.match(/^\/c\/([^\/?#]+)/);
  if(m && !n) n = decodeURIComponent(m[1]).replace(/[-_]+/g,' ');
  n = n.trim().slice(0,40).replace(/\b\w/g,c=>c.toUpperCase());
  const a = (u.searchParams.get('a')||'').toLowerCase();
  const d = u.searchParams.get('d')||'';
  return {name:n, artist:INK.artists[a]?a:'', date:d};
};
INK.qs = function(p){
  const s = new URLSearchParams();
  if(p.name) s.set('n',p.name); if(p.artist) s.set('a',p.artist); if(p.date) s.set('d',p.date);
  const q = s.toString(); return q?('?'+q):'';
};
INK.fmtDate = function(d,withTime=true){
  if(!d) return ''; const x = new Date(d); if(isNaN(x)) return '';
  const o = {weekday:'short',month:'short',day:'numeric'};
  let s = x.toLocaleDateString('en-CA',o).replace(/\./g,'');
  if(withTime && /T\d\d:\d\d/.test(d)) s += ' \u00b7 ' + x.toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit'}).replace(/\./g,'').replace(':00','');
  return s;
};

/* ---------- storage (draft preview keeps everything in this browser) ---------- */
INK.get = (k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch(e){return f}};
INK.set = (k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};

/* ---------- hex outline matching the logo ---------- */
INK.hexPath = 'M301 3 L542 133 L542 428 L301 562 L60 428 L60 133 Z';
INK.hexLogo = function(el){
  el.classList.add('hexlogo');
  el.innerHTML = '<img src="/img/logo-white.png" alt="Inktender" width="600" height="565" style="width:100%;height:100%;object-fit:contain">'+
    '<svg viewBox="0 0 600 565" aria-hidden="true"><path class="hexpath" pathLength="1000" d="'+INK.hexPath+'"/></svg>';
};

/* ---------- body map ---------- */
const Z = [ // id, shape, front label, back label
  ['neck','M89 58h22v18h-22z','Neck (front)','Back of neck'],
  ['chestR','M60 80q0-6 6-6h31v44h-31q-6 0-6-6z','Chest (right)','Upper back (left)'],
  ['chestL','M103 74h31q6 0 6 6v32q0 6-6 6h-31z','Chest (left)','Upper back (right)'],
  ['ribsR','M60 121h20v52h-14q-6 0-6-6z','Ribs (right)','Side (left)'],
  ['stomach','M83 121h34v52h-34z','Stomach','Lower back'],
  ['ribsL','M120 121h20v46q0 6-6 6h-14z','Ribs (left)','Side (right)'],
  ['hips','M64 176h72v22q0 8-8 8h-56q-8 0-8-8z','Hips','Glutes'],
  ['shoulderR','M38 82q2-10 18-8v40h-22z','Right shoulder','Left shoulder'],
  ['armR','M33 117h22l-3 30h-21z','Right upper arm','Back of left arm'],
  ['forearmR','M30 150h21l-4 56h-21z','Right forearm','Left forearm (outer)'],
  ['handR','M25 209h21l-2 24q-1 6-8 6h-6q-6 0-6-6z','Right hand','Left hand (back)'],
  ['shoulderL','M144 74q16-2 18 8l4 32h-22z','Left shoulder','Right shoulder'],
  ['armL','M145 117h22l2 30h-21z','Left upper arm','Back of right arm'],
  ['forearmL','M149 150h21l4 56h-21z','Left forearm','Right forearm (outer)'],
  ['handL','M154 209h21l1 24q0 6-6 6h-6q-7 0-8-6z','Left hand','Right hand (back)'],
  ['thighR','M66 209h31v84h-27z','Right thigh','Back of left thigh'],
  ['thighL','M103 209h31l-4 84h-27z','Left thigh','Back of right thigh'],
  ['shinR','M70 297h27v86h-24z','Right shin','Left calf'],
  ['shinL','M103 297h27l-3 86h-24z','Left shin','Right calf'],
  ['footR','M72 387h25v14q0 5-5 5h-24q-4 0-2-5z','Right foot','Left heel / ankle'],
  ['footL','M103 387h25l6 14q2 5-2 5h-24q-5 0-5-5z','Left foot','Right heel / ankle']
];
INK.zones = Z;
INK.zoneLabel = function(key){ // key like "f:forearmR"
  const [v,id]=key.split(':'); const z=Z.find(z=>z[0]===id); if(!z) return key;
  return v==='b'?z[3]:z[2];
};
INK.bodySVG = function(view,selected,cls){
  selected = selected||[];
  let s = '<svg class="'+(cls||'bm-svg')+'" viewBox="0 0 200 412" role="group" aria-label="'+(view==='b'?'Back':'Front')+' of body">';
  s += '<ellipse class="deco" cx="100" cy="30" rx="19" ry="24"/>';
  if(view==='f') s+='<text class="bm-side" x="8" y="408">R</text><text class="bm-side" x="186" y="408">L</text>';
  else s+='<text class="bm-side" x="8" y="408">L</text><text class="bm-side" x="186" y="408">R</text>';
  Z.forEach(z=>{
    const key=view+':'+z[0]; const on=selected.includes(key);
    const lab = view==='b'?z[3]:z[2];
    s+='<path class="z'+(on?' sel':'')+'" d="'+z[1]+'" data-k="'+key+'" tabindex="0" role="checkbox" aria-checked="'+on+'" aria-label="'+lab+'"><title>'+lab+'</title></path>';
  });
  return s+'</svg>';
};

/* ---------- misc ---------- */
INK.toast = function(msg){
  let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.textContent=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),2200);
};
INK.reveal = function(){
  const els=document.querySelectorAll('.rv,.wipe');
  if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px',threshold:.08});
  els.forEach(e=>io.observe(e));
};
INK.esc = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
INK.arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
INK.draftBar = function(extra){
  const d=document.createElement('div'); d.className='draft';
  d.innerHTML='<span>Draft for review</span><span class="long">\u00b7 Built for Inktender by Arctos Launchpad \u00b7 '+(extra||'Not live yet')+'</span>';
  document.body.prepend(d);
};

/* downscale an uploaded image so a sheet stays small */
INK.shrink = function(file,max=900,q=.74){
  return new Promise((res,rej)=>{
    const r=new FileReader(); r.onerror=rej;
    r.onload=()=>{const im=new Image(); im.onerror=rej; im.onload=()=>{
      const k=Math.min(1,max/Math.max(im.width,im.height)); const c=document.createElement('canvas');
      c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',q));
    }; im.src=r.result};
    r.readAsDataURL(file);
  });
};
})();
