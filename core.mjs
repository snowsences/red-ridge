export const OWNER='SRoia3s1D1gDnKvlCLlY4lBNMri1';
export const DEFAULT_CONFIG={"apiKey":"AIzaSyDWmZ9j59AtwlDwDs3h4Cnicpwr9GzUTIc","authDomain":"red-ridge-d47fa.firebaseapp.com","projectId":"red-ridge-d47fa","storageBucket":"red-ridge-d47fa.firebasestorage.app","messagingSenderId":"205683869190","appId":"1:205683869190:web:103bd8950553767dc02587"};
export const PALETTES={recipes:['#b95443','#bd5e46','#ba6845','#b57448','#af7b4b','#a78051'],notes:['#735295','#785792','#7e5c90','#83608b','#886586'],cars:['#365f90','#3a6b99','#3b759c','#3f7d9e','#46849e'],todos:['#3c8498','#428097','#497c95','#507794','#587292','#606d8e','#69688a','#726387']};
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function linkify(text){const regex=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;let out='',last=0;for(const m of String(text||'').matchAll(regex)){out+=escapeHTML(text.slice(last,m.index));let url=m[2]||m[3];let suffix='';if(!m[2]){const trim=url.match(/[.,!?;]+$/);if(trim){suffix=trim[0];url=url.slice(0,-suffix.length)}}out+=`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(m[1]||url)}</a>${suffix}`;last=m.index+m[0].length}return out+escapeHTML(String(text||'').slice(last))}
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(password,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export async function encryptNote(note,password){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await derive(password,salt);const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('daily-note-v1')},key,new TextEncoder().encode(JSON.stringify(note)));return {version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(data)}}
export async function decryptNote(payload,password){const key=await derive(password,bytes(payload.salt));const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv),additionalData:new TextEncoder().encode('daily-note-v1')},key,bytes(payload.ciphertext));return JSON.parse(new TextDecoder().decode(data))}
const types=['recipe','note','car','maintenance','reminder','todo'];
export function validateBackup(data){
  if(!['red-ridge','daily'].includes(data?.app)||data.version!==1||!Array.isArray(data.records)||!Array.isArray(data.photos))throw Error('Choose a Red Ridge backup (.json).');
  if(data.records.length>20000||data.photos.length>2000)throw Error('This backup is too large.');
  const ids=new Set();
  for(const r of data.records){
    if(!r||typeof r.id!=='string'||!/^[-\w]{1,100}$/.test(r.id)||ids.has(r.id)||!types.includes(r.type))throw Error('Invalid or duplicate entry in backup.');
    ids.add(r.id);
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
    if(r.photos?.some(photo=>typeof photo==='string'&&!pids.has(photo)))throw Error('A legacy photo is missing from this backup.');
    if(['maintenance','reminder'].includes(r.type)&&!data.records.some(c=>c.id===r.carId&&c.type==='car'))throw Error('A vehicle is missing from this backup.');
  }
  return data;
}
export function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
