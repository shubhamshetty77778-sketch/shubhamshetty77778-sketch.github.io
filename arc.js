/* Shorts arc: vertical reels on a concave curve.
   Cards glide between slots (auto, arrows, drag/swipe, keys); visible cards play muted previews;
   theme chips refilter the arc; the arc fans out when it first comes into view. */
(async()=>{
'use strict';
const root=document.querySelector('.shorts-arc');
if(!root)return;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const stage=root.querySelector('.arc-stage'),track=root.querySelector('.arc-track');

// Events come from the Drive sync (events/events.json); they are spread through the arc.
async function loadEvents(){
 const src=root.dataset.events;if(!src)return;
 const base=src.replace(/events\/events\.json$/,'');
 const asset=p=>p&&p.startsWith('/')?base+p.slice(1):p;
 try{
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),4000);
  const data=await fetch(src,{cache:'no-cache',signal:ctl.signal}).then(r=>r.json());clearTimeout(t);
  const made=(data.events||[]).map(e=>{
   const a=document.createElement('a');
   a.className='arc-card';a.href=base+'projects/event.html#'+encodeURIComponent(e.id);a.dataset.theme='events';a.dataset.cursor='PLAY';
   const media=document.createElement('span');media.className='arc-media';
   const img=document.createElement('img');img.src=asset(e.poster);img.alt='';img.loading='lazy';media.append(img);
   if(e.preview){const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.poster=asset(e.poster);v.dataset.src=asset(e.preview);v.setAttribute('aria-hidden','true');media.append(v)}
   const cap=document.createElement('span');cap.className='arc-caption';
   const sm=document.createElement('small');sm.textContent='Events';const b=document.createElement('b');b.textContent=e.title;cap.append(sm,b);
   a.append(media,cap);return a;
  });
  const fixed=[...track.querySelectorAll('.arc-card')],out=[],n=fixed.length+made.length;
  let i=0,j=0;
  for(let k=0;k<n;k++){ // even mix of events and other reels
   const wantEvent=j<made.length&&(i>=fixed.length||(j+1)/(made.length+1)<=(i+1)/(fixed.length+1));
   out.push(wantEvent?made[j++]:fixed[i++]);
  }
  track.append(...out);
 }catch(e){/* the rest of the arc still works without events */}
}
await loadEvents();
const all=[...track.querySelectorAll('.arc-card')];

// Keep chip counts and the reel total in step with what is actually on the arc.
root.querySelectorAll('.arc-chip').forEach(chip=>{
 const f=chip.dataset.filter,n=f==='all'?all.length:all.filter(c=>c.dataset.theme===f).length;
 const sp=chip.querySelector('span');if(sp)sp.textContent=n;chip.hidden=n===0;
});
const eyebrow=root.querySelector('.arc-head .eyebrow');if(eyebrow)eyebrow.textContent='VERTICAL / '+all.length+' REELS';
const prev=root.querySelector('.arc-prev'),next=root.querySelector('.arc-next'),count=root.querySelector('.arc-count');
const controls=root.querySelector('.arc-controls'),chips=[...root.querySelectorAll('.arc-chip')];
const cursor=document.querySelector('.cursor');

let pool=all.slice(),cur=0,geo=null,inView=false,entered=false,hovering=false,timer=0,lastInteract=0;
const wrap=(n,m)=>((n%m)+m)%m;

function measure(){
 const w=stage.clientWidth||root.clientWidth,mobile=innerWidth<=760;
 const slots=mobile?5:(w<1050?5:7);               // cards on the curve
 const span=mobile?w:Math.min(w*.8,1240);           // the arc stays inside this width
 const across=mobile?2.9:(slots===5?5:7.1);         // card widths that span it
 const cardW=Math.max(108,Math.min(220,span/across));
 const stepDeg=mobile?17:(slots===5?15:12.5),step=stepDeg*Math.PI/180;
 const spacing=cardW*(mobile?.86:.96),radius=spacing/Math.sin(step);
 geo={slots,half:Math.floor(slots/2),cardW,stepDeg,step,radius};
 root.style.setProperty('--arc-w',cardW+'px');
 root.style.setProperty('--arc-h',Math.round(cardW*16/9*1.22+40)+'px');
}

function offset(i){ // signed slot distance from the centre card
 const n=pool.length;
 if(n<=geo.slots)return i-(n-1)/2;
 let d=wrap(i-cur,n);if(d>n/2)d-=n;return d;
}

function place(stagger){
 const n=pool.length;
 pool.forEach((card,i)=>{
  const d=offset(i),ad=Math.abs(d),hidden=ad>geo.half+.01;
  const prevD=parseFloat(card.dataset.d??d);
  // a card that wraps from one end to the other travels while invisible
  card.classList.toggle('no-anim',Math.abs(prevD-d)>1.5);
  const dd=hidden?Math.sign(d)*(geo.half+1):d,th=dd*geo.step;
  card.style.setProperty('--x',(geo.radius*Math.sin(th)).toFixed(1)+'px');
  card.style.setProperty('--z',(geo.radius*(1-Math.cos(th))*.85).toFixed(1)+'px');
  card.style.setProperty('--ry',(-dd*geo.stepDeg*.92).toFixed(2)+'deg');
  card.style.setProperty('--s',ad<.5?1.04:1);
  card.style.setProperty('--o',hidden?0:1);
  card.style.setProperty('--b',hidden?1:(1-Math.min(ad,3)*.07).toFixed(2));
  card.style.setProperty('--zi',String(100-Math.round(ad*10)));
  card.style.transitionDelay=stagger?(ad*70)+'ms':'';
  card.dataset.d=d;card.dataset.hidden=String(hidden);
  card.tabIndex=hidden?-1:0;card.setAttribute('aria-hidden',String(hidden));
  card.classList.toggle('is-center',ad<.5);
 });
 all.filter(c=>!pool.includes(c)).forEach(c=>{c.style.setProperty('--o',0);c.style.setProperty('--s',.6);c.dataset.hidden='true';c.tabIndex=-1;c.setAttribute('aria-hidden','true');c.classList.remove('is-center')});
 requestAnimationFrame(()=>pool.forEach(c=>c.classList.remove('no-anim')));
 const rotating=n>geo.slots;
 controls.hidden=!rotating;
 if(rotating)count.textContent=String(wrap(cur,n)+1).padStart(2,'0')+' / '+String(n).padStart(2,'0');
 syncVideos();
}

function syncVideos(){
 all.forEach(card=>{
  const v=card.querySelector('video');if(!v)return;
  const show=inView&&!reduce.matches&&card.dataset.hidden==='false'&&!document.hidden;
  if(show){
   if(!v.src)v.src=v.dataset.src;
   const p=v.play();if(p)p.then(()=>v.classList.add('is-playing')).catch(()=>{});
  }else if(!v.paused){v.pause()}
 });
}

function go(dir,user){
 if(pool.length<=geo.slots)return;
 cur=wrap(cur+dir,pool.length);place(false);
 if(user){lastInteract=performance.now()}
}

// Gentle auto-advance; pauses on hover/focus, after interaction, offscreen, or with reduced motion.
function schedule(){
 clearInterval(timer);
 timer=setInterval(()=>{
  if(!inView||hovering||reduce.matches||document.hidden)return;
  if(root.contains(document.activeElement)&&document.activeElement!==document.body)return;
  if(performance.now()-lastInteract<6000)return;
  go(1,false);
 },3600);
}

prev.addEventListener('click',()=>go(-1,true));
next.addEventListener('click',()=>go(1,true));
root.addEventListener('keydown',e=>{
 if(e.target.closest('.arc-chips'))return;
 if(e.key==='ArrowRight'){e.preventDefault();go(1,true)}
 else if(e.key==='ArrowLeft'){e.preventDefault();go(-1,true)}
});
stage.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')hovering=true});
stage.addEventListener('pointerleave',()=>{hovering=false});

// Clicking a side card brings it to the centre first; clicking the centre card opens it.
track.addEventListener('click',e=>{
 const card=e.target.closest('.arc-card');if(!card)return;
 if(suppress){e.preventDefault();suppress=false;return}
 const d=parseFloat(card.dataset.d);
 if(Math.abs(d)>.5&&pool.length>geo.slots){e.preventDefault();go(Math.round(d),true)}
});

// Drag / swipe: about one card width per step.
let down=null,suppress=false;
stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={x:e.clientX,y:e.clientY,stepped:0}});
addEventListener('pointermove',e=>{
 if(!down)return;
 const dx=e.clientX-down.x;
 if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(e.clientY-down.y))stage.classList.add('is-dragging');
 const want=Math.trunc(-dx/(geo.cardW*.7));
 if(want!==down.stepped){go(want-down.stepped,true);down.stepped=want;suppress=true}
});
addEventListener('pointerup',()=>{if(!down)return;stage.classList.remove('is-dragging');if(!down.stepped)suppress=false;down=null});
addEventListener('pointercancel',()=>{down=null;stage.classList.remove('is-dragging')});
track.addEventListener('dragstart',e=>e.preventDefault());

// Theme filters: fold the arc in, swap the set, fan it back out.
chips.forEach(chip=>chip.addEventListener('click',()=>{
 const f=chip.dataset.filter;
 chips.forEach(c=>c.setAttribute('aria-pressed',String(c===chip)));
 pool.forEach(c=>{c.style.setProperty('--o',0);c.style.setProperty('--s',.85)});
 setTimeout(()=>{
  pool=f==='all'?all.slice():all.filter(c=>c.dataset.theme===f);
  cur=0;pool.forEach(c=>{delete c.dataset.d;c.classList.add('no-anim');c.style.setProperty('--x','0px');c.style.setProperty('--z','0px');c.style.setProperty('--ry','0deg');c.style.setProperty('--o',0)});
  requestAnimationFrame(()=>requestAnimationFrame(()=>{pool.forEach(c=>c.classList.remove('no-anim'));place(true)}));
  lastInteract=performance.now();
 },reduce.matches?0:320);
}));

// The site's cursor reads "PLAY" over cards; give it the light treatment there.
if(cursor){track.addEventListener('pointerover',e=>cursor.classList.toggle('is-play',!!e.target.closest('.arc-card')));track.addEventListener('pointerleave',()=>cursor.classList.remove('is-play'))}

// First view: cards start stacked at the centre and fan out along the curve.
function enter(){
 entered=true;
 if(reduce.matches){place(false);return}
 all.forEach(c=>{c.classList.add('no-anim');c.style.setProperty('--x','0px');c.style.setProperty('--z','-120px');c.style.setProperty('--ry','0deg');c.style.setProperty('--o',0);c.style.setProperty('--s',.8)});
 requestAnimationFrame(()=>requestAnimationFrame(()=>{all.forEach(c=>c.classList.remove('no-anim'));place(true);setTimeout(()=>all.forEach(c=>c.style.transitionDelay=''),1400)}));
}

measure();place(false);schedule();
if('IntersectionObserver' in window){
 new IntersectionObserver(es=>es.forEach(e=>{
  inView=e.isIntersecting;
  if(inView&&!entered)enter();else syncVideos();
 }),{threshold:.25}).observe(stage);
}else{inView=true;entered=true}
addEventListener('resize',()=>{measure();place(false)});
document.addEventListener('visibilitychange',syncVideos);
reduce.addEventListener?.('change',()=>{place(false)});
})();
