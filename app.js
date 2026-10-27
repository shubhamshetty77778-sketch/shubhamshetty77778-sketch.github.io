(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)'), fine=matchMedia('(pointer: fine)');
const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('nav');
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus()}});
document.addEventListener('click',e=>{if(!e.target.closest('header')||e.target.closest('nav a'))closeMenu()});
const filters=document.querySelectorAll('[data-filter]'),cards=[...document.querySelectorAll('.filter-grid .project')],count=document.querySelector('.result-count');
function filter(category){const before=new Map(cards.map(c=>[c,c.getBoundingClientRect()]));filters.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===category)));let n=0;cards.forEach(c=>{c.hidden=category!=='All'&&c.dataset.category!==category;if(!c.hidden){n++;c.classList.remove('pending')}});if(count)count.textContent=n+' '+(n===1?'PROJECT':'PROJECTS');window.dispatchEvent(new Event('portfolio:layout'));setTimeout(()=>window.dispatchEvent(new Event('portfolio:layout')),430); if(!reduce.matches)cards.filter(c=>!c.hidden).forEach(c=>{const old=before.get(c),now=c.getBoundingClientRect();c.animate([{opacity:.25,transform:`translate(${old.width?old.left-now.left:0}px,${old.width?old.top-now.top:15}px)`},{opacity:1,transform:'translate(0,0)'}],{duration:400,easing:'cubic-bezier(.2,.7,.2,1)'})});}
filters.forEach(b=>b.addEventListener('click',()=>filter(b.dataset.filter)));if(count)count.textContent=cards.length+' PROJECTS';
const cursor=document.querySelector('.cursor');if(fine.matches&&!reduce.matches){document.addEventListener('pointermove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';const target=e.target.closest('[data-cursor]');cursor.classList.toggle('visible',!!target);if(target)cursor.textContent=target.dataset.cursor});document.addEventListener('pointerleave',()=>cursor.classList.remove('visible'))}
const videos=document.querySelectorAll('.project-image video');videos.forEach(v=>{const a=v.closest('a');a.addEventListener('mouseenter',()=>{if(reduce.matches||!fine.matches)return;v.play().then(()=>v.classList.add('playing')).catch(()=>{});});a.addEventListener('mouseleave',()=>{v.pause();v.classList.remove('playing')})});if('IntersectionObserver' in window){const offscreen=new IntersectionObserver(es=>es.forEach(e=>{if(e.target.tagName==='VIDEO'&&!e.isIntersecting){e.target.pause();e.target.classList.remove('playing')}else if(e.target.classList.contains('service-art'))e.target.classList.toggle('paused',!e.isIntersecting)}));videos.forEach(v=>offscreen.observe(v));document.querySelectorAll('.service-art').forEach(a=>offscreen.observe(a));}
document.addEventListener('visibilitychange',()=>{if(document.hidden)videos.forEach(v=>v.pause())});
const form=document.querySelector('#contact-form');if(form){const type=form.elements.type,status=document.querySelector('#form-status'),copy=document.querySelector('#copy-message');const query=new URLSearchParams(location.search).get('type');if(['project','hire','collaboration'].includes(query))type.value=query;document.querySelectorAll('[data-inquiry]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();type.value=a.dataset.inquiry;history.replaceState(null,'','?type='+type.value+'#contact');form.elements.name.focus()}));let prepared='';form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const f=new FormData(form);const subject=(f.get('type')==='hire'?'Role opportunity':f.get('type')==='project'?'Project inquiry':'Creative collaboration')+' — '+f.get('name');prepared=`Hi Shubham,\n\n${f.get('description')}\n\nName: ${f.get('name')}\nEmail: ${f.get('email')}\nBudget: ${f.get('budget')||'Not specified'}\nTimeline: ${f.get('timeline')||'Not specified'}\n`;const url='mailto:shubhamshetty653@gmail.com?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(prepared);status.textContent='Your draft is ready. Send it from your email app. If no app opened, copy the message and email it to the address shown.';copy.hidden=false;window.location.href=url;});copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(prepared);status.textContent='Message copied. Paste it into an email to shubhamshetty653@gmail.com.'}catch{status.textContent='Copy this message:';const t=document.createElement('textarea');t.value=prepared;t.readOnly=true;t.rows=8;status.append(t);t.select()}});}
// The service showcase progressively enhances ordinary deep links.
const serviceTabs=[...document.querySelectorAll('[data-service]')],servicePanels=[...document.querySelectorAll('.service-panel')];
if(serviceTabs.length){
 const controls=document.querySelector('.service-controls');controls.setAttribute('role','tablist');
 serviceTabs.forEach(tab=>{tab.setAttribute('role','tab');tab.setAttribute('aria-controls',tab.dataset.service)});
 servicePanels.forEach(panel=>panel.setAttribute('role','tabpanel'));
 function chooseService(id,write=false){
  const chosen=servicePanels.find(p=>p.id===id)||servicePanels[0];
  serviceTabs.forEach(t=>{const active=t.dataset.service===chosen.id;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1});
  servicePanels.forEach(p=>p.hidden=p!==chosen);
  if(write)history.replaceState(null,'','#'+chosen.id);
  if(!reduce.matches&&write)chosen.querySelector('.service-picture').animate([{clipPath:'inset(0 0 0 100%)',transform:'translateX(20px)'},{clipPath:'inset(0 0 0 0)',transform:'translateX(0)'}],{duration:550,easing:'cubic-bezier(.2,.7,.2,1)'});
  window.dispatchEvent(new Event('portfolio:layout'));
 }
 serviceTabs.forEach((tab,i)=>{
  tab.addEventListener('click',e=>{e.preventDefault();chooseService(tab.dataset.service,true)});
  tab.addEventListener('keydown',e=>{let next=i;if(e.key==='ArrowRight'||e.key==='ArrowDown')next=(i+1)%serviceTabs.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=(i-1+serviceTabs.length)%serviceTabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=serviceTabs.length-1;else return;e.preventDefault();serviceTabs[next].focus();chooseService(serviceTabs[next].dataset.service,true)});
 });
 chooseService(location.hash.slice(1));
 window.addEventListener('hashchange',()=>chooseService(location.hash.slice(1)));
}
const flip=document.querySelector('.poster-flip');if(flip){
 const poster=flip.closest('.poster-note'),front=poster.querySelector('.poster-front'),back=poster.querySelector('.poster-back');
 poster.classList.add('flip-ready');flip.hidden=false;back.inert=true;back.setAttribute('aria-hidden','true');
 flip.addEventListener('click',()=>{const flipped=flip.getAttribute('aria-pressed')!=='true';flip.setAttribute('aria-pressed',String(flipped));poster.classList.toggle('flipped',flipped);front.inert=flipped;back.inert=!flipped;front.setAttribute('aria-hidden',String(flipped));back.setAttribute('aria-hidden',String(!flipped));flip.textContent=flipped?'Return to the frame ↗':'Reveal film notes ↗';});
}
// Tilt the glass face locally; tapping or keyboard activation reveals its name.
const holoTools=[...document.querySelectorAll('.holo-tool')];
holoTools.forEach(tool=>{
 tool.addEventListener('pointermove',e=>{if(reduce.matches||e.pointerType==='touch')return;const box=tool.getBoundingClientRect();if(!box.width||!box.height)return;tool.style.setProperty('--rx',((.5-(e.clientY-box.top)/box.height)*28)+'deg');tool.style.setProperty('--ry',(((e.clientX-box.left)/box.width-.5)*32)+'deg')});
 tool.addEventListener('pointerleave',()=>{tool.style.removeProperty('--rx');tool.style.removeProperty('--ry')});
 tool.addEventListener('click',()=>{const next=tool.getAttribute('aria-pressed')!=='true';holoTools.forEach(t=>t.setAttribute('aria-pressed','false'));tool.setAttribute('aria-pressed',String(next))});
 tool.addEventListener('keydown',e=>{if(e.key==='Escape')tool.setAttribute('aria-pressed','false')});
});
const loops=[...document.querySelectorAll('.skill-loop,.holo-field,.curved-ribbon')];
if('IntersectionObserver' in window){const visibleLoops=new IntersectionObserver(entries=>entries.forEach(e=>{e.target.dataset.offscreen=String(!e.isIntersecting);e.target.classList.toggle('loops-paused',!e.isIntersecting||document.hidden)}));loops.forEach(el=>visibleLoops.observe(el));}
document.addEventListener('visibilitychange',()=>loops.forEach(el=>el.classList.toggle('loops-paused',document.hidden||el.dataset.offscreen==='true')));
const openingHero=document.querySelector('.reference-opening');
if(openingHero){
 const toggle=openingHero.querySelector('.hero-motion-toggle');toggle.hidden=reduce.matches;
 toggle.addEventListener('click',()=>{const paused=openingHero.classList.toggle('hero-paused');toggle.setAttribute('aria-pressed',String(paused));toggle.textContent=paused?'Resume motion ▷':'Pause motion Ⅱ'});
 reduce.addEventListener('change',()=>{toggle.hidden=reduce.matches});
}
// Open the inline screening room from its project image or title link.
document.addEventListener('click',e=>{
 const link=e.target.closest('a[href^="#details-"]');if(!link)return;
 const target=document.getElementById(link.hash.slice(1)),screen=target?.querySelector('.film-screen');
 if(screen){screen.open=true;window.dispatchEvent(new Event('portfolio:layout'));}
});
// Native range input gives mouse, touch and keyboard scrubbing without scroll hijacking.
const scrubber=document.querySelector('.page-scrubber');
if(scrubber){
 const range=scrubber.querySelector('input'),readout=scrubber.querySelector('output');
 const markers=[...scrubber.querySelectorAll('[data-scrub-chapter]')];
 let sections=[],maxScroll=0,frame=0;
 const clamp=n=>Math.max(0,Math.min(1,n));
 function measure(){
  maxScroll=Math.max(0,document.documentElement.scrollHeight-innerHeight);
  const header=document.querySelector('header')?.getBoundingClientRect().height||80;
  sections=markers.map(a=>({a,id:a.dataset.scrubChapter,start:Math.max(0,document.getElementById(a.dataset.scrubChapter).getBoundingClientRect().top+scrollY-header)}));
  sections.forEach((s,i)=>{const start=clamp(s.start/(maxScroll||1)),end=i===sections.length-1?1:clamp(sections[i+1].start/(maxScroll||1));const clip=scrubber.querySelector('[data-scrub-clip="'+s.id+'"]');clip.style.left=(start*100)+'%';clip.style.width=(Math.max(0,end-start)*100)+'%'});
  sync();
 }
 function sync(){
  frame=0;const p=clamp(scrollY/(maxScroll||1)),percent=Math.round(p*100);
  const current=[...sections].reverse().find(s=>scrollY>=s.start-2)||sections[0];
  range.value=String(Math.round(p*1000));range.disabled=maxScroll===0;
  const timecode=scrubber.querySelector('.editor-timecode');if(timecode){const frames=Math.round(p*60*24);timecode.textContent='00:'+String(Math.floor(frames/1440)).padStart(2,'0')+':'+String(Math.floor(frames/24)%60).padStart(2,'0')+':'+String(frames%24).padStart(2,'0')}
  if(current){readout.value=current.a.textContent.toUpperCase()+' · '+percent+'%';range.setAttribute('aria-valuetext',current.a.textContent+', '+percent+' percent through page');markers.forEach(a=>{if(a===current.a)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(sync)}
 range.addEventListener('input',()=>{maxScroll=Math.max(0,document.documentElement.scrollHeight-innerHeight);window.scrollTo({top:clamp(Number(range.value)/1000)*maxScroll,behavior:'instant'});sync()});
 scrubber.hidden=false;document.body.classList.add('has-page-scrubber');measure();
 const timelineToggle=scrubber.querySelector('.timeline-toggle'),tracks=scrubber.querySelector('.editor-layout');
 let dockTimer=0,hovering=false,dragging=false,lastDockScroll=scrollY;
 function setTimelineCollapsed(collapsed){
  tracks.hidden=false;tracks.inert=collapsed;tracks.setAttribute('aria-hidden',String(collapsed));
  scrubber.classList.toggle('is-collapsed',collapsed);
  document.body.classList.toggle('timeline-collapsed',collapsed);
  timelineToggle.setAttribute('aria-expanded',String(!collapsed));
  timelineToggle.textContent=collapsed?'Timeline ＋':'Dock timeline −';
 }
 function queueDock(){
  clearTimeout(dockTimer);dockTimer=setTimeout(()=>{
   if(!hovering&&!dragging&&!scrubber.contains(document.activeElement))setTimelineCollapsed(true);
  },1300);
 }
 function revealOnScroll(){
  if(matchMedia('(max-width: 760px)').matches)return;   // phones: keep the timeline small while reading
  if(Math.abs(scrollY-lastDockScroll)<1)return;
  lastDockScroll=scrollY;setTimelineCollapsed(false);queueDock();
 }
 setTimelineCollapsed(true);
 timelineToggle.addEventListener('click',()=>{const collapsed=!scrubber.classList.contains('is-collapsed');setTimelineCollapsed(collapsed);if(!collapsed)queueDock()});
 scrubber.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')hovering=true});
 scrubber.addEventListener('pointerleave',()=>{hovering=false;queueDock()});
 scrubber.addEventListener('pointerdown',()=>{dragging=true});
 const releaseDock=()=>{dragging=false;queueDock()};
 addEventListener('pointerup',releaseDock);addEventListener('pointercancel',releaseDock);
 scrubber.addEventListener('focusout',queueDock);
 scrubber.addEventListener('keydown',e=>{if(e.key==='Escape'){timelineToggle.focus();setTimelineCollapsed(true)}});
 addEventListener('scroll',revealOnScroll,{passive:true});
 addEventListener('pagehide',()=>clearTimeout(dockTimer));

 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',measure);addEventListener('load',measure,{once:true});addEventListener('portfolio:layout',measure);addEventListener('pageshow',measure);
 if(document.fonts)document.fonts.ready.then(measure);
 if('ResizeObserver' in window){const sizeObserver=new ResizeObserver(measure);sizeObserver.observe(document.querySelector('main'));}
}
// Optional, brief feedback only after intentional clicks; never on scroll.
if(typeof navigator.vibrate==='function' && matchMedia('(pointer: coarse)').matches){
 let enabled=true,lastPulse=0;
 try{enabled=localStorage.getItem('portfolio-haptics')!=='off'}catch{}
 const toggle=document.createElement('button');toggle.type='button';toggle.className='haptic-toggle';
 function label(){toggle.textContent='Touch feedback: '+(enabled?'on':'off');toggle.setAttribute('aria-pressed',String(enabled))}
 label();document.querySelector('.footer-note')?.append(toggle);
 toggle.addEventListener('click',()=>{enabled=!enabled;label();try{localStorage.setItem('portfolio-haptics',enabled?'on':'off')}catch{};if(!enabled)navigator.vibrate(0)});
 document.addEventListener('click',e=>{if(!enabled||reduce.matches||!e.isTrusted||!e.target.closest('a,button,summary'))return;const now=performance.now();if(now-lastPulse<100)return;lastPulse=now;try{navigator.vibrate(8)}catch{}});
}
// Brief cross-page cut. Native navigation and history remain intact.
document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.download||a.target||reduce.matches)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||u.hash||!u.pathname.endsWith('.html')||u.pathname===location.pathname)return;e.preventDefault();document.body.classList.add('page-exit');setTimeout(()=>location.assign(u.href),270)});addEventListener('pageshow',()=>document.body.classList.remove('page-exit'));
})();
