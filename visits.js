/* Visitor insights for the owner. No cookies and nothing that identifies a person.
   1. Arrival: one push notification per visitor per day (ntfy topic below), as before.
   2. Visit report: while someone browses, a short report of the visit is kept in this tab and sent to a second
      ntfy topic whenever a page is left or hidden: pages seen, time spent with the page in view, which full
      videos they played and for how many seconds, and whether this browser has been here before.
      The hourly job (scripts/visits.py) turns these into the emails and the stats page.
   Skips bots, the owner's own devices (open the site once with ?owner=1, or open /visits.html; ?owner=0 to undo),
   and anything not on the live site. */
(()=>{
'use strict';
const TOPIC='ss-portfolio-sh2gtrcxui2m';          // arrivals (phone notifications)
const REPORTS='ss-portfolio-sh2gtrcxui2m-r';      // visit reports (no notifications)
const store=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}};
const sess=(k,v)=>{try{if(v===undefined)return sessionStorage.getItem(k);sessionStorage.setItem(k,v)}catch(e){return null}};
try{
 if(!/github\.io$/.test(location.hostname))return;               // only the live website
 const q=new URLSearchParams(location.search);
 if(q.get('owner')==='1')store('ss-owner','1');
 if(q.get('owner')==='0')store('ss-owner',null);
 if(store('ss-owner')||/\/visits\.html$/.test(location.pathname))return;
 const ua=navigator.userAgent||'';
 if(navigator.webdriver||/bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|whatsapp/i.test(ua))return;

 const day=new Date().toISOString().slice(0,10);
 const device=/iPad|Tablet/i.test(ua)?'tablet':/Mobi|Android|iPhone/i.test(ua)?'phone':'computer';
 const pageName=()=>(document.title.split('|')[0]||'Home').trim();
 let from='direct link';
 try{if(document.referrer){const h=new URL(document.referrer).hostname.replace(/^www\./,'');if(h&&h!==location.hostname)from=h}}catch(e){}
 const tz=(Intl.DateTimeFormat().resolvedOptions().timeZone||'').replace(/_/g,' ');

 // ---- this visit (one browser tab), kept across page changes in the same tab ----
 let s=null;try{s=JSON.parse(sess('ss-visit')||'null')}catch(e){}
 if(!s){
  const first=store('ss-first');
  const count=(parseInt(store('ss-count')||'0',10)||0)+1;
  if(!first)store('ss-first',day);
  store('ss-count',String(count));
  s={sid:Math.random().toString(36).slice(2,10),day,first:first||day,n:count,from,device,tz,start:Date.now(),active:0,pages:[],videos:{}};
 }
 const save=()=>sess('ss-visit',JSON.stringify(s));
 save();

 // ---- country and state, looked up once per visit from the visitor's network address ----
 // Only the country, state and (for India) city are kept; the address itself is never stored or sent on.
 const place=()=>s.loc&&(s.loc.city?s.loc.city+', ':'')+(s.loc.region?s.loc.region+', ':'')+s.loc.country;
 const locate=()=>{
  if(s.loc!==undefined)return Promise.resolve();
  const get=(url,pick)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),3000);
   return fetch(url,{signal:c.signal,cache:'no-store'}).then(r=>r.json()).then(pick).finally(()=>clearTimeout(t))};
  const clean=v=>typeof v==='string'?v.trim().slice(0,60):'';
  // the city is kept only for visitors in India
  const keep=d=>{const country=clean(d.country);return {country,region:clean(d.region),city:country==='India'?clean(d.city):''}};
  return get('https://get.geojs.io/v1/ip/geo.json',keep)
   .catch(()=>get('https://ipwho.is/?fields=success,country,region,city',d=>d.success===false?null:keep(d)))
   .then(l=>{s.loc=l&&l.country?l:null;save()},()=>{s.loc=null;save()});
 };
 const located=locate();

 // ---- arrival notification, once per visitor per day ----
 let arrive=null;
 if(store('ss-seen')!==day){
  store('ss-seen',day);
  arrive=()=>{arrive=null;
  const again=s.n>1?` · returning (visit ${s.n}, first came ${s.first})`:' · first visit';
  const msg='Opened "'+pageName()+'" on a '+device+' · came from '+from+(tz?' · time zone '+tz:'')+(place()?' · in '+place():'')+again;
  const url='https://ntfy.sh/'+TOPIC+'?'+new URLSearchParams({title:'New visitor on your portfolio',tags:'eyes,v-'+s.sid,click:location.origin+location.pathname});
  fetch(url,{method:'POST',body:msg,keepalive:true,mode:'cors'}).catch(()=>{});
  };
  Promise.all([located,new Promise(r=>setTimeout(r,1500))]).then(()=>arrive&&arrive());   // wait for the place and for video pages to set their title
 }

 // ---- time with the page in view ----
 let shownAt=document.hidden?0:performance.now();
 const tick=()=>{if(shownAt){s.active+=Math.round((performance.now()-shownAt)/1000);shownAt=document.hidden?0:performance.now()}};
 const notePage=()=>{const p=pageName(),last=s.pages[s.pages.length-1];
  if(last==='Video'&&p!=='Video')s.pages[s.pages.length-1]=p;else if(last!==p)s.pages.push(p);   // video pages get their title a moment after loading
  if(s.pages.length>30)s.pages=s.pages.slice(-30)};

 // ---- full videos played (the site's own player; muted previews are not counted) ----
 const watch=new WeakMap();
 const titleOf=v=>((v.getAttribute('aria-label')||pageName()).replace(/\s+—\s+video player$/i,'').trim()).slice(0,80);
 const isFull=v=>v&&v.tagName==='VIDEO'&&v.closest&&v.closest('.ss-player');
 document.addEventListener('play',e=>{const v=e.target;if(!isFull(v))return;
  if(watch.has(v)){watch.get(v).last=v.currentTime;return}       // a resume, not a new play
  const t=titleOf(v),rec=s.videos[t]||(s.videos[t]={s:0,d:Math.round(v.duration||0),plays:0});rec.plays++;
  watch.set(v,{t,last:v.currentTime});save()},true);
 document.addEventListener('timeupdate',e=>{const v=e.target,w=watch.get(v);if(!w||v.paused||v.seeking)return;
  const dt=v.currentTime-w.last;w.last=v.currentTime;
  if(dt>0&&dt<2){const rec=s.videos[w.t];rec.s=Math.round((rec.s+dt)*10)/10;if(v.duration)rec.d=Math.round(v.duration)}},true);
 document.addEventListener('seeked',e=>{const w=watch.get(e.target);if(w)w.last=e.target.currentTime},true);

 // ---- send the visit report whenever the page is hidden or left (the latest one wins) ----
 let lastSent='';
 const report=()=>{
  if(arrive)arrive();                                             // left before the arrival was sent
  tick();notePage();save();
  const body=JSON.stringify({v:1,sid:s.sid,day:s.day,first:s.first,n:s.n,from:s.from,device:s.device,tz:s.tz,country:(s.loc&&s.loc.country)||'',region:(s.loc&&s.loc.region)||'',city:(s.loc&&s.loc.city)||'',
   secs:s.active,span:Math.round((Date.now()-s.start)/1000),pages:s.pages,
   videos:Object.entries(s.videos).map(([t,r])=>({t,s:Math.round(r.s),d:r.d,plays:r.plays}))});
  if(body===lastSent)return;lastSent=body;
  const url='https://ntfy.sh/'+REPORTS+'?'+new URLSearchParams({title:'visit '+s.sid,priority:'1'});
  try{if(navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([body],{type:'text/plain'})))return}catch(e){}
  fetch(url,{method:'POST',body,keepalive:true,mode:'cors'}).catch(()=>{});
 };
 notePage();
 addEventListener('hashchange',()=>setTimeout(()=>{notePage();save()},1500));   // "Next video" changes the page in place
 document.addEventListener('visibilitychange',()=>{if(document.hidden)report();else{shownAt=performance.now()}});
 addEventListener('pagehide',report);
 setInterval(()=>{if(!document.hidden){tick();save()}},15000);
}catch(e){}
})();
