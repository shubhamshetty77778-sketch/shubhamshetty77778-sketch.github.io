/* Work navigation:
   1. a sticky category bar inside the Work section that highlights the section in view and jumps to any of them;
   2. "Back to work" links return to the exact place you left (browser back), or to the right section;
   3. arriving with #category-N lands on that section even while videos above it are still loading. */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const header=document.querySelector('header');
const headH=()=>header?header.getBoundingClientRect().height:0;

// ---- 1. category bar ----
const flow=document.querySelector('.work-flow');
if(flow){
 const cats=[...flow.querySelectorAll('.work-category h2[id]')];
 const short={'Social Media Content':'Social Media','Interviews & Testimonials':'Interviews','More work.':'More Work'};
 const bar=document.createElement('div');bar.className='cat-bar';bar.setAttribute('role','navigation');bar.setAttribute('aria-label','Work categories');
 const track=document.createElement('div');track.className='cat-track';bar.append(track);
 const links=cats.map((h,i)=>{
  const a=document.createElement('a');a.href='#'+h.id;
  const name=h.textContent.trim();a.innerHTML='<span>'+String(i+1).padStart(2,'0')+'</span>'+(short[name]||name);
  track.append(a);return a;
 });
 flow.prepend(bar);
 const setTop=()=>{bar.style.top=Math.round(headH())+'px';document.documentElement.style.setProperty('--cat-offset',Math.round(headH()+bar.offsetHeight+16)+'px')};
 setTop();addEventListener('resize',setTop);
 let userMoved=false,fixT=[];
 const markUser=()=>{userMoved=true};
 addEventListener('wheel',markUser,{passive:true});addEventListener('touchmove',markUser,{passive:true});addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Space','Home','End'].includes(e.code))markUser()});
 const target=h=>h.closest('.work-category').getBoundingClientRect().top+scrollY-headH()-bar.offsetHeight-8;
 // jump, then correct once the smooth scroll ends (videos above may still be loading and shift the page)
 const go=(h,smooth)=>{
  userMoved=false;fixT.forEach(clearTimeout);
  scrollTo({top:target(h),behavior:smooth&&!reduce.matches?'smooth':'auto'});
  fixT=[900,1700,2600].map(t=>setTimeout(()=>{if(!userMoved&&Math.abs(scrollY-target(h))>24)scrollTo({top:target(h),behavior:'auto'})},t));
 };
 links.forEach((a,i)=>a.addEventListener('click',e=>{e.preventDefault();go(cats[i],true);history.replaceState(null,'','#'+cats[i].id)}));
 // highlight the section in view
 let cur=-1;
 const update=()=>{
  const line=headH()+bar.offsetHeight+innerHeight*.25;
  let k=0;cats.forEach((h,i)=>{if(h.closest('.work-category').getBoundingClientRect().top<=line)k=i});
  if(k!==cur){cur=k;links.forEach((a,i)=>{a.classList.toggle('is-on',i===k);if(i===k)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current')});
   const a=links[k];track.scrollTo({left:a.offsetLeft-(track.clientWidth-a.offsetWidth)/2,behavior:reduce.matches?'auto':'smooth'})}
  const r=flow.getBoundingClientRect();bar.classList.toggle('is-stuck',r.top<headH()+2&&r.bottom>headH()+bar.offsetHeight);
 };
 addEventListener('scroll',update,{passive:true});update();

 // ---- remember where you were, and put you back there when you return ----
 try{history.scrollRestoration='manual'}catch(e){}
 const KEY='ss-return:'+location.pathname;
 const save=()=>{
  const line=headH()+bar.offsetHeight+8;let id=null,off=scrollY;
  cats.forEach(h=>{const top=h.closest('.work-category').getBoundingClientRect().top;if(top<=line+innerHeight*.25){id=h.id;off=-(top-line)}});
  const r=flow.getBoundingClientRect();if(r.top>line||r.bottom<line)id=null,off=scrollY;
  try{sessionStorage.setItem(KEY,JSON.stringify({id,off:Math.round(off),y:Math.round(scrollY),t:Date.now()}))}catch(e){}
 };
 addEventListener('pagehide',save);document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a&&!a.getAttribute('href').startsWith('#'))save()},true);
 let back=false;try{const n=performance.getEntriesByType('navigation')[0];back=n&&n.type==='back_forward'}catch(e){}
 let saved=null;try{saved=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch(e){}
 if(back&&saved&&Date.now()-saved.t<3600e3&&!/^#category-\d+$/.test(location.hash)){
  userMoved=false;
  const put=()=>{if(userMoved)return;let y=saved.y;if(saved.id){const h=document.getElementById(saved.id);if(h)y=target(h)+saved.off+8}scrollTo({top:Math.max(0,y),behavior:'auto'})};
  [0,300,900,1800,3000].forEach(t=>setTimeout(put,t));
 }

 // ---- 3. land on #category-N even as content above settles ----
 const m=location.hash.match(/^#category-\d+$/);
 if(m){
  const h=document.getElementById(location.hash.slice(1));
  if(h){userMoved=false;[0,400,1200,2500].forEach(t=>setTimeout(()=>{if(!userMoved)scrollTo({top:target(h),behavior:'auto'})},t))}
 }
}

// ---- 2. back links return to where you were ----
document.querySelectorAll('a[data-back]').forEach(a=>a.addEventListener('click',e=>{
 try{
  const ref=document.referrer&&new URL(document.referrer);
  if(ref&&ref.origin===location.origin&&/\/(index|work)\.html$|\/$/.test(ref.pathname)&&history.length>1){e.preventDefault();history.back()}
 }catch(err){}
}));
})();
