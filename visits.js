/* Visitor alerts: sends one push notification per visitor per day to the owner's phone (ntfy app).
   Skips bots, the owner's own devices (open the site once with ?owner=1 to mute this device; ?owner=0 to unmute),
   and anything not on the live site. No cookies, no personal data: page, device type, where they came from. */
(()=>{
'use strict';
const TOPIC='ss-portfolio-sh2gtrcxui2m';
try{
 if(!/github\.io$/.test(location.hostname))return;               // only the live website
 const q=new URLSearchParams(location.search);
 if(q.get('owner')==='1')localStorage.setItem('ss-owner','1');
 if(q.get('owner')==='0')localStorage.removeItem('ss-owner');
 if(localStorage.getItem('ss-owner'))return;
 const ua=navigator.userAgent||'';
 if(navigator.webdriver||/bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit|whatsapp/i.test(ua))return;
 const day=new Date().toISOString().slice(0,10);
 if(localStorage.getItem('ss-seen')===day)return;
 localStorage.setItem('ss-seen',day);
 let from='direct link';
 try{if(document.referrer){const h=new URL(document.referrer).hostname.replace(/^www\./,'');if(h&&h!==location.hostname)from=h}}catch(e){}
 const device=/iPad|Tablet/i.test(ua)?'tablet':/Mobi|Android|iPhone/i.test(ua)?'phone':'computer';
 const page=(document.title.split('|')[0]||'Home').trim();
 const city=(Intl.DateTimeFormat().resolvedOptions().timeZone||'').replace(/_/g,' ');
 const msg='Opened "'+page+'" on a '+device+' · came from '+from+(city?' · time zone '+city:'');
 const url='https://ntfy.sh/'+TOPIC+'?'+new URLSearchParams({title:'New visitor on your portfolio',tags:'eyes',click:location.origin+location.pathname});
 fetch(url,{method:'POST',body:msg,keepalive:true,mode:'cors'}).catch(()=>{});
}catch(e){}
})();
