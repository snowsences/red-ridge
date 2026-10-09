const $=id=>document.getElementById(id),key='draft:'+new URLSearchParams(location.search).get('draft');let draft,busy=false,sent=false,saveChain=Promise.resolve();
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error)}
function values(){return {...draft,title:$('title').value,text:$('text').value,category:$('category').value||'General',includeSource:$('includeSource').checked,updatedAt:Date.now()}}
function keep(){if(!draft||sent)return saveChain;draft=values();const snapshot={...draft};saveChain=saveChain.then(()=>chrome.storage.local.set({[key]:snapshot}));return saveChain}
async function categories(){status('Connecting to Red Ridge…');try{const result=await chrome.runtime.sendMessage({type:'categories'});if(!result.ok)throw Error(result.error);$('categories').replaceChildren(...result.categories.map(value=>{const option=document.createElement('option');option.value=value;return option}));status('Ready to send.')}catch(error){status(error.message,true)}}
(async()=>{
 draft=(await chrome.storage.local.get(key))[key];if(!draft){status('This draft is no longer available.',true);$('send').disabled=true;return}
 for(const field of ['title','category'])$(field).value=draft[field];$('text').value=draft.text;$('includeSource').checked=draft.includeSource;
 try{const url=new URL(draft.source);if(!['https:','http:'].includes(url.protocol))throw Error();$('source').href=url.href;$('source').textContent=url.href}catch{$('includeSource').checked=false;$('includeSource').disabled=true;draft.source='';$('source').textContent='No source link'}
 $('form').addEventListener('input',()=>keep().catch(()=>status('Could not keep the draft on this device.',true)));
 $('text').focus();await categories();
})();
$('open').onclick=async()=>{await chrome.runtime.sendMessage({type:'open'});if(!sent)await categories()};
$('form').onsubmit=async event=>{
 event.preventDefault();if(busy||sent||!draft)return;busy=true;$('send').disabled=true;status('Sending…');
 try{await keep();const d=values(),body=d.text.trim()+(d.includeSource&&d.source?'\n\nSource: '+d.source:'');if(body.length>20000)throw Error('Note and source together must be under 20,000 characters.');
 const result=await Promise.race([chrome.runtime.sendMessage({type:'send',note:{id:d.id,title:d.title,body,category:d.category}}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Still waiting for confirmation. Your draft is kept; retrying will not create a duplicate.')),45000))]);
 if(!result.ok)throw Error(result.error);sent=true;await saveChain;await chrome.storage.local.remove(key);status('Saved to Red Ridge Notes.');$('send').textContent='Sent';for(const el of $('form').querySelectorAll('input,textarea'))el.disabled=true;
 }catch(error){status(error.message,true)}finally{busy=false;$('send').disabled=sent}
};
