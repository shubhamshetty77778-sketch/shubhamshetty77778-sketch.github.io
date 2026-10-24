/* Reel sliders: arrow buttons, drag and keyboard sliding, a progress line,
   a film-strip skew while moving, and a staggered entrance per shelf. */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const blocks=[...document.querySelectorAll('.reel-shelf-block')];
if(!blocks.length)return;

blocks.forEach(block=>{
 const shelf=block.querySelector('.reel-shelf'),viewport=block.querySelector('.reel-viewport');
 const controls=block.querySelector('.reel-controls'),prev=block.querySelector('.reel-prev'),next=block.querySelector('.reel-next');
 const count=block.querySelector('.reel-count'),bar=block.querySelector('.reel-progress i');
 const cards=[...shelf.querySelectorAll('.reel-card')];
 if(!shelf||!cards.length)return;

 const step=()=>{const c=cards[0].getBoundingClientRect().width,gap=parseFloat(getComputedStyle(shelf).columnGap)||18;return c+gap};
 const perView=()=>Math.max(1,Math.floor((shelf.clientWidth+4)/step()));
 const behavior=()=>reduce.matches?'auto':'smooth';

 function update(){
  const max=shelf.scrollWidth-shelf.clientWidth,x=shelf.scrollLeft,overflow=max>4;
  if(controls)controls.hidden=!overflow;
  if(prev)prev.disabled=x<=4;
  if(next)next.disabled=x>=max-4;
  viewport?.classList.toggle('has-more',overflow&&x<max-4);
  const first=Math.min(cards.length,Math.round(x/step())+1),last=Math.min(cards.length,first+perView()-1);
  if(count)count.textContent=String(first).padStart(2,'0')+(last>first?'–'+String(last).padStart(2,'0'):'')+' / '+String(cards.length).padStart(2,'0');
  if(bar){const visible=shelf.clientWidth/shelf.scrollWidth;block.style.setProperty('--reel-thumb-w',(visible*100)+'%');bar.style.setProperty('--reel-x',(max>0?(x/max)*((1/visible)-1)*100:0)+'%');}
 }
 const go=dir=>shelf.scrollBy({left:dir*step()*Math.max(1,perView()-1),behavior:behavior()});
 prev?.addEventListener('click',()=>go(-1));
 next?.addEventListener('click',()=>go(1));
 shelf.addEventListener('keydown',e=>{
  if(e.target!==shelf)return;
  if(e.key==='ArrowRight'){e.preventDefault();shelf.scrollBy({left:step(),behavior:behavior()})}
  else if(e.key==='ArrowLeft'){e.preventDefault();shelf.scrollBy({left:-step(),behavior:behavior()})}
  else if(e.key==='Home'){e.preventDefault();shelf.scrollTo({left:0,behavior:behavior()})}
  else if(e.key==='End'){e.preventDefault();shelf.scrollTo({left:shelf.scrollWidth,behavior:behavior()})}
 });

 // Mouse drag to slide; touch keeps native swiping.
 let down=false,dragged=false,startX=0,startLeft=0;
 shelf.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;down=true;dragged=false;startX=e.clientX;startLeft=shelf.scrollLeft});
 addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-startX;if(!dragged&&Math.abs(dx)>6){dragged=true;shelf.classList.add('is-dragging')}if(dragged)shelf.scrollLeft=startLeft-dx});
 addEventListener('pointerup',()=>{if(!down)return;down=false;if(dragged){shelf.classList.remove('is-dragging');const s=step();shelf.scrollTo({left:Math.round(shelf.scrollLeft/s)*s,behavior:behavior()})}});
 shelf.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopPropagation();dragged=false}},true);
 shelf.addEventListener('dragstart',e=>e.preventDefault());

 // Film-strip skew that follows sliding speed and settles back.
 let last=shelf.scrollLeft,skew=0,raf=0;
 function tick(){
  const v=shelf.scrollLeft-last;last=shelf.scrollLeft;
  skew+=((Math.max(-7,Math.min(7,-v*.35)))-skew)*.25;
  if(Math.abs(skew)<.05&&Math.abs(v)<.5){skew=0;shelf.style.setProperty('--reel-skew','0deg');raf=0;return}
  shelf.style.setProperty('--reel-skew',skew.toFixed(2)+'deg');raf=requestAnimationFrame(tick);
 }
 shelf.addEventListener('scroll',()=>{update();if(!reduce.matches&&!raf){last=shelf.scrollLeft;raf=requestAnimationFrame(tick)}},{passive:true});
 addEventListener('resize',update);
 if('ResizeObserver' in window)new ResizeObserver(update).observe(shelf);
 update();
});

// Staggered entrance as each shelf comes into view. Cards stay visible if GSAP is unavailable.
const start=()=>{
 const {gsap,ScrollTrigger}=window;
 if(!gsap||!ScrollTrigger||reduce.matches)return;
 gsap.registerPlugin(ScrollTrigger);
 blocks.forEach(block=>{
  const head=block.querySelector('.reel-shelf-head'),cards=block.querySelectorAll('.reel-card');
  gsap.timeline({scrollTrigger:{trigger:block,start:'top 85%',once:true}})
   .from(head,{y:24,autoAlpha:0,duration:.7,ease:'power3.out'})
   .from(cards,{y:70,rotation:3,autoAlpha:0,duration:.9,stagger:.08,ease:'power3.out',clearProps:'transform,opacity,visibility'},'-=.45');
 });
};
if(document.readyState==='complete')start();else addEventListener('load',start,{once:true});
})();
