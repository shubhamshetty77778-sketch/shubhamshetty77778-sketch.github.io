/* Services: tilt each scene toward the pointer, turn it gently as the page scrolls,
   and play a short real clip inside the editing preview. Pure decoration; skipped with reduced motion. */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const fine=matchMedia('(hover: hover) and (pointer: fine)');
const lowData=(()=>{try{const c=navigator.connection;return !!(c&&(c.saveData||/(^|-)(2g|3g)$/.test(c.effectiveType||'')))}catch(e){return false}})();
const cards=[...document.querySelectorAll('.service-ui')];
if(!cards.length)return;
const base=(document.querySelector('link[href*="style.css"]')||{getAttribute:()=>'/style.css'}).getAttribute('href').replace(/style\.css.*$/,'');

// pointer tilt (desktop)
cards.forEach(card=>{
 const demo=card.querySelector('.ui-demonstration');if(!demo)return;
 const row=card.closest('.service-row')||card;
 row.addEventListener('pointermove',e=>{
  if(reduce.matches||!fine.matches)return;
  const r=card.getBoundingClientRect();
  const x=Math.max(-1,Math.min(1,(e.clientX-(r.left+r.width/2))/(r.width/2)));
  const y=Math.max(-1,Math.min(1,(e.clientY-(r.top+r.height/2))/(r.height/2)));
  demo.style.setProperty('--svc-ry',(-13+x*11).toFixed(2)+'deg');
  demo.style.setProperty('--svc-rx',(8-y*8).toFixed(2)+'deg');
 });
 row.addEventListener('pointerleave',()=>{demo.style.removeProperty('--svc-ry');demo.style.removeProperty('--svc-rx')});
});

// scroll parallax: scenes swing slightly as they pass through the screen
let frame=0;
function scrollTilt(){
 frame=0;if(reduce.matches)return;
 const vh=innerHeight;
 cards.forEach(card=>{
  const r=card.getBoundingClientRect();if(r.bottom<-100||r.top>vh+100)return;
  const t=Math.max(-1,Math.min(1,((r.top+r.height/2)-vh/2)/(vh/2)));
  const demo=card.querySelector('.ui-demonstration');if(!demo)return;
  demo.style.setProperty('--svc-sry',(t*7).toFixed(2)+'deg');
  demo.style.setProperty('--svc-srx',(t*-4).toFixed(2)+'deg');
 });
}
addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(scrollTilt)},{passive:true});
addEventListener('resize',scrollTilt);scrollTilt();

// a real clip in the edit preview, only while it is on screen
const preview=document.querySelector('.ui-edit .ui-preview');
if(preview&&!lowData&&'IntersectionObserver' in window){
 const v=document.createElement('video');
 v.className='ui-preview-video';v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.setAttribute('aria-hidden','true');
 v.dataset.src=base+'assets/brand-films/1BcGNaC_F20ySYMmkMtBh5Kxahdl6qYdH.mp4';
 v.poster=base+'assets/svc/wide.jpg';
 preview.prepend(v);
 new IntersectionObserver(es=>es.forEach(e=>{
  if(e.isIntersecting&&!reduce.matches){if(!v.src)v.src=v.dataset.src;const p=v.play();if(p)p.then(()=>v.classList.add('is-on')).catch(()=>{})}
  else v.pause();
 }),{threshold:.25}).observe(preview);
}
})();
