/* Inktender Consult — shared data + helpers (v2) */
(function(){
const INK = window.INK = {};

INK.artists = {
  josh:{id:'josh',name:'Josh Lamoureux',first:'Josh',role:'Owner · tattooing since 2008',img:'/img/artist-josh.jpg',
    bio:'Biomech, illustrative and realism. Lives for big colour work and sleeves that grow over years.',
    styles:['Biomech','Illustrative','Realism','Colour']},
  jimmy:{id:'jimmy',name:'Jimmy Munkaspeni',first:'Jimmy',role:'BA Fine Art, Cardiff University',img:'/img/artist-jimmy.jpg',
    bio:'A painter\u2019s eye on skin. Painted realism, cover-ups and portraits.',
    styles:['Painted realism','Cover-ups','Portraits']},
  kent:{id:'kent',name:'Kent King',first:'Kent',role:'Detail-focused, clean execution',img:'/img/artist-kent.jpg',
    bio:'Versatile style adapted to your vision, with clean linework that holds up for decades.',
    styles:['Versatile','Fine detail','Clean lines']}
};

/* Work from @inktender (captions paraphrased from Josh's posts) */
INK.work = [
  {img:'/img/work-18.jpg',t:'Biomech neck add-on, tied into a back piece finished the year before',k:['bio','colour'],tags:['Biomech','Colour']},
  {img:'/img/work-04.jpg',t:'Shelby\u2019s dog portrait with ornamental framing and poppies',k:['portrait','colour'],tags:['Portrait','Colour']},
  {img:'/img/work-06.jpg',t:'Steampunk bio \u201cunzipping\u201d hamstring piece for Amber',k:['bio','bg'],tags:['Biomech']},
  {img:'/img/work-02.jpg',t:'Kevin\u2019s Sunwapta Falls sleeve, a little wolf on the cliff edge. Healed',k:['realism','bg'],tags:['Realism','Healed']},
  {img:'/img/work-16.jpg',t:'Ariana\u2019s Canadian hockey goose. A cover-up, and a stupid amount of fun',k:['cover','colour'],tags:['Cover-up','Colour']},
  {img:'/img/work-19.jpg',t:'Dane\u2019s Pok\u00e9mon and Studio Ghibli sleeve',k:['pop','colour'],tags:['Pop culture','Colour']},
  {img:'/img/work-14.jpg',t:'Kirk\u2019s biomech sleeve, hiding two big tribal cover-ups',k:['bio','cover','bg'],tags:['Biomech','Cover-up']},
  {img:'/img/work-17.jpg',t:'Freehand bio filler on Steven\u2019s neck',k:['bio','colour'],tags:['Freehand','Biomech']},
  {img:'/img/work-11.jpg',t:'Full cover-up and rework sleeve, settled and healed',k:['cover','colour'],tags:['Cover-up','Rework']},
  {img:'/img/work-01.jpg',t:'New colour work built around an existing mask piece',k:['colour','cover'],tags:['Add-on','Colour']},
  {img:'/img/work-23.jpg',t:'Illustrative black and grey, full of character',k:['bg','pop'],tags:['Illustrative','Black & grey']},
  {img:'/img/work-24.jpg',t:'Sword and shield in black and grey realism',k:['realism','bg'],tags:['Realism','Black & grey']},
  {img:'/img/work-26.jpg',t:'Colour leg sleeve: grizzly, blossoms and a toucan',k:['colour'],tags:['Leg sleeve','Colour']},
  {img:'/img/work-10.jpg',t:'Cody\u2019s finished black and grey sleeve',k:['bg','realism'],tags:['Sleeve','Black & grey']},
  {img:'/img/work-22.jpg',t:'Day one of Lance\u2019s biomech leg sleeve: the linework',k:['bio'],tags:['In progress','Biomech']},
  {img:'/img/work-03.jpg',t:'Lance\u2019s biomech leg sleeve, coming together',k:['bio'],tags:['In progress','Biomech']}
];

/* style picker, each backed by a real piece */
INK.styleCards = [
  {v:'Biomech',img:'/img/work-14.jpg'},
  {v:'Realism',img:'/img/work-02.jpg'},
  {v:'Bold colour',img:'/img/work-16.jpg'},
  {v:'Portrait',img:'/img/work-04.jpg'},
  {v:'Black & grey',img:'/img/work-24.jpg'},
  {v:'Pop culture',img:'/img/work-19.jpg'},
  {v:'Illustrative',img:'/img/work-23.jpg'},
  {v:'Freehand / organic',img:'/img/work-17.jpg'}
];

INK.sizes = [
  {l:'Coin',d:'About 1 to 2 in'},
  {l:'Palm',d:'About 3 to 4 in'},
  {l:'Hand',d:'About 5 to 6 in'},
  {l:'Panel',d:'Most of a forearm or calf'},
  {l:'Half sleeve',d:'Shoulder to elbow, or knee down'},
  {l:'Full sleeve',d:'Shoulder to wrist, or a full leg'},
  {l:'Big piece',d:'Back, chest or a full thigh'}
];

INK.studio = {
  address:'#206, 1802 1 St NW, Calgary',
  map:'https://maps.google.com/?q=1802+1+St+NW+%23206+Calgary+AB',
  hours:'11 am to 5 pm, every day',
  phone:'(403) 971-6699', tel:'+14039716699',
  email:'josh@inktender.com',
  ig:'https://www.instagram.com/inktender/', site:'https://www.inktender.com'
};

/* ---------- personal link params:  /c/greg?a=josh&d=2026-11-26T14:00 ---------- */
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
INK.dparts = function(d){
  if(!d) return null; const x=new Date(d); if(isNaN(x)) return null;
  return {
    wd:x.toLocaleDateString('en-CA',{weekday:'long'}),
    wds:x.toLocaleDateString('en-CA',{weekday:'short'}).replace('.',''),
    mon:x.toLocaleDateString('en-CA',{month:'short'}).replace('.',''),
    day:x.getDate(),
    time:/T\d\d:\d\d/.test(d)?x.toLocaleTimeString('en-CA',{hour:'numeric',minute:'2-digit'}).replace(/\./g,'').replace(' ',' ').toUpperCase():''
  };
};
INK.fmtDate = function(d,withTime=true){
  const p=INK.dparts(d); if(!p) return '';
  return p.wds+', '+p.mon+' '+p.day+(withTime&&p.time?' \u00b7 '+p.time:'');
};

/* ---------- storage ---------- */
INK.get = (k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch(e){return f}};
INK.set = (k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}};

/* ---------- hex logo ---------- */
INK.hexPath = 'M301 3 L542 133 L542 428 L301 562 L60 428 L60 133 Z';
INK.hexLogo = function(el){
  el.classList.add('hexlogo');
  el.innerHTML = '<img src="/img/logo-white.png" alt="Inktender" width="600" height="565">'+
    '<svg viewBox="0 0 600 565" aria-hidden="true"><path class="hexpath" pathLength="1000" d="'+INK.hexPath+'"/></svg>';
};

/* ---------- body map: tapered, rounded segments ---------- */
function seg(x1,y1,w1,x2,y2,w2,r){
  r = r||5;
  const a=[x1-w1/2,y1], b=[x1+w1/2,y1], c=[x2+w2/2,y2], d=[x2-w2/2,y2];
  const lerp=(p,q,t)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
  const L=(p,q)=>Math.hypot(q[0]-p[0],q[1]-p[1]);
  const pts=[a,b,c,d]; let s='';
  for(let i=0;i<4;i++){
    const p=pts[i], prev=pts[(i+3)%4], next=pts[(i+1)%4];
    const t1=Math.min(.45,r/L(prev,p)), t2=Math.min(.45,r/L(p,next));
    const s1=lerp(p,prev,t1), s2=lerp(p,next,t2);
    s += (i===0?'M':'L')+s1[0].toFixed(1)+' '+s1[1].toFixed(1)+'Q'+p[0].toFixed(1)+' '+p[1].toFixed(1)+' '+s2[0].toFixed(1)+' '+s2[1].toFixed(1);
  }
  return s+'Z';
}
const M=x=>200-x;
const Z = [
  ['neck',      seg(100,57,22,100,72,27,6),'Neck (front)','Back of neck'],
  ['shoulderR', seg(62,77,24,54,110,22,9),'Right shoulder','Left shoulder'],
  ['chestR',    seg(84,76,30,85,119,30,7),'Right chest','Upper back (left)'],
  ['chestL',    seg(116,76,30,115,119,30,7),'Left chest','Upper back (right)'],
  ['shoulderL', seg(M(62),77,24,M(54),110,22,9),'Left shoulder','Right shoulder'],
  ['ribsR',     seg(73,123,13,76,170,12,5),'Right ribs','Left side'],
  ['stomach',   seg(100,123,32,100,170,32,6),'Stomach','Lower back'],
  ['ribsL',     seg(M(73),123,13,M(76),170,12,5),'Left ribs','Right side'],
  ['hips',      seg(100,174,62,100,204,68,9),'Hips','Glutes'],
  ['armR',      seg(53,114,20,47,151,18,7),'Right upper arm','Back of left arm'],
  ['forearmR',  seg(46,155,18,39,210,14,6),'Right forearm','Left forearm (outer)'],
  ['handR',     seg(38,214,15,35,240,14,6),'Right hand','Back of left hand'],
  ['armL',      seg(M(53),114,20,M(47),151,18,7),'Left upper arm','Back of right arm'],
  ['forearmL',  seg(M(46),155,18,M(39),210,14,6),'Left forearm','Right forearm (outer)'],
  ['handL',     seg(M(38),214,15,M(35),240,14,6),'Left hand','Back of right hand'],
  ['thighR',    seg(84,208,31,87,296,22,9),'Right thigh','Back of left thigh'],
  ['thighL',    seg(116,208,31,113,296,22,9),'Left thigh','Back of right thigh'],
  ['shinR',     seg(87,300,22,88,384,15,7),'Right shin','Left calf'],
  ['shinL',     seg(113,300,22,112,384,15,7),'Left shin','Right calf'],
  ['footR',     seg(88,388,15,84,404,24,5),'Right foot','Left ankle / heel'],
  ['footL',     seg(112,388,15,116,404,24,5),'Left foot','Right ankle / heel']
];
INK.zones = Z;
INK.zoneLabel = function(key){
  const [v,id]=key.split(':'); const z=Z.find(z=>z[0]===id); if(!z) return key;
  return v==='b'?z[3]:z[2];
};
INK.bodySVG = function(view,selected,cls){
  selected = selected||[];
  let s = '<svg class="'+(cls==null?'bm-svg':cls)+'" viewBox="0 0 200 412" role="group" aria-label="'+(view==='b'?'Back':'Front')+' of body">';
  s += '<ellipse class="deco" cx="100" cy="32" rx="17" ry="21"/>';
  s += view==='f'?'<text class="bm-side" x="10" y="410">R</text><text class="bm-side" x="182" y="410">L</text>':'<text class="bm-side" x="10" y="410">L</text><text class="bm-side" x="182" y="410">R</text>';
  Z.forEach(z=>{
    const key=view+':'+z[0]; const on=selected.includes(key); const lab=view==='b'?z[3]:z[2];
    s+='<path class="z'+(on?' sel':'')+'" d="'+z[1]+'" data-k="'+key+'" tabindex="0" role="checkbox" aria-checked="'+on+'" aria-label="'+lab+'"><title>'+lab+'</title></path>';
  });
  return s+'</svg>';
};

/* ---------- the consult sheet (shared by questionnaire preview, review and studio) ---------- */
const E = s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
INK.esc = E;
function kv(rows){ rows=rows.filter(r=>r[1]&&String(r[1]).trim()); return rows.length?'<dl class="kv">'+rows.map(r=>'<dt>'+r[0]+'</dt><dd>'+E(r[1])+'</dd>').join('')+'</dl>':'' }
INK.sheetHTML = function(s,opt){
  opt=opt||{}; s=s||{};
  const A=INK.artists[s.artist];
  const empty = t=>'<span class="blank">'+t+'</span>';
  const meta=[s.consult?'Consult '+INK.fmtDate(s.consult):'',s.phone,s.email,s.contact?'Prefers '+s.contact:''].filter(Boolean);
  const size = s.sizeIdx!=null&&s.sizeIdx!==''&&INK.sizes[s.sizeIdx]? INK.sizes[s.sizeIdx].l+' \u00b7 '+INK.sizes[s.sizeIdx].d : (s.size||'');
  return '<article class="sheet'+(opt.mini?' mini':'')+'">'+
   '<header class="sh-top"><div><h5>Consult sheet'+(A?' \u00b7 '+A.first:(s.artist==='any'?' \u00b7 Match me':''))+'</h5><h2>'+(s.name?E(s.name):empty('Your name'))+'</h2>'+(meta.length?'<div class="meta">'+meta.map(E).join(' \u00b7 ')+'</div>':'')+'</div><img class="logo" src="/img/logo-white.png" alt=""></header>'+
   '<div class="sh-grid"><div>'+
     '<section class="blk"><h5>The piece</h5>'+(s.kind?'<div class="stags"><span>'+E(s.kind)+'</span></div>':'')+(s.idea?'<p class="idea">'+E(s.idea)+'</p>':'<p class="idea">'+empty('Your idea, in your words')+'</p>')+'</section>'+
     (s.story?'<section class="blk"><h5>The story</h5><p>'+E(s.story)+'</p></section>':'')+
     '<section class="blk"><h5>Style</h5><div class="stags">'+((s.styles||[]).map(x=>'<span>'+E(x)+'</span>').join('')+(s.colour?'<span class="inv">'+E(s.colour)+'</span>':'')||empty('Pick a style'))+'</div></section>'+
     '<section class="blk"><h5>References</h5>'+((s.refs||[]).length?'<div class="refs">'+s.refs.map(r=>'<figure><img src="'+r.src+'" alt="">'+(r.note?'<figcaption>'+E(r.note)+'</figcaption>':'')+'</figure>').join('')+'</div>':empty('Reference photos'))+'</section>'+
     kv([['Links',s.links],['Avoid',s.avoid]])+
   '</div><div>'+
     '<section class="blk"><h5>Placement</h5><div class="bm-mini">'+INK.bodySVG('f',s.zones,'')+INK.bodySVG('b',s.zones,'')+'</div><p class="zl">'+((s.zones||[]).length?E(s.zones.map(INK.zoneLabel).join(', ')):empty('Tap the body map'))+'</p></section>'+
     '<section class="blk">'+kv([['Size',size],['Notes',s.sizeNote],['Existing ink',s.existing],['Experience',s.experience]])+'</section>'+
     ((s.spot||[]).length?'<section class="blk"><h5>The spot today</h5><div class="refs">'+s.spot.map(r=>'<figure><img src="'+r.src+'" alt=""></figure>').join('')+'</div></section>':'')+
     '<section class="blk"><h5>Timing &amp; budget</h5>'+(kv([['Budget',s.budget],['Sessions',s.sessions],['Good days',(s.days||[]).join(', ')],['Deadline',s.deadline?(s.deadline+(s.deadlineWhy?' \u00b7 '+s.deadlineWhy:'')):'']])||empty('Budget and timing'))+'</section>'+
     (opt.health!==false?'<section class="blk"><h5>Skin &amp; health \u00b7 private</h5><div class="health">'+(kv([['Skin',(s.skin||[]).join(', ')],['Blood thinners',s.meds],['Allergies',s.allergies],['Other',s.healthOther]])||empty('Quick checks'))+'</div></section>':'')+
   '</div></div>'+
   (opt.notes!=null?'<section class="blk notes"><h5>Consult notes</h5><textarea id="notes" placeholder="Your notes. They save to this sheet and print with it.">'+E(opt.notes)+'</textarea><div class="lines">'+E(opt.notes)+'</div></section>':'')+
   '<footer class="foot"><span>Inktender Studios \u00b7 #206, 1802 1 St NW \u00b7 (403) 971-6699</span><span>'+(s.id?'Sheet '+E(s.id):'Draft')+'</span></footer>'+
  '</article>';
};

/* ---------- misc ---------- */
INK.toast = function(msg){
  let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}
  t.textContent=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),2200);
};
INK.reveal = function(root){
  const els=(root||document).querySelectorAll('.rv:not(.in)');
  if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -6% 0px',threshold:.06});
  els.forEach(e=>io.observe(e));
};
INK.draftBar = function(extra){
  const d=document.createElement('div'); d.className='draft';
  d.innerHTML='<span>Draft for review</span><span class="long">\u00b7 Built for Inktender by Arctos Launchpad \u00b7 '+(extra||'Not live yet')+'</span>';
  document.body.prepend(d);
};
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
INK.reduced = ()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
})();
