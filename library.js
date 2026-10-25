/* "Library" bento for the More Work section, built from a Drive-synced list (more/more.json).
   Cards: intro, minutes-of-footage stat, browse button, featured screen that cycles through the wide edits,
   a turning camera lens, landscape / vertical shelves, an "open for projects" toggle, a total count, category chips,
   and a bottom row of tiles that rotate through the rest of the videos. */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const cursor=document.querySelector('.cursor');
const el=(tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mmss=s=>s?Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0'):'';

async function build(root){
 const src=root.dataset.source,coll=root.dataset.collection,key=root.dataset.key;
 const base=src.replace(new RegExp(coll+'/[^/]+$'),'');
 const asset=p=>p&&p.startsWith('/')?base+p.slice(1):p;
 const href=e=>base+'projects/event.html#'+coll+':'+encodeURIComponent(e.id);
 let list=[];
 try{const ctl=new AbortController();setTimeout(()=>ctl.abort(),5000);list=((await fetch(src,{cache:'no-cache',signal:ctl.signal}).then(r=>r.json()))[key]||[]).filter(e=>e.poster)}catch(e){}
 if(!list.length){root.hidden=true;return}
 const wide=list.filter(e=>e.width>e.height),tall=list.filter(e=>!(e.width>e.height));
 const minutes=Math.max(1,Math.round(list.reduce((t,e)=>t+(e.duration||0),0)/60));
 const pill=root.closest('section')&&root.closest('section').querySelector('.lib-pill');
 if(pill)pill.textContent=list.length+' videos · '+wide.length+' landscape · '+tall.length+' vertical';

 const media=(e,cls)=>{
  const s=el('span',cls||'lib-media');
  const img=el('img');img.src=asset(e.poster);img.alt='';img.loading='lazy';img.decoding='async';s.append(img);
  if(e.preview){const v=el('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.dataset.src=asset(e.preview);v.setAttribute('aria-hidden','true');s.append(v)}
  return s;
 };
 const grid=el('div','lib-grid');

 // intro
 grid.append(el('div','lib-card lib-intro',
  '<span class="lib-mark" aria-hidden="true">S</span>'+
  '<p class="lib-lead">Shot, cut<br><em>and finished.</em></p>'+
  '<p class="lib-sub"><b>Editing, VFX and cinematography</b><span>Films, events, reels and stage work</span></p>'));

 // minutes stat with round thumbnails
 const faces=list.slice(0,4).map(e=>'<img src="'+esc(asset(e.poster))+'" alt="" loading="lazy">').join('');
 grid.append(el('div','lib-card lib-count',
  '<span class="lib-num lib-num-warm">'+minutes+'</span><span class="lib-cap">minutes of footage on show</span>'+
  '<span class="lib-faces" aria-hidden="true">'+faces+'<i>+'+(list.length-4)+'</i></span>'));

 // view all
 const cta=el('div','lib-card lib-cta');
 const go=el('a','lib-btn','<span aria-hidden="true">▶</span> Browse every video');go.href='#more-shelf';
 cta.append(go);grid.append(cta);

 // featured screen
 const feat=el('a','lib-card lib-feature');feat.dataset.cursor='PLAY';
 const featList=(wide.length?wide:list).slice(0,8);
 const layers=featList.map((e,i)=>{const m=media(e,'lib-layer'+(i?'':' is-on'));feat.append(m);return m});
 feat.append(el('span','lib-feature-copy','<span class="lib-tag"><span class="lib-rec" aria-hidden="true"></span> Now playing</span><span class="lib-headline">Every frame<br><em>has a story.</em></span>'));
 grid.append(feat);

 // camera lens: knurled barrel turns, the iris opens and closes, glass catches the light
 const ticks=Array.from({length:60},(_,i)=>'<rect x="-1.2" y="-97" width="2.4" height="7" rx="1" transform="rotate('+(i*6)+')"/>').join('');
 const blades=Array.from({length:8},(_,i)=>'<g transform="rotate('+(i*45)+')"><path class="lens-blade" d="M-80,-120 L80,-120 L80,-17 L-80,-17 Z"/></g>').join('');
 const spin=(dur,to)=>reduce.matches?'':'<animateTransform attributeName="transform" type="rotate" from="0" to="'+to+'" dur="'+dur+'" repeatCount="indefinite"/>';
 const irisTurn=reduce.matches?'':'<animateTransform attributeName="transform" type="rotate" values="0;45;0" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="9s" repeatCount="indefinite"/>';
 grid.append(el('div','lib-lens',
  '<svg viewBox="-100 -100 200 200" aria-hidden="true"><defs>'+
  '<radialGradient id="lens-glass" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#3a3f4a"/><stop offset=".45" stop-color="#14171d"/><stop offset="1" stop-color="#040506"/></radialGradient>'+
  '<linearGradient id="lens-blade-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121117"/><stop offset="1" stop-color="#2c2936"/></linearGradient>'+
  '<clipPath id="lens-clip"><circle r="57"/></clipPath>'+
  '</defs>'+
  '<circle r="99" fill="#0d0c12"/><g class="lens-knurl">'+spin('18s',360)+ticks+'</g>'+
  '<circle r="86" fill="#15131c" stroke="#ffffff14"/>'+
    '<circle r="68" fill="#0a0910" stroke="#2c2742" stroke-width="1.5"/>'+
  '<text class="lens-name" y="-60.5" text-anchor="middle">SS CINE 35mm 1:1.4</text>'+
  '<circle r="57" fill="url(#lens-glass)"/>'+
  '<g clip-path="url(#lens-clip)"><g class="lens-iris">'+irisTurn+blades+'</g></g>'+
  '<circle r="57" fill="none" stroke="#000" stroke-width="3"/>'+
  '<g class="lens-shine"><path d="M-34,-36 A48,48 0 0,1 20,-46" stroke="#ffffff55" stroke-width="3" fill="none" stroke-linecap="round"/>'+
  '<circle cx="18" cy="16" r="5" fill="#ff6b3555"/><circle cx="28" cy="26" r="2.5" fill="#ffc09a66"/></g>'+
  '</svg>'));

 // shelves
 const shelf=(cls,items,icon,title,line,target)=>{
  const a=el('a','lib-card lib-shelf '+cls);a.href=target;
  const fan=el('span','lib-fan');fan.setAttribute('aria-hidden','true');
  items.slice(0,3).forEach(e=>{const i=el('img');i.src=asset(e.poster);i.alt='';i.loading='lazy';fan.append(i)});
  a.append(fan,el('span','lib-dot',icon),el('b',null,title),el('span','lib-cap',line));
  return a;
 };
 grid.append(shelf('lib-long',wide,'▶','Landscape',wide.length+' wide-format videos','#more-landscape'));
 grid.append(shelf('lib-short',tall,'<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  'Vertical',tall.length+' videos made for phones','#more-vertical'));

 // open for projects
 grid.append(el('a','lib-card lib-open','<span>Available for<br>new projects</span><span class="lib-recbadge" aria-hidden="true"><i></i>REC</span>'));
 grid.lastChild.href=base+'contact.html';

 // total
 grid.append(el('div','lib-card lib-total','<span class="lib-num lib-num-cool">'+list.length+'</span><span class="lib-bracket">videos in this collection</span>'));

 // categories
 const cats=el('div','lib-card lib-cats','<b>Explore</b><span class="lib-cap">Go to a section of the portfolio.</span>');
 const chips=el('span','lib-chips');
 [['Social Media','category-1'],['Brand Films','category-2'],['Interviews','category-3'],['Digital Ads','category-4'],['Podcasts','category-5'],['Short Films','category-6']]
  .forEach(([t,id],i)=>{if(!document.getElementById(id))return;const c=el('a','lib-chip'+(i===0?' is-hot':''),t);c.href='#'+id;c.style.setProperty('--i',i);chips.append(c)});
 cats.append(chips);grid.append(cats);

 // bottom tiles: rotate through the videos not on the featured screen
 const rest=list.filter(e=>!featList.includes(e));const pool=rest.length>=4?rest:list;
 const tiles=[0,1,2,3].map(k=>{
  const t=el('a','lib-tile');t.dataset.cursor='PLAY';t.dataset.k=pool.length?k%pool.length:0;
  const e=pool[k%pool.length];t.href=href(e);t.append(media(e,'lib-layer is-on'));grid.append(t);return t;
 });

 root.append(grid);

 // ---- behaviour ----
 const play=v=>{if(!v||reduce.matches)return;if(!v.src)v.src=v.dataset.src;const p=v.play();if(p)p.then(()=>v.classList.add('is-playing')).catch(()=>{})};
 const stop=v=>{if(v&&!v.paused)v.pause()};
 let inView=false,fi=0,next=4,timer=0,turn=0;
 feat.href=href(featList[0]);
 function syncVideos(){
  const on=inView&&!document.hidden;
  layers.forEach((L,i)=>{const v=L.querySelector('video');(on&&i===fi?play:stop)(v)});
  tiles.forEach(t=>t.querySelectorAll('.lib-layer').forEach(L=>{const v=L.querySelector('video');(on&&L.classList.contains('is-on')?play:stop)(v)}));
 }
 function step(){
  if(!inView||document.hidden||reduce.matches)return;
  // featured screen: next wide edit
  if(layers.length>1&&turn%2===0){
   layers[fi].classList.remove('is-on');fi=(fi+1)%layers.length;layers[fi].classList.add('is-on');feat.href=href(featList[fi]);
  }
  // one bottom tile swaps to the next video in line
  if(pool.length>4){
   const t=tiles[turn%4],e=pool[next%pool.length];next++;
   const L=media(e,'lib-layer');t.append(L);t.href=href(e);
   requestAnimationFrame(()=>requestAnimationFrame(()=>{L.classList.add('is-on');const old=[...t.querySelectorAll('.lib-layer')].slice(0,-1);
    setTimeout(()=>old.forEach(o=>o.remove()),900)}));
  }
  turn++;syncVideos();
 }
 if('IntersectionObserver' in window){
  new IntersectionObserver(es=>es.forEach(e=>{inView=e.isIntersecting;syncVideos()}),{threshold:.2}).observe(grid);
 }else{inView=true;syncVideos()}
 timer=setInterval(step,2600);
 document.addEventListener('visibilitychange',syncVideos);
 if(cursor)grid.querySelectorAll('.lib-feature,.lib-tile').forEach(a=>{a.addEventListener('pointerenter',()=>cursor.classList.add('is-play'));a.addEventListener('pointerleave',()=>cursor.classList.remove('is-play'))});
 // smooth jump for in-page links
 grid.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const t=document.querySelector(a.getAttribute('href'));if(!t)return;e.preventDefault();t.scrollIntoView({behavior:reduce.matches?'auto':'smooth',block:'start'})});
}
document.querySelectorAll('.lib[data-source]').forEach(build);
})();
