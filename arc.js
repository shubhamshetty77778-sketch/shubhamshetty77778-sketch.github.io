/* Video arcs: cards on a concave curve (vertical reels, or wide 16:9 films).
   Positions are driven frame by frame from one continuous value, so gliding, dragging and
   settling are smooth; cards fade at the ends; visible cards play muted previews;
   theme chips refilter the arc; the arc fans out when it first comes into view.
   Cards can come from the page or from a Drive-synced list (data-events / data-source). */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const cursor=document.querySelector('.cursor');
const mmss=s=>s?Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0'):'';

function makeCard(e,base,theme,label,coll){
 const asset=p=>p&&p.startsWith('/')?base+p.slice(1):p;
 const a=document.createElement('a');
 a.className='arc-card'+(e.width>e.height?' is-landscape':'');
 a.href=base+'projects/event.html#'+(coll?coll+':':'')+encodeURIComponent(e.id);a.dataset.theme=theme;a.dataset.cursor='PLAY';
 const media=document.createElement('span');media.className='arc-media';
 const img=document.createElement('img');img.src=asset(e.poster);img.alt='';img.loading='lazy';media.append(img);
 if(e.preview){const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.poster=asset(e.poster);v.dataset.src=asset(e.preview);v.setAttribute('aria-hidden','true');media.append(v)}
 const cap=document.createElement('span');cap.className='arc-caption';
 const sm=document.createElement('small');sm.textContent=label+(coll&&e.duration?' · '+mmss(e.duration):'');
 const b=document.createElement('b');b.textContent=e.title;cap.append(sm,b);
 a.append(media,cap);return a;
}
async function getJSON(src){
 const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),5000);
 try{return await fetch(src,{cache:'no-cache',signal:ctl.signal}).then(r=>r.json())}finally{clearTimeout(t)}
}

async function initArc(root){
const stage=root.querySelector('.arc-stage'),track=root.querySelector('.arc-track');
const wide=root.classList.contains('is-wide');

// Events come from the Drive sync (events/events.json); they are spread through the arc.
async function loadEvents(){
 const src=root.dataset.events;if(!src)return;
 const base=src.replace(/events\/events\.json$/,'');
 try{
  const data=await getJSON(src);
  const made=(data.events||[]).map(e=>makeCard(e,base,'events','Events',''));
  const fixed=[...track.querySelectorAll('.arc-card')],out=[],n=fixed.length+made.length;
  let i=0,j=0;
  for(let k=0;k<n;k++){ // even mix of events and other reels
   const wantEvent=j<made.length&&(i>=fixed.length||(j+1)/(made.length+1)<=(i+1)/(fixed.length+1));
   out.push(wantEvent?made[j++]:fixed[i++]);
  }
  track.append(...out);
 }catch(e){/* the rest of the arc still works without events */}
 // reels added one by one from Drive links (social/social.json) go first, each under its own theme
 const LABEL={cinematic:'Cinematic',interviews:'Interviews & Podcasts',presenter:'Presenter-led',campus:'Campus Life',events:'Events',promos:'Promos & Motion'};
 try{
  const data=await getJSON(base+'social/social.json');
  const made=(data.reels||[]).filter(e=>e.poster).map(e=>{const t=LABEL[e.theme]?e.theme:'cinematic';const c=makeCard(e,base,t,LABEL[t],'social');if(!e.title||e.title==='Social media video')c.querySelector('.arc-caption b').remove();return c});
  track.prepend(...made);
 }catch(e){}
}
// A whole arc filled from a synced Drive folder (e.g. brand-films/films.json).
async function loadSource(){
 const src=root.dataset.source;if(!src)return;
 const coll=root.dataset.collection,key=root.dataset.key,base=src.replace(new RegExp(coll+'/[^/]+$'),'');
 try{
  const data=await getJSON(src),orient=root.dataset.orient;
  let list=data[key]||[];
  if(orient==='portrait')list=list.filter(e=>!(e.width>e.height));
  if(orient==='landscape')list=list.filter(e=>e.width>e.height);
  track.append(...list.map(e=>makeCard(e,base,coll,root.dataset.label||'',coll)));
  // data-hide-title: leave out a placeholder title (e.g. "Student story") on the cards
  const hide=root.dataset.hideTitle;if(hide)track.querySelectorAll('.arc-caption b').forEach(b=>{if(b.textContent===hide)b.remove()});
 }catch(e){}
 const block=root.closest('.iv-block'),n=track.children.length;
 if(!n){root.hidden=true;if(block)block.hidden=true}
 const cnt=block&&block.querySelector('.iv-count');if(cnt)cnt.textContent=String(n).padStart(2,'0');
 // data-fill: repeat a short list around the loop so the curve is full on both sides
 if(root.dataset.fill!=null&&n>=2){
  const orig=[...track.children];root.dataset.base=String(n);
  for(let k=0;track.children.length<10||track.children.length%n;k++){
   const c=orig[k%n].cloneNode(true);c.classList.add('is-clone');track.append(c);
  }
 }
}
await loadEvents();await loadSource();
const all=[...track.querySelectorAll('.arc-card')];

// Keep chip counts and the reel total in step with what is actually on the arc.
root.querySelectorAll('.arc-chip').forEach(chip=>{
 const f=chip.dataset.filter,n=f==='all'?all.length:all.filter(c=>c.dataset.theme===f).length;
 const sp=chip.querySelector('span');if(sp)sp.textContent=n;chip.hidden=n===0;
});
const eyebrow=root.querySelector('.arc-head .eyebrow');if(eyebrow&&root.dataset.events)eyebrow.textContent='SOCIAL MEDIA / '+all.length+' VIDEOS';
const prev=root.querySelector('.arc-prev'),next=root.querySelector('.arc-next'),count=root.querySelector('.arc-count');
const controls=root.querySelector('.arc-controls'),chips=[...root.querySelectorAll('.arc-chip')];

let pool=all.slice(),pos=0,target=0,geo=null,inView=false,entered=false,hovering=false,timer=0,lastInteract=0;
let raf=0,last=0,visibleKey='';
const wrap=(n,m)=>((n%m)+m)%m;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function measure(){
 const w=stage.clientWidth||root.clientWidth,mobile=innerWidth<=760;
 let slots,span,across,cardW,stepDeg,spacing;
 if(wide){                                          // 16:9 films: a big centre screen
  slots=mobile?3:5;
  span=mobile?w:Math.min(w*.98,1600);
  across=mobile?1.08:(w<1050?1.65:1.9);
  cardW=Math.max(300,Math.min(1120,span/across));
  stepDeg=mobile?26:19;spacing=cardW*(mobile?.8:.82);
 }else if(root.dataset.size==='large'&&!mobile){    // fewer, larger reels across the full width
  slots=w<1050?5:7;
  span=Math.min(w*.98,1560);
  across=w<1050?4.1:5.1;
  cardW=Math.max(180,Math.min(280,span/across,(innerHeight-300)*9/16/1.04));
  stepDeg=w<1050?14:12.5;spacing=cardW*.97;
 }else{                                             // vertical reels
  slots=mobile?5:(w<1050?5:7);
  span=mobile?w:Math.min(w*.97,1560);
  across=mobile?2.15:(slots===5?4.1:5.9);
  cardW=Math.max(140,Math.min(300,span/across));
  stepDeg=mobile?17:(slots===5?14.5:12);spacing=cardW*(mobile?.86:.95);
 }
 // a short list of films (e.g. 4) still rotates around a clear centre
 if(wide&&pool.length>=3&&pool.length<=slots)slots=pool.length%2?pool.length:pool.length-1;
 if(wide&&pool.length%2===1&&pool.length<=slots)slots=pool.length;
 // on phones a short list of reels rotates three at a time so every card can be reached
 if(!wide&&mobile&&pool.length>3&&pool.length<=slots)slots=3;
 // an even, short list on a wide screen rotates around a clear centre card
 if(!wide&&!mobile&&pool.length>=4&&pool.length<=slots&&pool.length%2===0)slots=pool.length-1;
 const step=stepDeg*Math.PI/180,radius=spacing/Math.sin(step);
 geo={slots,half:Math.floor(slots/2),cardW,stepDeg,step,radius};
 root.style.setProperty('--arc-w',cardW+'px');
 root.style.setProperty('--arc-h',Math.round(cardW*(wide?9/16:16/9)*1.2+40)+'px');
}
const rotating=()=>pool.length>geo.slots;

function offset(i){ // continuous signed distance from the centre
 const n=pool.length;
 if(!rotating())return i-(n-1)/2;
 let d=wrap(i-pos,n);if(d>n/2)d-=n;return d;
}

function render(){
 const keys=[];
 pool.forEach((card,i)=>{
  const d=offset(i),ad=Math.abs(d),edge=geo.half+.5;
  const fade=rotating()?clamp((edge+.5-ad)/1,0,1):1;   // soft fade across the last half slot
  const dd=clamp(d,-(geo.half+1),geo.half+1),th=dd*geo.step;
  const st=card.style;
  st.setProperty('--x',(geo.radius*Math.sin(th)).toFixed(2)+'px');
  const bend=wide?-1:1;                             // films curve away, reels curve towards you
  st.setProperty('--z',(bend*geo.radius*(1-Math.cos(th))*.85).toFixed(2)+'px');
  st.setProperty('--ry',(-bend*dd*geo.stepDeg*.92).toFixed(3)+'deg');
  st.setProperty('--s',(1+.04*clamp(1-ad,0,1)).toFixed(4));
  st.setProperty('--o',fade.toFixed(3));
  st.setProperty('--b',(1-Math.min(ad,3)*.07).toFixed(3));
  st.zIndex=String(100-Math.round(ad*10));
  const hidden=fade<.05;
  if(card.dataset.hidden!==String(hidden)){card.dataset.hidden=String(hidden);card.tabIndex=hidden?-1:0;card.setAttribute('aria-hidden',String(hidden))}
  card.classList.toggle('is-center',ad<.5);
  card.dataset.d=d.toFixed(3);
  if(!hidden)keys.push(i);
 });
 const n=pool.length;
 controls.hidden=!rotating();
 const base=+root.dataset.base||n;
 if(rotating())count.textContent=String(wrap(Math.round(pos),n)%base+1).padStart(2,'0')+' / '+String(base).padStart(2,'0');
 const key=keys.join(',');if(key!==visibleKey){visibleKey=key;syncVideos()}
}

function hideOthers(){
 all.filter(c=>!pool.includes(c)).forEach(c=>{c.style.setProperty('--o',0);c.style.setProperty('--k',0);c.dataset.hidden='true';c.tabIndex=-1;c.setAttribute('aria-hidden','true');c.classList.remove('is-center')});
}

function syncVideos(){
 all.forEach(card=>{
  const v=card.querySelector('video');if(!v)return;
  const show=inView&&!reduce.matches&&card.dataset.hidden==='false'&&pool.includes(card)&&!document.hidden;
  if(show){
   if(!v.src)v.src=v.dataset.src;
   if(v.paused){const p=v.play();if(p)p.then(()=>v.classList.add('is-playing')).catch(()=>{})}
  }else if(!v.paused){v.pause()}
 });
}

// One animation loop: pos eases towards target with a critically damped glide.
function loop(t){
 const dt=Math.min(.05,(t-(last||t))/1000);last=t;
 if(!dragging){
  const k=reduce.matches?1:1-Math.exp(-dt/.16);
  pos+= (target-pos)*k;
  if(Math.abs(target-pos)<.0008)pos=target;
 }
 render();
 if(dragging||pos!==target){raf=requestAnimationFrame(loop)}else{raf=0;last=0}
}
function kick(){if(!raf){last=0;raf=requestAnimationFrame(loop)}}

function go(dir,user){
 if(!rotating())return;
 target=Math.round(target)+dir;kick();
 if(user)lastInteract=performance.now();
}

// Gentle auto-advance; pauses on hover/focus, after interaction, offscreen, or with reduced motion.
function schedule(){
 clearInterval(timer);
 timer=setInterval(()=>{
  if(!inView||hovering||dragging||reduce.matches||document.hidden)return;
  // hold still only while a keyboard user is on a card, or just after someone moved the arc
  if(document.activeElement&&document.activeElement.classList.contains('arc-card')&&document.activeElement.matches(':focus-visible'))return;
  if(performance.now()-lastInteract<4500)return;
  go(1,false);
 },3800);
}

prev.addEventListener('click',()=>go(-1,true));
next.addEventListener('click',()=>go(1,true));
root.addEventListener('keydown',e=>{
 if(e.target.closest('.arc-chips'))return;
 if(e.key==='ArrowRight'){e.preventDefault();go(1,true)}
 else if(e.key==='ArrowLeft'){e.preventDefault();go(-1,true)}
});
// pause only while the pointer rests on the centre card (the one being watched)
track.addEventListener('pointerover',e=>{if(e.pointerType==='mouse')hovering=!!e.target.closest('.arc-card.is-center')});
stage.addEventListener('pointerleave',()=>{hovering=false});

// Clicking a side card glides it to the centre first; clicking the centre card opens it.
track.addEventListener('click',e=>{
 const card=e.target.closest('.arc-card');if(!card)return;
 if(suppress){e.preventDefault();suppress=false;return}
 const d=parseFloat(card.dataset.d);
 if(Math.abs(d)>.5&&rotating()){e.preventDefault();go(Math.round(d),true)}
});

// Drag / swipe follows the pointer exactly, then settles with momentum.
let down=null,dragging=false,suppress=false;
stage.addEventListener('pointerdown',e=>{if(e.button!==0||!rotating())return;down={x:e.clientX,y:e.clientY,pos,lx:e.clientX,lt:performance.now(),v:0}});
addEventListener('pointermove',e=>{
 if(!down)return;
 const dx=e.clientX-down.x;
 if(!dragging){
  if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(e.clientY-down.y))return;
  dragging=true;suppress=true;stage.classList.add('is-dragging');
 }
 const unit=geo.cardW*.95,now=performance.now(),dtm=Math.max(1,now-down.lt);
 down.v=.8*down.v+.2*(-(e.clientX-down.lx)/unit/(dtm/1000));down.lx=e.clientX;down.lt=now;
 pos=down.pos-dx/unit;target=pos;kick();
});
function release(){
 if(!down)return;
 if(dragging){
  target=Math.round(pos+clamp(down.v*.18,-3,3));
  lastInteract=performance.now();dragging=false;stage.classList.remove('is-dragging');kick();
 }else suppress=false;
 down=null;
}
addEventListener('pointerup',release);addEventListener('pointercancel',release);
track.addEventListener('dragstart',e=>e.preventDefault());

// Theme filters: fold the arc in, swap the set, fan it back out.
function fanIn(cards){
 cards.forEach(c=>{c.style.transitionDelay='0ms';c.style.setProperty('--k',0)});
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  cards.forEach(c=>{c.style.transitionDelay=reduce.matches?'0ms':(Math.min(Math.abs(parseFloat(c.dataset.d)||0),4)*70)+'ms';c.style.setProperty('--k',1)});
 }));
}
chips.forEach(chip=>chip.addEventListener('click',()=>{
 const f=chip.dataset.filter;
 chips.forEach(c=>c.setAttribute('aria-pressed',String(c===chip)));
 pool.forEach(c=>{c.style.transitionDelay='0ms';c.style.setProperty('--k',0)});
 setTimeout(()=>{
  pool=f==='all'?all.slice():all.filter(c=>c.dataset.theme===f);
  pos=target=0;hideOthers();render();fanIn(pool);
  lastInteract=performance.now();
 },reduce.matches?0:380);
}));

// The site's cursor reads "PLAY" over cards; give it the light treatment there.
if(cursor){track.addEventListener('pointerover',e=>cursor.classList.toggle('is-play',!!e.target.closest('.arc-card')));track.addEventListener('pointerleave',()=>cursor.classList.remove('is-play'))}

// First view: cards start folded at the centre and fan out along the curve.
function enter(){entered=true;fanIn(pool);syncVideos()}

measure();
if(wide){const first=pool.findIndex(c=>c.classList.contains('is-landscape'));if(first>0&&rotating())pos=target=first}  // open on a wide film
render();schedule();
all.forEach(c=>c.style.setProperty('--k',reduce.matches?1:0));
if('IntersectionObserver' in window){
 new IntersectionObserver(es=>es.forEach(e=>{
  inView=e.isIntersecting;
  if(inView&&!entered)enter();else syncVideos();
 }),{threshold:.2}).observe(stage);
}else{inView=true;entered=true;all.forEach(c=>c.style.setProperty('--k',1))}
addEventListener('resize',()=>{measure();render()});
document.addEventListener('visibilitychange',syncVideos);
reduce.addEventListener?.('change',()=>{render()});
}
document.querySelectorAll('.shorts-arc').forEach(initArc);

// Landscape videos from a synced list, shown as a grid of large screens (e.g. full interviews).
// The preview plays (muted) whenever a screen is in view.
async function initGrid(block){
 const src=block.dataset.source,coll=block.dataset.collection,key=block.dataset.key;
 const base=src.replace(new RegExp(coll+'/[^/]+$'),''),grid=block.querySelector('.iv-grid');
 const asset=p=>p&&p.startsWith('/')?base+p.slice(1):p;
 let list=[];
 try{list=((await getJSON(src))[key]||[]).filter(e=>e.width>e.height)}catch(e){}
 if(!list.length){block.hidden=true;return}
 grid.dataset.n=String(list.length);
 const cnt=block.querySelector('.iv-count');if(cnt)cnt.textContent=String(list.length).padStart(2,'0');
 const play=v=>{if(reduce.matches)return;if(!v.src)v.src=v.dataset.src;const p=v.play();if(p)p.then(()=>v.classList.add('is-playing')).catch(()=>{})};
 const stop=v=>{if(!v.paused)v.pause();v.classList.remove('is-playing')};
 const touch=true; // previews play whenever they are on screen
 const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(e=>{
  const v=e.target.querySelector('video');if(v)(e.isIntersecting?play:stop)(v)}),{threshold:.6}):null;
 list.forEach(e=>{
  const a=document.createElement('a');a.className='iv-card';a.dataset.cursor='PLAY';
  a.href=base+'projects/event.html#'+coll+':'+encodeURIComponent(e.id);
  const m=document.createElement('span');m.className='iv-media';
  const img=document.createElement('img');img.src=asset(e.poster);img.alt='';img.loading='lazy';m.append(img);
  let v=null;
  if(e.preview){v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.dataset.src=asset(e.preview);v.setAttribute('aria-hidden','true');m.append(v)}
  const btn=document.createElement('span');btn.className='iv-play';btn.setAttribute('aria-hidden','true');btn.textContent='▶';m.append(btn);
  const meta=document.createElement('span');meta.className='iv-meta';
  const b=document.createElement('b');b.textContent=e.title;
  const sm=document.createElement('small');sm.textContent=(block.dataset.label||'Full interview')+(e.duration?' · '+mmss(e.duration):'');
  if(block.dataset.hideTitle&&e.title===block.dataset.hideTitle)meta.append(sm);else meta.append(b,sm);
  a.append(m,meta);grid.append(a);
  if(v&&!touch){a.addEventListener('pointerenter',()=>play(v));a.addEventListener('pointerleave',()=>stop(v));a.addEventListener('focus',()=>play(v));a.addEventListener('blur',()=>stop(v))}
  if(io)io.observe(a);
  if(cursor){a.addEventListener('pointerenter',()=>cursor.classList.add('is-play'));a.addEventListener('pointerleave',()=>cursor.classList.remove('is-play'))}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)grid.querySelectorAll('video').forEach(stop)});
}
document.querySelectorAll('.iv-long[data-source],.ad-video[data-source]').forEach(initGrid);
})();
