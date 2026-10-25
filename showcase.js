/* Showcases filled from Drive-synced lists:
   .film-showcase  one large screen with the current film's preview, an ambient glow, and a film strip
                   that advances on its own (pauses on hover, offscreen, after interaction, reduced motion)
   .ad-feed        vertical ads shown in phone frames; previews play while they are in view */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const cursor=document.querySelector('.cursor');
const mmss=s=>s?Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0'):'';
const pad=n=>String(n).padStart(2,'0');
const quality=e=>e.width>=3800?'4K':e.width>=1900?'Full HD':e.width>=1200?'HD':'';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n};
async function load(node){
 const src=node.dataset.source,coll=node.dataset.collection,key=node.dataset.key;
 const base=src.replace(new RegExp(coll+'/[^/]+$'),'');
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),5000);
 let list=[];
 try{list=(await fetch(src,{cache:'no-cache',signal:ctl.signal}).then(r=>r.json()))[key]||[]}catch(e){}finally{clearTimeout(t)}
 const asset=p=>p&&p.startsWith('/')?base+p.slice(1):p;
 const href=e=>base+'projects/event.html#'+coll+':'+encodeURIComponent(e.id);
 return {list,asset,href};
}
const play=v=>{if(!v||reduce.matches)return;if(!v.src)v.src=v.dataset.src;const p=v.play();if(p)p.then(()=>v.classList.add('is-playing')).catch(()=>{})};
const stop=v=>{if(!v)return;if(!v.paused)v.pause()};
const playCursor=n=>{if(!cursor)return;n.addEventListener('pointerenter',()=>cursor.classList.add('is-play'));n.addEventListener('pointerleave',()=>cursor.classList.remove('is-play'))};

/* ---------- Brand films: screen + film strip ---------- */
async function filmShowcase(root){
 const {list:all,asset,href}=await load(root);
 const list=all.filter(e=>!(e.height>e.width));
 if(!list.length){root.hidden=true;return}
 const label=root.dataset.label||'Film',cta=root.dataset.cta||'Watch film';
 const n=list.length,DWELL=3500;

 const stage=el('div','fs-stage');
 const glow=el('div','fs-glow');glow.setAttribute('aria-hidden','true');
 const screen=el('a','fs-screen');screen.dataset.cursor='PLAY';
 const layers=list.map(e=>{
  const L=el('span','fs-layer');
  const img=el('img');img.src=asset(e.poster);img.alt='';img.loading='lazy';img.decoding='async';L.append(img);
  if(e.preview){const v=el('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.dataset.src=asset(e.preview);v.setAttribute('aria-hidden','true');L.append(v)}
  screen.append(L);return L;
 });
 const glows=list.map(e=>{const g=el('img');g.src=asset(e.poster);g.alt='';g.loading='lazy';glow.append(g);return g});
 const info=el('span','fs-info');
 const idx=el('span','fs-index'),title=el('b','fs-title'),meta=el('span','fs-meta');
 info.append(idx,title,meta);
 const go=el('span','fs-cta',cta+' ↗');
 screen.append(info,go);
 stage.append(glow,screen);

 const bar=el('div','fs-bar');
 const prev=el('button','reel-nav fs-prev','←');prev.type='button';prev.setAttribute('aria-label','Previous '+label.toLowerCase());
 const next=el('button','reel-nav fs-next','→');next.type='button';next.setAttribute('aria-label','Next '+label.toLowerCase());
 const strip=el('div','fs-strip');strip.setAttribute('role','list');
 const thumbs=list.map((e,i)=>{
  const b=el('button','fs-thumb');b.type='button';b.setAttribute('role','listitem');
  b.setAttribute('aria-label',label+' '+(i+1)+(e.duration?', '+mmss(e.duration):''));
  const img=el('img');img.src=asset(e.poster);img.alt='';img.loading='lazy';img.decoding='async';
  const num=el('span','fs-thumb-n',pad(i+1));const len=el('span','fs-thumb-len',mmss(e.duration));
  const prog=el('span','fs-progress');prog.setAttribute('aria-hidden','true');
  b.append(img,num,len,prog);strip.append(b);
  b.addEventListener('click',()=>{show(i,true)});
  return b;
 });
 bar.append(prev,strip,next);
 root.append(stage,bar);
 root.style.setProperty('--dwell',DWELL+'ms');

 let cur=-1,inView=false,hover=false,lastUser=0,timer=0,started=0;
 let slideT=0;
 // Slide: the new film pushes in from the side it comes from, the old one slides out the other way.
 function slide(from,to,dir){
  clearTimeout(slideT);
  const inL=layers[to],outL=from>=0?layers[from]:null;
  layers.forEach((L,k)=>{if(k!==to&&k!==from){L.className='fs-layer';L.style.transform=''}});
  if(!outL||reduce.matches){layers.forEach((L,k)=>{L.className='fs-layer'+(k===to?' is-active':'');L.style.transform=''});return}
  inL.className='fs-layer is-active is-entering';inL.style.transform='translateX('+(dir*100)+'%)';
  outL.className='fs-layer is-leaving';outL.style.transform='translateX(0)';
  void inL.offsetWidth;
  inL.className='fs-layer is-active is-moving';inL.style.transform='translateX(0)';
  outL.className='fs-layer is-leaving is-moving';outL.style.transform='translateX('+(-dir*35)+'%)';
  slideT=setTimeout(()=>{outL.className='fs-layer';outL.style.transform='';inL.className='fs-layer is-active'},950);
 }
 function show(i,user){
  const dir=i>cur?1:-1;
  i=((i%n)+n)%n;if(i===cur)return;
  const prevI=cur;cur=i;const e=list[i];
  slide(prevI,i,dir);
  glows.forEach((g,k)=>g.classList.toggle('is-active',k===i));
  thumbs.forEach((t,k)=>{t.classList.toggle('is-active',k===i);t.setAttribute('aria-current',k===i?'true':'false')});
  idx.textContent=pad(i+1)+' / '+pad(n);
  title.textContent=e.title;
  meta.textContent=[label,mmss(e.duration),quality(e)].filter(Boolean).join(' · ');
  screen.href=href(e);screen.setAttribute('aria-label',cta+': '+e.title+' ('+(i+1)+' of '+n+')');
  info.classList.remove('is-in');void info.offsetWidth;info.classList.add('is-in');
  // keep the active thumbnail in view inside the strip (without scrolling the page)
  const t=thumbs[i],sl=t.offsetLeft-(strip.clientWidth-t.offsetWidth)/2;
  strip.scrollTo({left:Math.max(0,sl),behavior:reduce.matches||prevI<0?'auto':'smooth'});
  syncVideo();
  if(user)lastUser=performance.now();
  restart();
 }
 function syncVideo(){
  layers.forEach((L,k)=>{const v=L.querySelector('video');if(!v)return;
   if(k===cur&&inView&&!document.hidden)play(v);
   else setTimeout(()=>{if(k!==cur)stop(v)},700);
  });
 }
 const paused=()=>!inView||hover||reduce.matches||document.hidden;
 function restart(){
  // the progress line on the active thumbnail shows the time until the next film
  thumbs.forEach(t=>t.classList.remove('is-timing'));
  clearTimeout(timer);
  if(paused()){root.classList.add('is-paused');return}
  root.classList.remove('is-paused');
  const t=thumbs[cur];void t.offsetWidth;t.classList.add('is-timing');
  const wait=Math.max(DWELL,4500-(performance.now()-lastUser));
  started=performance.now();
  timer=setTimeout(()=>{if(!paused())show(cur+1,false)},wait);
 }
 prev.addEventListener('click',()=>show(cur-1,true));
 next.addEventListener('click',()=>show(cur+1,true));
 root.addEventListener('keydown',e=>{
  if(!e.target.closest('.fs-bar,.fs-screen'))return;
  if(e.key==='ArrowRight'){e.preventDefault();show(cur+1,true);thumbs[cur].focus({preventScroll:true})}
  else if(e.key==='ArrowLeft'){e.preventDefault();show(cur-1,true);thumbs[cur].focus({preventScroll:true})}
 });
 stage.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hover=true;restart()}});
 stage.addEventListener('pointerleave',()=>{if(hover){hover=false;restart()}});
 // swipe on the screen
 let sx=null;
 screen.addEventListener('pointerdown',e=>{sx=e.pointerType==='mouse'?null:e.clientX});
 screen.addEventListener('pointerup',e=>{if(sx==null)return;const dx=e.clientX-sx;sx=null;if(Math.abs(dx)>50){screen.dataset.swiped='1';show(cur+(dx<0?1:-1),true)}});
 screen.addEventListener('click',e=>{if(screen.dataset.swiped){e.preventDefault();delete screen.dataset.swiped}});
 playCursor(screen);

 show(0,false);
 if('IntersectionObserver' in window){
  new IntersectionObserver(es=>es.forEach(en=>{inView=en.isIntersecting;syncVideo();restart()}),{threshold:.35}).observe(stage);
 }else{inView=true;syncVideo();restart()}
 document.addEventListener('visibilitychange',()=>{syncVideo();restart()});
}

/* ---------- Feed ads: phone frames ---------- */
async function adFeed(block){
 const {list:all,asset,href}=await load(block);
 const list=all.filter(e=>!(e.width>e.height));
 const cnt=block.querySelector('.iv-count');
 if(!list.length){block.hidden=true;return}
 if(cnt)cnt.textContent=pad(list.length);
 const row=block.querySelector('.ad-phones');row.dataset.n=String(list.length);
 const label=block.dataset.label||'Feed ad';
 const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(en=>{
  const v=en.target.querySelector('video');(en.isIntersecting&&!document.hidden?play:stop)(v)}),{threshold:.45}):null;
 list.forEach((e,i)=>{
  const a=el('a','ad-phone');a.href=href(e);a.dataset.cursor='PLAY';
  a.setAttribute('aria-label',label+' '+(i+1)+': '+e.title);
  const dev=el('span','ad-device');
  const scr=el('span','ad-screen');
  const img=el('img');img.src=asset(e.poster);img.alt='';img.loading='lazy';scr.append(img);
  if(e.preview){const v=el('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.dataset.src=asset(e.preview);v.setAttribute('aria-hidden','true');scr.append(v)}
  dev.append(scr);
  const meta=el('span','ad-meta');meta.append(el('b',null,e.title),el('small',null,['Vertical',mmss(e.duration)].filter(Boolean).join(' · ')));
  a.append(dev,meta);row.append(a);
  if(io)io.observe(a);else play(a.querySelector('video'));
  playCursor(a);
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)row.querySelectorAll('video').forEach(stop)});
}

document.querySelectorAll('.film-showcase[data-source]').forEach(filmShowcase);
document.querySelectorAll('.ad-feed[data-source]').forEach(adFeed);
})();

/* Any video marked data-autoplay plays (muted) while it is on screen. A .yt-bg slot
   gets a muted, looping YouTube player once it first comes into view. */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const vids=[...document.querySelectorAll('video[data-autoplay]')];
const slots=[...document.querySelectorAll('.yt-bg[data-yt]')];
if(!('IntersectionObserver' in window))return;
const io=new IntersectionObserver(es=>es.forEach(e=>{
 const v=e.target;
 if(e.isIntersecting&&!reduce.matches&&!document.hidden){
  if(!v.src){v.src=v.dataset.src;v.addEventListener('error',()=>v.remove(),{once:true})}
  const p=v.play();if(p)p.then(()=>v.classList.add('is-playing')).catch(()=>{});
 }else if(!v.paused)v.pause();
}),{threshold:.35});
vids.forEach(v=>io.observe(v));
document.addEventListener('visibilitychange',()=>{if(document.hidden)vids.forEach(v=>{if(!v.paused)v.pause()})});
const yo=new IntersectionObserver(es=>es.forEach(e=>{
 if(!e.isIntersecting||reduce.matches)return;
 const s=e.target;yo.unobserve(s);
 const id=s.dataset.yt,start=s.dataset.start||0;
 const f=document.createElement('iframe');
 f.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&mute=1&controls=0&loop=1&playlist='+id+'&playsinline=1&rel=0&modestbranding=1&disablekb=1&iv_load_policy=3&start='+start;
 f.title='';f.tabIndex=-1;f.setAttribute('aria-hidden','true');f.allow='autoplay; encrypted-media';
 f.addEventListener('load',()=>setTimeout(()=>s.classList.add('is-playing'),1200),{once:true});
 s.append(f);
 // cover the frame like object-fit: cover (YouTube is 16:9)
 const fit=()=>{const r=s.getBoundingClientRect(),w=Math.max(r.width,r.height*16/9);f.style.width=w+'px';f.style.height=(w*9/16)+'px'};
 fit();if('ResizeObserver' in window)new ResizeObserver(fit).observe(s);else addEventListener('resize',fit);
}),{threshold:.3});
slots.forEach(s=>yo.observe(s));
})();
