/* Direct video player for the full-length films.
   Each Drive video has an HD copy (up to 1080p) and an SD copy (480p), listed in streams.json.
   Plays HD by default; drops to SD only when the connection is slow (Data Saver, 2G/3G, a low speed estimate,
   or the video keeps stopping to buffer), and goes back to HD once the connection can carry it.
   Falls back to the Google Drive player if the copies are missing or cannot play. */
(()=>{
'use strict';
const css=document.querySelector('link[href*="style.css"]');
const base=css?css.getAttribute('href').replace(/style\.css.*$/,''):'/';
let manifest=null;
const getManifest=()=>manifest||(manifest=fetch(base+'streams.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null));
const conn=()=>{try{return navigator.connection||null}catch(e){return null}};
const slowNet=()=>{const c=conn();return !!(c&&(c.saveData||/(^|-)(2g|3g)$/.test(c.effectiveType||'')))};
const ahead=v=>{const t=v.currentTime,b=v.buffered;for(let i=0;i<b.length;i++)if(b.start(i)<=t+.25&&b.end(i)>=t)return b.end(i)-t;return 0};
const bufEnd=v=>{const t=v.currentTime,b=v.buffered;for(let i=0;i<b.length;i++)if(b.start(i)<=t+.25&&b.end(i)>=t)return b.end(i);return t};
const ids=new WeakMap();

function attach(frame,id,opts){
 opts=opts||{};
 const box=frame._ssBox||frame.closest('.youtube-frame')||frame.parentElement;if(!box)return Promise.resolve();frame._ssBox=box;
 if(box._ssPlayer){box._ssPlayer.destroy();box._ssPlayer=null}
 ids.set(box,id);
 const det0=box.closest('details');
 if(det0){det0.open=true;det0.classList.add('is-direct');document.body.classList.add('ss-direct')}
 return getManifest().then(m=>{
  if(ids.get(box)!==id)return;                       // another video was chosen meanwhile
  const e=m&&m.videos&&m.videos[id];
  if(!e||!e.hd||!e.sd)return;                        // no copies yet: keep the Drive player
  box._ssPlayer=build(box,frame,id,e,m.base,opts);
 });
}

function build(box,frame,id,e,root,opts){
 const url=l=>root+id+'-'+l+'.mp4';
 const load=l=>{v.removeAttribute('src');v.textContent='';const so=document.createElement('source');so.src=url(l);so.type='video/mp4';so.addEventListener('error',()=>v.dispatchEvent(new Event('error')));v.append(so)};
 const w=(e.hd.w||16),h=(e.hd.h||9);
 const wrap=document.createElement('div');wrap.className='ss-player'+(h>w?' is-tall':'');
 wrap.style.setProperty('--ar',w+' / '+h);wrap.style.setProperty('--r',(w/h).toFixed(4));wrap.classList.add('is-paused');
 const v=document.createElement('video');
 v.controls=true;v.playsInline=true;v.preload='metadata';v.setAttribute('controlslist','nodownload');
 if(opts.poster)v.poster=opts.poster;
 if(opts.title)v.setAttribute('aria-label',opts.title);
 const freeze=document.createElement('canvas');freeze.className='ss-freeze';freeze.hidden=true;freeze.setAttribute('aria-hidden','true');
 const chip=document.createElement('button');chip.type='button';chip.className='ss-q';
 wrap.append(v,freeze,chip);
 frame.replaceWith(wrap);box.classList.add('has-ss-player');

 let mode='auto',level=null,downs=0,switching=false,stallT=0,startT=0,stalls=[],played=false,retried=0,dead=false;
 let fill=null,lowRun=0,lastDown=-1e9;
 const timers=new Set();const later=(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn()},ms);timers.add(t);return t};
 const clear=t=>{if(t){clearTimeout(t);timers.delete(t)}};

 function label(){
  const q=level==='hd'?'HD':'SD';
  chip.textContent=mode==='auto'?q+' · Auto':q;
  chip.setAttribute('aria-label','Video quality: '+(level==='hd'?'high':'low')+(mode==='auto'?', chosen automatically':'')+'. Change quality');
  chip.title=mode==='auto'?(level==='hd'?'Playing in HD. Switches to SD only if the connection slows down.':'Playing in SD because the connection is slow. Returns to HD when it can.'):'Quality fixed to '+q+'. Tap for automatic.';
 }
 function startLevel(){
  if(mode!=='auto')return mode;
  if(slowNet())return 'sd';
  const c=conn();if(c&&c.downlink&&c.downlink*1000<e.hd.kbps*1.15)return 'sd';
  return 'hd';
 }
 function setLevel(l,why){
  if(l===level||dead)return;
  const first=level===null,t=v.currentTime,wasPlaying=!v.paused&&!v.ended;
  level=l;label();fill=l==='sd'?{t0:performance.now(),e0:0,t:performance.now(),e:0}:null;lowRun=0;stalls=[];clear(stallT);stallT=0;
  if(first){load(l);return}
  switching=true;
  try{if(v.readyState>=2&&v.videoWidth){freeze.width=v.videoWidth;freeze.height=v.videoHeight;freeze.getContext('2d').drawImage(v,0,0);freeze.hidden=false}}catch(err){}
  load(l);v.load();
  const resume=()=>{v.removeEventListener('loadedmetadata',resume);try{v.currentTime=t}catch(err){}if(wasPlaying){const p=v.play();if(p)p.catch(()=>{})}};
  v.addEventListener('loadedmetadata',resume);
  const done=()=>{if(v.readyState<2)return;switching=false;freeze.hidden=true;v.removeEventListener('seeked',done);v.removeEventListener('playing',done);v.removeEventListener('canplay',done)};
  v.addEventListener('seeked',done);v.addEventListener('playing',done);v.addEventListener('canplay',done);
  later(()=>{switching=false;freeze.hidden=true},8000);
 }
 function down(){if(mode!=='auto'||level!=='hd')return;downs++;lastDown=performance.now();setLevel('sd')}
 function up(){
  if(mode!=='auto'||level!=='sd'||downs>=2||slowNet()||performance.now()-lastDown<30000)return;
  const wasPlaying=!v.paused;setLevel('hd');
  // if HD cannot get going within 6 s, go back to SD and stay there
  if(wasPlaying){let ok=false;const fine=()=>{ok=true};v.addEventListener('playing',fine,{once:true});
   later(()=>{v.removeEventListener('playing',fine);if(!ok&&level==='hd'&&!dead){downs=2;setLevel('sd')}},6000)}
 }

 // waiting = the video ran out of buffered picture
 v.addEventListener('waiting',()=>{
  if(switching||v.paused||mode!=='auto'||level!=='hd')return;
  const since=performance.now();clear(stallT);
  stallT=later(()=>{stallT=0;if(v.readyState<3&&!v.paused)down()},v.seeking?5000:2500);
  const end=()=>{v.removeEventListener('playing',end);const ms=performance.now()-since;clear(stallT);stallT=0;
   if(ms>400&&!v.seeking){const now=performance.now();stalls=stalls.filter(x=>now-x<25000);stalls.push(now);if(stalls.length>=2)down()}};
  v.addEventListener('playing',end);
 });
 // first start: if HD has not begun within 6 s, start in SD instead
 v.addEventListener('play',()=>{
  if(played||level!=='hd'||mode!=='auto')return;
  clear(startT);startT=later(()=>{if(!played&&!v.paused)down()},6000);
 });
 v.addEventListener('playing',()=>{played=true;clear(startT)});
 // on SD, watch how fast video arrives (progress events fire as data comes in);
 // several times faster than HD needs means the link can carry HD, so step back up
 v.addEventListener('progress',()=>{
  if(level!=='sd'||mode!=='auto'||downs>=2||switching||slowNet()||!fill)return;
  const b=v.buffered;if(!b.length)return;
  const end=b.end(b.length-1),now=performance.now();
  if(end>fill.e){if(now-fill.t>2500){fill.t0=now-350;fill.e0=fill.e}fill.t=now;fill.e=end}
  const got=fill.e-fill.e0,span=Math.max(.5,(fill.t-fill.t0)/1000);
  if(got>=8&&got/span*e.sd.kbps>e.hd.kbps*1.8){fill=null;up()}
 });
 v.addEventListener('play',()=>wrap.classList.remove('is-paused'));
 let qT=0;wrap.addEventListener('touchstart',()=>{wrap.classList.add('show-q');clearTimeout(qT);qT=setTimeout(()=>wrap.classList.remove('show-q'),3000)},{passive:true});v.addEventListener('pause',()=>wrap.classList.add('is-paused'));
 // watch how fast the buffer fills: trouble ahead on HD, or room to spare on SD
 const tick=setInterval(()=>{
  if(v.paused||v.ended||switching||mode!=='auto'||v.readyState<1)return;
  const a=ahead(v),end=bufEnd(v),now=performance.now();
  if(level==='hd'){
   if(played&&a<1.5&&v.currentTime>4){lowRun++;if(lowRun>=3)down()}else lowRun=0;
  }
 },1000);
 v.addEventListener('error',()=>{
  if(switching)switching=false;
  if(level==='hd'){downs++;setLevel('sd');return}
  if(retried<1&&v.currentTime>0){retried++;const t=v.currentTime;load(level);v.load();v.addEventListener('loadedmetadata',()=>{v.currentTime=t;v.play().catch(()=>{})},{once:true});return}
  fallback();
 });
 chip.addEventListener('click',()=>{
  mode=mode==='auto'?(level==='hd'?'sd':'hd'):mode==='hd'?'sd':'auto';
  if(mode==='auto'){downs=0;label();const l=startLevel();if(l!==level)setLevel(l);return}
  setLevel(mode);label();
 });
 function fallback(){
  if(dead)return;dead=true;destroy(true);
  wrap.replaceWith(frame);box.classList.remove('has-ss-player');
 }
 function destroy(keepDom){
  if(det)det.removeEventListener('toggle',onToggle);
  clearInterval(tick);timers.forEach(t=>clearTimeout(t));timers.clear();
  try{v.pause();v.textContent='';v.removeAttribute('src');v.load()}catch(err){}
  if(!keepDom&&wrap.isConnected)wrap.replaceWith(frame);
  box.classList.remove('has-ss-player');
 }
 // play when the screen is opened, pause when closed or scrolled far away
 const det=box.closest('details');
 const onToggle=()=>{if(dead)return;if(det.open)start();else v.pause()};
 if(det)det.addEventListener('toggle',onToggle);
 setLevel(startLevel());label();
 const sound=document.createElement('button');sound.type='button';sound.className='ss-sound';sound.hidden=true;sound.textContent='Tap for sound';
 wrap.append(sound);
 sound.addEventListener('click',()=>{v.muted=false;sound.hidden=true;const p=v.play();if(p)p.catch(()=>{})});
 v.addEventListener('volumechange',()=>{if(!v.muted)sound.hidden=true});
 function start(){
  const p=v.play();if(!p)return;
  p.catch(err=>{if(dead||!err||err.name!=='NotAllowedError')return;v.muted=true;sound.hidden=false;v.play().catch(()=>{sound.hidden=true})});
 }
 if(opts.autoplay!==false&&(!det||det.open))start();
 // bring the film into view if the page opened with it low on the screen
 if(opts.autoplay!==false&&(!det||det.open))requestAnimationFrame(()=>{const r=wrap.getBoundingClientRect();
  if(r.top>innerHeight*.35)wrap.scrollIntoView({block:r.height>innerHeight*.8?'end':'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})});
 return {video:v,destroy:()=>{dead=true;destroy(false)}};
}

window.SSPlayer={attach};
// pages with a fixed Drive player
function scan(){
 document.querySelectorAll('.youtube-frame iframe[src*="drive.google.com/file/d/"]').forEach(f=>{
  if(f.dataset.ssManual!==undefined)return;
  const m=f.getAttribute('src').match(/\/file\/d\/([A-Za-z0-9_-]+)/);if(!m)return;
  const img=document.querySelector('.case-media img[src]:not([hidden])');
  attach(f,m[1],{poster:img?img.currentSrc||img.src:'',title:f.title||''});
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
})();
