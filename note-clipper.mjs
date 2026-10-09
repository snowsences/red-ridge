// Called only by the extension's explicit injection into this page. No cross-origin messages or tokens.
export function createNoteClipper({ready,categories,get,save,show}) {
 const active=new Map();
 return Object.freeze({
  version:1,
  status(){return {...ready(),categories:ready().ready?['General',...categories().filter(c=>c!=='General')]:[]}},
  async save(input){
   const state=ready();if(!state.ready)throw Error(state.message||'Open Red Ridge and sign in first.');
   if(!globalThis.navigator.onLine)throw Error('Connect to the internet before sending. Your draft is kept.');
   if(!input||!/^clip_[a-f0-9-]{36}$/.test(input.id))throw Error('Invalid clipping ID.');
   const title=String(input.title||'').trim(),body=String(input.body||'').trim(),category=String(input.category||'General').trim()||'General';
   if(!title||title.length>300)throw Error('Add a title of up to 300 characters.');
   if(!body||body.length>20000)throw Error('Add note text of up to 20,000 characters.');
   if(category.length>100)throw Error('Keep categories under 100 characters.');
   if(active.has(input.id))return active.get(input.id);
   const task=(async()=>{
    const existing=get(input.id);if(existing&&existing.type!=='note')throw Error('Clipping ID is already in use.');
    const stamp=new Date().toISOString(),match=categories().find(c=>c.toLocaleLowerCase()===category.toLocaleLowerCase());
    // Plain text is intentional: selected HTML is never executable, and newlines survive unchanged.
    const note={id:input.id,type:'note',title,body,category:match||category,richText:false,pinned:false,createdAt:existing?.createdAt||stamp,updatedAt:stamp};
    // Recommit the same record on retry, including after an ambiguous network timeout.
    await save(note);show(note);return {id:note.id,title:note.title};
   })();active.set(input.id,task);try{return await task}finally{active.delete(input.id)}
  }
 });
}
