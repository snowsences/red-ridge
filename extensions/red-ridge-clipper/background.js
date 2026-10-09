const APP='https://snowsences.github.io/red-ridge/';
chrome.runtime.onInstalled.addListener(()=>{chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'clip',title:'Send to Red Ridge',contexts:['selection']}))});
async function openEditor(text='',source='',title='',resume=false){
 if(resume&&!text){const all=await chrome.storage.local.get(null);const key=Object.keys(all).filter(k=>k.startsWith('draft:')).sort((a,b)=>(all[b].updatedAt||0)-(all[a].updatedAt||0))[0];if(key){await chrome.windows.create({url:chrome.runtime.getURL('editor.html')+'?draft='+key.slice(6),type:'popup',width:700,height:780});return}}
 const id=crypto.randomUUID();await chrome.storage.local.set({['draft:'+id]:{id:'clip_'+id,title:title.slice(0,300),text,category:'General',source,includeSource:true,updatedAt:Date.now()}});
 await chrome.windows.create({url:chrome.runtime.getURL('editor.html')+'?draft='+id,type:'popup',width:700,height:780});
}
chrome.contextMenus.onClicked.addListener((info,tab)=>{if(info.menuItemId==='clip')openEditor(info.selectionText||'',info.frameUrl||info.pageUrl||tab.url||'',tab.title||'').catch(console.error)});
chrome.action.onClicked.addListener(async tab=>{
 let text='';try{const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{const el=document.activeElement;return typeof el?.selectionStart==='number'?el.value.slice(el.selectionStart,el.selectionEnd):window.getSelection()?.toString()||''}});text=result[0]?.result||''}catch{}
 await openEditor(text,tab.url||'',tab.title||'',true);
});
async function appTab(){const tabs=await chrome.tabs.query({url:APP+'*'});return tabs[0]||await chrome.tabs.create({url:APP,active:false})}
async function invoke(tabId,method,payload){
 const results=await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:async(method,payload)=>{
  const api=window.redRidgeClipper;if(!api)return {error:'Refresh Red Ridge to load the clipping update.',code:'loading'};
  try{return {value:method==='status'?api.status():await api.save(payload)}}catch(error){return {error:error.message}}
 },args:[method,payload]});return results[0]?.result||{error:'Could not reach Red Ridge.'};
}
async function connect(){
 const tab=await appTab();let result;
 for(let i=0;i<30;i++){
  try{result=await invoke(tab.id,'status');if(result.value?.ready)return {tab,result};if(result.value?.code==='auth')break}catch{result={error:'Red Ridge is opening…'}}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(result?.value?.code==='auth')await chrome.tabs.update(tab.id,{active:true});
 throw Error(result?.value?.message||result?.error||'Open Red Ridge, sign in, then retry.');
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('editor.html')))return;
 if(!['categories','send','open'].includes(message.type))return;
 (async()=>{
  if(message.type==='open'){const tab=await appTab();await chrome.tabs.update(tab.id,{active:true});return {ok:true}}
  const {tab,result}=await connect();
  if(message.type==='categories')return {ok:true,categories:result.value.categories};
  const saved=await invoke(tab.id,'save',message.note);if(saved.error)throw Error(saved.error);return {ok:true,...saved.value};
 })().then(reply,error=>reply({ok:false,error:error.message}));return true;
});
