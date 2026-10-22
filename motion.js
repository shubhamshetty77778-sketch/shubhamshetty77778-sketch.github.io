/* Local GSAP 3.13 + ScrollTrigger. All movement is tied to real document scroll.
   CSS supplies readable static compositions if either dependency is unavailable. */
(()=>{
'use strict';
const {gsap,ScrollTrigger}=window;
if(!gsap||!ScrollTrigger)return;
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ignoreMobileResize:true});
let media=null,context=null,refreshFrame=0,mounted=false;
const q=s=>document.querySelector(s),qa=s=>gsap.utils.toArray(s);
const clamp=gsap.utils.clamp(0,1);
function refresh(){cancelAnimationFrame(refreshFrame);refreshFrame=requestAnimationFrame(()=>ScrollTrigger.refresh());}
function mount(){
 if(mounted)return;mounted=true;
 media=gsap.matchMedia();
 media.add({desktop:'(min-width: 761px)',mobile:'(max-width: 760px)',reduce:'(prefers-reduced-motion: reduce)'},match=>{
  const {mobile,reduce}=match.conditions;
  const cleanup=[];
  if(reduce)return;
  document.documentElement.classList.add('motion-ready');
  context=gsap.context(()=>{
   ScrollTrigger.create({id:'page-progress',start:0,end:'max',onUpdate:self=>document.documentElement.style.setProperty('--progress',self.progress)});
   const hero=q('.cinema-hero');
   if(hero){
    // Load reveal and scrub movement operate on different nested elements.
    const opening=gsap.timeline({defaults:{ease:'power3.out'}});
    opening.from('.hero-title h1 .mask-line>span',{yPercent:110,duration:1.1,stagger:.12},0)
     .from('.hero-name,.hero-title p,.hero-explore',{autoAlpha:0,y:15,duration:.8,stagger:.08},.3)
     .from('.holo-face',{opacity:0,duration:1,stagger:.05},0);
    const blades=qa('.iris-blade'),iris={radius:170,rotation:0};
    function drawIris(){
     const point=(radius,angle)=>[Math.cos(angle)*radius,Math.sin(angle)*radius].join(',');
     blades.forEach((blade,i)=>{const a=(i*45+iris.rotation)*Math.PI/180,b=a+Math.PI/4;
      blade.setAttribute('d',`M ${point(iris.radius,a)} L ${point(iris.radius,b)} L ${point(320,b)} L ${point(320,a)} Z`);
     });
    }
    drawIris();
    const t=gsap.timeline({defaults:{ease:'none'},scrollTrigger:{id:'hero-aperture',trigger:hero,start:'top top',end:'bottom top',scrub:true,invalidateOnRefresh:true}});
    t.to(iris,{radius:80,rotation:28,duration:1,onUpdate:drawIris},0)
     .to('.hero-title',{y:mobile?-15:-25,scale:.97,duration:1},0)
     .to('.holo-field',{scale:.94,opacity:.35,duration:1},0)
     .to('.hero-small-label',{opacity:0,duration:.2},0);
    cleanup.push(()=>blades.forEach(blade=>blade.removeAttribute('d')));
   }
   // Image masks keep the title readable while the image cuts into view.
   qa('.filter-grid .project,.film-theme .project').forEach((card,i)=>{
    const target=card.querySelector('.project-image');if(!target)return;
    gsap.fromTo(target,{clipPath:`inset(${mobile?'16% 0%':'22% 8%'} 0% 0%)`,y:mobile?45:85},{clipPath:'inset(0% 0% 0% 0%)',y:0,ease:'power2.out',scrollTrigger:{id:'project-mask-'+i,trigger:card,start:'top 95%',end:'top 42%',scrub:.45,invalidateOnRefresh:true}});
   });
   qa('.featured-story').forEach((card,i)=>gsap.fromTo(card.querySelector('.project-image'),{y:40,clipPath:'inset(8% 0 0 0)'},{y:0,clipPath:'inset(0% 0 0 0)',ease:'none',scrollTrigger:{id:'featured-flow-'+i,trigger:card,start:'top 95%',end:'top 35%',scrub:.4}}));
   qa('.work-scene').forEach((scene,i)=>{
    const object=scene.querySelector('.work-object');
    gsap.fromTo(object,{y:mobile?25:65,rotation:mobile?0:(i%2?-3:3),scale:.93},{y:mobile?-15:-45,rotation:mobile?0:(i%2?2:-2),scale:1,ease:'none',scrollTrigger:{id:'work-flow-'+i,trigger:scene,start:'top bottom',end:'bottom top',scrub:.5,invalidateOnRefresh:true}});
   });
   const chapter=q('.timeline-chapter');
   if(chapter){
    const frames=qa('.edit-preview-frame'),bed=q('.timeline-bed'),strip=q('.timeline-scroll');let active=0;
    const state={progress:0};
    const t=gsap.timeline({defaults:{ease:'none'},scrollTrigger:{id:'editing-sequence',trigger:chapter,start:'top top',end:'bottom bottom',scrub:.4,invalidateOnRefresh:true}});
    t.to('.edit-playhead',{left:'95%',duration:.7},0)
     .to(strip,{x:()=>-(strip.scrollWidth-bed.clientWidth),duration:.7},0)
     .to(state,{progress:1,duration:.7,onUpdate:()=>{
       const p=clamp(state.progress),index=Math.min(frames.length-1,Math.floor(p*frames.length));
       if(index!==active){frames[active].classList.remove('active');frames[index].classList.add('active');active=index;}
       q('.edit-time').textContent='00:'+String(Math.floor(p*20)).padStart(2,'0')+':'+String(Math.floor((p*20%1)*24)).padStart(2,'0');
      }},0);
    t.to('.edit-layers',{opacity:1,duration:.05},.7)
     .to('.layer-0',{xPercent:mobile?-10:-15,yPercent:-28,rotation:-4,duration:.14},.7)
     .to('.layer-1',{xPercent:mobile?8:15,rotation:2,duration:.14},.7)
     .to('.layer-2',{xPercent:mobile?-5:-10,yPercent:28,rotation:4,duration:.14},.7)
     .to('.separated-layer',{xPercent:0,yPercent:0,rotation:0,duration:.15,ease:'power2.inOut'},.84)
     .to('.timeline-bed',{y:60,autoAlpha:0,duration:.15},.84)
     .to('.edit-heading',{y:-30,autoAlpha:0,duration:.15},.84)
     .to('.edit-preview',{scale:mobile?1.12:1.3,y:mobile?-20:-25,duration:.15},.84)
     .to('.edit-layers',{opacity:0,duration:.01},.99)
     .to('.edit-final',{autoAlpha:1,y:-12,duration:.12},.88);

   }
   const reel=q('.reel-chapter');
   if(reel){
    gsap.to('.reel-track',{x:()=>-Math.max(0,q('.reel-track').scrollWidth-innerWidth),ease:'none',scrollTrigger:{id:'horizontal-film-reel',trigger:reel,start:'top top',end:'bottom bottom',scrub:.55,invalidateOnRefresh:true}});
   }
   // Short-film page has a distinct lateral reel, without scroll hijacking.
   const filmstrip=q('.filmstrip-scroll');
   if(filmstrip)gsap.to('.filmstrip-inner',{x:()=>-Math.max(0,q('.filmstrip-inner').scrollWidth-innerWidth),ease:'none',scrollTrigger:{id:'short-films-reel',trigger:filmstrip,start:'top 95%',end:'bottom 5%',scrub:.65,invalidateOnRefresh:true}});
   qa('.about-visual,.photo-stack').forEach((el,i)=>{
    gsap.fromTo(el.querySelector('img'),{yPercent:-12,scale:1.05},{yPercent:0,scale:1,ease:'none',scrollTrigger:{id:'photography-'+i,trigger:el,start:'top bottom',end:'bottom top',scrub:.65}});
   });
   const about=q('.home-about');
   if(about){
    const journey=gsap.timeline({defaults:{ease:'power1.inOut'},scrollTrigger:{id:'about-object-journey',trigger:about,start:'top top',end:'bottom bottom',scrub:.65,invalidateOnRefresh:true}});
    journey.to('.home-about-copy',{y:-70,autoAlpha:0,duration:.3},.05)
     .to('.about-object',{xPercent:mobile?-24:-100,yPercent:mobile?-5:0,scale:mobile?.8:1.02,rotation:mobile?-3:-5,duration:.55},.2)
     .fromTo('.support-one',{xPercent:40,yPercent:15,autoAlpha:0},{xPercent:0,yPercent:0,autoAlpha:1,duration:.4},.35)
     .fromTo('.support-two',{xPercent:50,yPercent:35,autoAlpha:0},{xPercent:0,yPercent:0,autoAlpha:1,duration:.4},.5)
     .fromTo('.about-next',{y:35,autoAlpha:0},{y:0,autoAlpha:1,duration:.3},.6);
   }
   const career=q('.career');
   if(career){
    gsap.fromTo('.career-progress',{scaleY:0},{scaleY:1,ease:'none',scrollTrigger:{id:'career-progress',trigger:career,start:'top 65%',end:'bottom 65%',scrub:.2}});
    qa('.career article').forEach(el=>gsap.fromTo(el.querySelector('div'),{x:mobile?18:65},{x:0,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 90%',end:'top 50%',scrub:.4}}));
   }
   qa('.service-panel').forEach((panel,i)=>{
    const shapes=panel.querySelectorAll('.service-demo i');
    gsap.fromTo(shapes,{y:25,rotation:panel.id==='motion'?-30:0,scaleY:.35},{y:-15,rotation:panel.id==='motion'?90:0,scaleY:1,stagger:.08,ease:'none',scrollTrigger:{id:'service-'+i,trigger:'.service-showcase',start:'top 90%',end:'bottom 10%',scrub:.5}});
   });
   qa('.cinema-ending').forEach(el=>{
    const t=gsap.timeline({scrollTrigger:{id:'contact-finale',trigger:el,start:'top 85%',end:'top 25%',scrub:.5}});
    t.from(el.querySelectorAll('.mask-line>span'),{yPercent:110,rotation:2,stagger:.16,ease:'power2.out'},0);
    gsap.fromTo(el.querySelector('.end-one'),{y:65,rotation:-15},{y:-65,rotation:-5,ease:'none',scrollTrigger:{trigger:el,start:'top bottom',end:'bottom top',scrub:1}});
    gsap.fromTo(el.querySelector('.end-two'),{y:-60,rotation:15},{y:60,rotation:5,ease:'none',scrollTrigger:{trigger:el,start:'top bottom',end:'bottom top',scrub:1}});
   });
   if(!hero){
    const title=q('.page-intro h1');
    if(title){
     const lines=title.querySelectorAll('.mask-line>span');
     if(lines.length)gsap.from(lines,{yPercent:110,rotation:2,stagger:.15,duration:1,ease:'power3.out'});
     else gsap.from(title,{clipPath:'inset(0 0 100% 0)',y:35,duration:1,ease:'power3.out'});
     gsap.to(title,{y:mobile?-20:-65,ease:'none',scrollTrigger:{id:'page-title-scroll',trigger:'.page-intro',start:'top top',end:'bottom top',scrub:.6}});
    }
   }
  });
  refresh();
  return()=>{
   cleanup.forEach(fn=>fn());
   context?.revert();context=null;
   document.documentElement.classList.remove('motion-ready');
   document.documentElement.style.removeProperty('--progress');
   qa('.edit-preview-frame').forEach((el,i)=>el.classList.toggle('active',i===0));
  };
 });
}
function unmount(){cancelAnimationFrame(refreshFrame);media?.revert();media=null;mounted=false;}
// ScrollTrigger handles resize; refresh after fonts, images, filters and disclosures.
document.addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS')refresh()},true);
window.addEventListener('portfolio:layout',refresh);
window.addEventListener('pagehide',unmount);
window.addEventListener('pageshow',()=>{mount();refresh()});
window.addEventListener('load',refresh,{once:true});
mount();
if(document.fonts)document.fonts.ready.then(refresh);
})();
