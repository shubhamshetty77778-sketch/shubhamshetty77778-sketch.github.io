/* Services motion graphics: pause the SVG animations while a scene is off screen,
   and hold a still frame for people who prefer reduced motion. */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const svgs=[...document.querySelectorAll('.mg')];
if(!svgs.length)return;
const still=()=>svgs.forEach(s=>{try{s.pauseAnimations();s.setCurrentTime(3.2)}catch(e){}});
if(reduce.matches){still();return}
if('IntersectionObserver' in window){
 const io=new IntersectionObserver(es=>es.forEach(e=>{try{e.isIntersecting&&!document.hidden?e.target.unpauseAnimations():e.target.pauseAnimations()}catch(err){}}),{rootMargin:'100px'});
 svgs.forEach(s=>{try{s.pauseAnimations()}catch(e){}io.observe(s)});
}
reduce.addEventListener&&reduce.addEventListener('change',()=>{if(reduce.matches)still()});
})();
