export const OWNER='SRoia3s1D1gDnKvlCLlY4lBNMri1';
export const DEFAULT_CONFIG={"apiKey":"AIzaSyDWmZ9j59AtwlDwDs3h4Cnicpwr9GzUTIc","authDomain":"red-ridge-d47fa.firebaseapp.com","projectId":"red-ridge-d47fa","storageBucket":"red-ridge-d47fa.firebasestorage.app","messagingSenderId":"205683869190","appId":"1:205683869190:web:103bd8950553767dc02587"};
export const PALETTES={recipes:['#b95443','#bd5e46','#ba6845','#b57448','#af7b4b','#a78051'],notes:['#735295','#785792','#7e5c90','#83608b','#886586'],cars:['#365f90','#3a6b99','#3b759c','#3f7d9e','#46849e'],todos:['#05a58c','#00a7b5','#168ee8','#4f72e5','#7659dc','#a34bce','#d54aa8','#ed5d91']};
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function linkify(text){const regex=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;let out='',last=0;for(const m of String(text||'').matchAll(regex)){out+=escapeHTML(text.slice(last,m.index));let url=m[2]||m[3];let suffix='';if(!m[2]){const trim=url.match(/[.,!?;]+$/);if(trim){suffix=trim[0];url=url.slice(0,-suffix.length)}}out+=`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(m[1]||url)}</a>${suffix}`;last=m.index+m[0].length}return out+escapeHTML(String(text||'').slice(last))}
const types=['recipe','ingredient','ingredientTag','note','car','maintenance','reminder','todo','todoSchedule'];
const noteHubIds={homeManual:'note_hub_home_manual',packing:'note_hub_packing',photography:'note_hub_photography'};
const validCloudinaryPhoto=photo=>typeof photo==='string'||!!photo&&typeof photo.id==='string'&&/^[-\w]{1,100}$/.test(photo.id)&&typeof photo.url==='string'&&/^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\//.test(photo.url)&&typeof photo.publicId==='string'&&photo.publicId.length<=500;
function validHubRecord(r){
 if(!r.noteKind)return true;
 if(!noteHubIds[r.noteKind]||r.id!==noteHubIds[r.noteKind])return false;
 const arrays=r.noteKind==='homeManual'?['homeItems','homeHistory','homeContacts']:r.noteKind==='packing'?(Array.isArray(r.packingItems)?['packingItems']:Array.isArray(r.packingTemplate)?['packingTemplate']:['packingPacks','packingTrips']):['photoGuides'];
 if(arrays.some(key=>!Array.isArray(r[key])||r[key].length>1000))return false;
 const nested=[...(r.homeItems||[]),...(r.photoGuides||[])];
 return nested.every(item=>item&&typeof item.id==='string'&&/^[-\w]{1,100}$/.test(item.id)&&typeof item.title==='string'&&item.title.length<=1000&&(!item.photos||Array.isArray(item.photos)&&item.photos.length<=100&&item.photos.every(validCloudinaryPhoto)));
}
export function validateBackup(data){
  if(!['red-ridge','daily'].includes(data?.app)||data.version!==1||!Array.isArray(data.records)||!Array.isArray(data.photos))throw Error('Choose a Red Ridge backup (.json).');
  if(data.records.length>20000||data.photos.length>2000)throw Error('This backup is too large.');
  const ids=new Set();
  for(const r of data.records){
    if(!r||typeof r.id!=='string'||!/^[-\w]{1,100}$/.test(r.id)||ids.has(r.id)||!types.includes(r.type))throw Error('Invalid or duplicate entry in backup.');
    ids.add(r.id);
    validateRecordLimits(r);
    if(r.type==='todoSchedule'&&!validSchedule(r))throw Error('Invalid recurring reminder.');
    if(r.type==='recipe'&&r.recipeIngredients&&(!Array.isArray(r.recipeIngredients)||r.recipeIngredients.length>200||r.recipeIngredients.some(item=>!item||typeof item.id!=='string'||!/^[-\w]{1,100}$/.test(item.id)||typeof item.ingredientId!=='string'||!/^[-\w]{1,100}$/.test(item.ingredientId)||typeof item.amount!=='string'||item.amount.length>100||typeof item.notes!=='string'||item.notes.length>300)))throw Error('Invalid recipe ingredients.');
    if(r.type==='ingredient'&&((r.tagIds&&!Array.isArray(r.tagIds))||(r.aliases&&!Array.isArray(r.aliases))||(r.tagIds?.some(id=>typeof id!=='string'||!/^[-\w]{1,100}$/.test(id)))||(r.aliases?.some(alias=>typeof alias!=='string'||alias.length>200))||typeof r.hidden!=='undefined'&&typeof r.hidden!=='boolean'||typeof r.substitutes!=='undefined'&&typeof r.substitutes!=='string'))throw Error('Invalid ingredient.');
    if(r.scheduleId&&(r.type!=='todo'||typeof r.scheduleId!=='string'||!/^[-\w]{1,70}$/.test(r.scheduleId)||!validTodoDate(r.scheduledDate)||r.id!==`repeat_${r.scheduleId}_${r.scheduledDate}`))throw Error('Invalid recurring To-Do.');
    if(JSON.stringify(r).length>(r.type==='note'&&r.noteKind?900000:100000)||typeof r.title!=='string'||r.type==='note'&&!validHubRecord(r))throw Error('Invalid entry content.');
    if(r.photos&&!Array.isArray(r.photos))throw Error('Invalid photos.');
    for(const photo of photoContainers(r).flatMap(x=>x.photos)){
      if(typeof photo==='string')continue;
      if(!validCloudinaryPhoto(photo))throw Error('Invalid Cloudinary photo reference.');
    }
  }
  const pids=new Set();
  for(const p of data.photos){
    if(!p||!/^[-\w]{1,100}$/.test(p.id)||pids.has(p.id)||typeof p.data!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p.data)||p.data.length>600000)throw Error('Invalid legacy photo in backup.');
    pids.add(p.id);
  }
  // Ids are unique by now, so one lookup table keeps the reference checks linear.
  const typeById=new Map(data.records.map(r=>[r.id,r.type])),is=(id,type)=>typeById.get(id)===type;
  for(const r of data.records){
    if(r.deleted)continue;
    if(r.scheduleId&&!is(r.scheduleId,'todoSchedule'))throw Error('A recurring reminder is missing from this backup.');
    if(legacyPhotoIds(r).some(photo=>!pids.has(photo)))throw Error('A legacy photo is missing from this backup.');
    if(['maintenance','reminder'].includes(r.type)&&!is(r.carId,'car'))throw Error('A vehicle is missing from this backup.');
    if(r.type==='recipe'&&r.recipeIngredients?.some(item=>!is(item.ingredientId,'ingredient')))throw Error('A recipe ingredient is missing from this backup.');
    if(r.type==='ingredient'&&r.tagIds?.some(tagId=>!is(tagId,'ingredientTag')))throw Error('An ingredient tag is missing from this backup.');
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
   result.push({id,type:'todo',title:schedule.title,date,done:false,scheduleId:schedule.id,scheduledDate:date,sourceHubId:schedule.sourceHubId||'',sourceItemId:schedule.sourceItemId||'',sourceLabel:schedule.sourceLabel||'',createdAt:stamp,updatedAt:stamp,order:(Number(schedule.order)||0)+index/10000});
  }
 }
 return result;
}

export function equalValue(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equalValue(a[k],b[k]));
}
export function reconcileRecord(base,next,remote){
 if(!base){if(!remote||equalValue(next,remote))return next;throw Error('This entry already exists on another device. Review the saved entry.')}
 if(!remote)throw Error('This entry was removed on another device. Your edit is retained for recovery.');
 const result={...remote};
 for(const key of new Set([...Object.keys(base),...Object.keys(next)])){
  if(equalValue(base[key],next[key]))continue;
  if(key==='updatedAt'){result[key]=String(remote[key]||'')>String(next[key]||'')?remote[key]:next[key];continue}
  if(!equalValue(remote[key],base[key])&&!equalValue(remote[key],next[key]))throw Error('Another device changed '+key+'. Your edit is retained for recovery.');
  if(Object.hasOwn(next,key))result[key]=next[key];else delete result[key];
 }
 return result;
}
export function splitOperations(ops,maxCount=200,maxBytes=4000000){
 const chunks=[];let chunk=[],size=0;for(const op of ops){const n=JSON.stringify(op.value||{}).length*3+512;if(n>maxBytes)throw Error('An entry exceeds the supported write size.');if(chunk.length&&(chunk.length>=maxCount||size+n>maxBytes)){chunks.push(chunk);chunk=[];size=0}chunk.push(op);size+=n}if(chunk.length)chunks.push(chunk);return chunks;
}
export function photoContainers(record){return [record,...(record.homeItems||[]),...(record.photoGuides||[])].filter(x=>Array.isArray(x?.photos))}
export function legacyPhotoIds(record){return photoContainers(record).flatMap(x=>x.photos.filter(p=>typeof p==='string'))}
export function stablePackingId(noteId,index){return 'packing_'+noteId+'_'+index}
export function completeReminderRecords(reminder,stamp,date){
 const id='maintenance_'+reminder.id;
 return [{id,value:{...reminder,id,type:'maintenance',date,scheduledDate:reminder.scheduledDate||reminder.date||'',completedDate:date,done:true,completedAt:stamp,updatedAt:stamp,sourceReminderId:reminder.id}},
 {id:reminder.id,value:{...reminder,done:true,deleted:true,deletedAt:stamp,updatedAt:stamp}}];
}
export function validateRecordLimits(r){
 const strings={title:300,body:20000,ingredients:20000,method:20000,substitutes:10000,category:100,year:10,make:100,model:200,owner:200,status:20,odometer:30,unit:10,vin:100,mileage:30,cost:30,provider:200,carId:128,scheduleId:128,coverPhotoId:500,date:10,ownedFrom:10,ownedTo:10,startDate:10,scheduledDate:10,cancelledOn:10,createdAt:40,updatedAt:40};
 if(typeof r.title!=='string'||!r.title.trim()||typeof r.createdAt!=='string'||typeof r.updatedAt!=='string'||Object.keys(r).length>40)throw Error('Invalid entry: '+(r.title||r.id));
 for(const [key,max] of Object.entries(strings))if(key in r&&(typeof r[key]!=='string'||r[key].length>max))throw Error('Invalid '+key+' in '+r.title);
 for(const [key,max] of Object.entries({photos:100,recipeIngredients:200,aliases:100,tagIds:100}))if(key in r&&(!Array.isArray(r[key])||r[key].length>max))throw Error('Too many or invalid '+key+' in '+r.title);
 for(const key of ['deleted','richText','pinned','hidden','done'])if(key in r&&typeof r[key]!=='boolean')throw Error('Invalid '+key+' in '+r.title);
 for(const [key,min,max] of [['order',-1000000,1000000],['intervalMonths',1,12]])if(key in r&&(!Number.isFinite(r[key])||r[key]<min||r[key]>max))throw Error('Invalid '+key+' in '+r.title);
 return r;
}
