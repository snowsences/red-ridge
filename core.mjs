export const OWNER='SRoia3s1D1gDnKvlCLlY4lBNMri1';
export const DEFAULT_CONFIG={"apiKey":"AIzaSyDWmZ9j59AtwlDwDs3h4Cnicpwr9GzUTIc","authDomain":"red-ridge-d47fa.firebaseapp.com","projectId":"red-ridge-d47fa","storageBucket":"red-ridge-d47fa.firebasestorage.app","messagingSenderId":"205683869190","appId":"1:205683869190:web:103bd8950553767dc02587"};
export const PALETTES={recipes:['#b95443','#bd5e46','#ba6845','#b57448','#af7b4b','#a78051'],notes:['#735295','#785792','#7e5c90','#83608b','#886586'],cars:['#365f90','#3a6b99','#3b759c','#3f7d9e','#46849e'],todos:['#05a58c','#00a7b5','#168ee8','#4f72e5','#7659dc','#a34bce','#d54aa8','#ed5d91']};
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function linkify(text){const regex=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;let out='',last=0;for(const m of String(text||'').matchAll(regex)){out+=escapeHTML(text.slice(last,m.index));let url=m[2]||m[3];let suffix='';if(!m[2]){const trim=url.match(/[.,!?;]+$/);if(trim){suffix=trim[0];url=url.slice(0,-suffix.length)}}out+=`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(m[1]||url)}</a>${suffix}`;last=m.index+m[0].length}return out+escapeHTML(String(text||'').slice(last))}
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(password,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export async function encryptNote(note,password){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await derive(password,salt);const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('daily-note-v1')},key,new TextEncoder().encode(JSON.stringify(note)));return {version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(data)}}
export async function decryptNote(payload,password){const key=await derive(password,bytes(payload.salt));const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv),additionalData:new TextEncoder().encode('daily-note-v1')},key,bytes(payload.ciphertext));return JSON.parse(new TextDecoder().decode(data))}
const types=['recipe','note','car','maintenance','reminder','todo','todoSchedule'];
export function validateBackup(data){
  if(!['red-ridge','daily'].includes(data?.app)||data.version!==1||!Array.isArray(data.records)||!Array.isArray(data.photos))throw Error('Choose a Red Ridge backup (.json).');
  if(data.records.length>20000||data.photos.length>2000)throw Error('This backup is too large.');
  const ids=new Set();
  for(const r of data.records){
    if(!r||typeof r.id!=='string'||!/^[-\w]{1,100}$/.test(r.id)||ids.has(r.id)||!types.includes(r.type))throw Error('Invalid or duplicate entry in backup.');
    ids.add(r.id);
    if(r.type==='todoSchedule'&&!validSchedule(r))throw Error('Invalid recurring reminder.');
    if(r.scheduleId&&(r.type!=='todo'||typeof r.scheduleId!=='string'||!/^[-\w]{1,70}$/.test(r.scheduleId)||!validTodoDate(r.scheduledDate)||r.id!==`repeat_${r.scheduleId}_${r.scheduledDate}`))throw Error('Invalid recurring To-Do.');
    if(JSON.stringify(r).length>100000||typeof r.title!=='string')throw Error('Invalid entry content.');
    if(r.encrypted&&(!r.payload||r.payload.version!==1||typeof r.payload.ciphertext!=='string'||r.title!==''||r.body))throw Error('Invalid encrypted note.');
    if(r.photos&&!Array.isArray(r.photos))throw Error('Invalid photos.');
    for(const photo of r.photos||[]){
      if(typeof photo==='string')continue;
      if(!photo||typeof photo.id!=='string'||!/^[-\w]{1,100}$/.test(photo.id)||typeof photo.url!=='string'||!/^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\//.test(photo.url)||typeof photo.publicId!=='string'||photo.publicId.length>500)throw Error('Invalid Cloudinary photo reference.');
    }
  }
  const pids=new Set();
  for(const p of data.photos){
    if(!p||!/^[-\w]{1,100}$/.test(p.id)||pids.has(p.id)||typeof p.data!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.data)||p.data.length>600000)throw Error('Invalid legacy photo in backup.');
    pids.add(p.id);
  }
  for(const r of data.records){
    if(r.scheduleId&&!data.records.some(s=>s.id===r.scheduleId&&s.type==='todoSchedule'))throw Error('A recurring reminder is missing from this backup.');
    if(r.photos?.some(photo=>typeof photo==='string'&&!pids.has(photo)))throw Error('A legacy photo is missing from this backup.');
    if(['maintenance','reminder'].includes(r.type)&&!data.records.some(c=>c.id===r.carId&&c.type==='car'))throw Error('A vehicle is missing from this backup.');
  }
  return data;
}
export function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

// Move only the first HTTP(S) link into a card action; keep stored text untouched.
export function firstTodoLink(value){
 const text=String(value||'');
 const match=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/.exec(text);
 if(!match)return {text,url:''};
 let url=match[2]||match[3],tail='';
 if(!match[2]){
  while(/[.,!?;:]$/.test(url)){tail=url.slice(-1)+tail;url=url.slice(0,-1)}
  for(const [open,close] of [['(',')'],['[',']'],['{','}']])while(url.endsWith(close)&&url.split(close).length>url.split(open).length){tail=close+tail;url=url.slice(0,-1)}
 }
 try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))return {text,url:''}}catch{return {text,url:''}}
 return {text:(text.slice(0,match.index)+(match[1]||'')+tail+text.slice(match.index+match[0].length)).trim(),url};
}
export function validTodoDate(value){
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===value;
}
export function shiftDate(value,days){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function monthlyDate(start,months){
 const [year,month,day]=start.split('-').map(Number),total=year*12+month-1+months,y=Math.floor(total/12),m=total%12;
 if(y>2099)return null;
 const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return `${y}-${String(m+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
export function validSchedule(r){return r?.type==='todoSchedule'&&typeof r.id==='string'&&/^[-\w]{1,70}$/.test(r.id)&&typeof r.title==='string'&&r.title.trim().length>0&&r.title.length<=300&&validTodoDate(r.startDate)&&Number.isInteger(r.intervalMonths)&&r.intervalMonths>=1&&r.intervalMonths<=12&&(!r.cancelledOn||validTodoDate(r.cancelledOn))}
// Schedules deterministically provide due occurrences on every device, including
// offline. Saved edits/completions/deletion tombstones override those defaults.
// There are no background writes that could overwrite an existing occurrence.
export function recurringTodos(records,asOf=localDate()){
 const existing=new Set(records.map(r=>r.id)),result=[];
 for(const schedule of records){
  if(!validSchedule(schedule)||schedule.deleted)continue;
  const cutoff=shiftDate(schedule.cancelledOn&&schedule.cancelledOn<asOf?schedule.cancelledOn:asOf,7);
  for(let index=0;index<1200;index++){
   const date=monthlyDate(schedule.startDate,index*schedule.intervalMonths);if(!date||date>cutoff)break;
   const id=`repeat_${schedule.id}_${date}`;if(existing.has(id))continue;
   const stamp=shiftDate(date,-7)+'T12:00:00.000Z';
   result.push({id,type:'todo',title:schedule.title,date,done:false,scheduleId:schedule.id,scheduledDate:date,createdAt:stamp,updatedAt:stamp,order:(Number(schedule.order)||0)+index/10000});
  }
 }
 return result;
}
