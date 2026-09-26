import {initializeApp} from './vendor/firebase-app.js';
import {getAuth,setPersistence,browserLocalPersistence,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from './vendor/firebase-auth.js';
import {OWNER} from './core.mjs?v=72-build-indicator';
// Firestore is the largest bundle; signed-out visitors never need it. A saved session starts the download
// alongside Auth so returning users are not slowed down by loading the two one after the other.
let firestoreModule=null;const loadFirestore=()=>firestoreModule||=import('./vendor/firebase-firestore.js');
export async function connect(config,trusted,callbacks){
 const app=initializeApp(config,'red-ridge');const auth=getAuth(app);
 try{if(Object.keys(localStorage).some(key=>key.startsWith('firebase:authUser:')))loadFirestore()}catch{}
 await setPersistence(auth,browserLocalPersistence);
 let fs=null,db=null,stops=[],photoStop=null;
 const firestore=async()=>{if(!db){fs=await loadFirestore();db||=fs.initializeFirestore(app,{localCache:trusted?fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()}):fs.memoryLocalCache()})}return db};
 const col=name=>fs.collection(db,'users',OWNER,name==='photos'?'dailyPhotos':'dailyRecords');
 const listen=name=>fs.onSnapshot(col(name),{includeMetadataChanges:true},snap=>callbacks.snapshot(name,snap.docs.map(d=>({...d.data(),id:d.id})),snap.metadata),err=>callbacks.error('Sync is unavailable. Check Red Ridge’s Firestore rules in Settings. '+err.code));
 const stop=()=>{stops.forEach(f=>f());stops=[];photoStop?.();photoStop=null};
 onAuthStateChanged(auth,async user=>{stop();if(user&&user.uid!==OWNER){callbacks.error('This Google account is not authorized for Red Ridge.');await signOut(auth);return}callbacks.auth(user);if(!user)return;
 try{await firestore()}catch{callbacks.error('Could not load sync. Check your connection and reload Red Ridge.');return}if(auth.currentUser?.uid!==user.uid||stops.length)return;
 stops.push(listen('records'));
 });
 return {signIn:()=>signInWithPopup(auth,new GoogleAuthProvider()),signOut:async()=>{stop();await signOut(auth);if(db){await fs.terminate(db);if(trusted)await fs.clearIndexedDbPersistence(db)}},token(){if(auth.currentUser?.uid!==OWNER)throw Error('Sign in to upload photos.');return auth.currentUser.getIdToken()},wait:()=>db?fs.waitForPendingWrites(db):Promise.resolve(),
 // Legacy base64 photos are only subscribed to while some record still points at one.
 watchPhotos(){if(!photoStop&&db&&stops.length&&auth.currentUser?.uid===OWNER)photoStop=listen('photos');return !!photoStop},
 write(ops){if(auth.currentUser?.uid!==OWNER||!db)throw Error('Sign in to save.');const b=fs.writeBatch(db);for(const op of ops){const ref=fs.doc(col(op.collection||'records'),op.id);if(op.remove)b.delete(ref);else b.set(ref,op.value)}return b.commit()}};
}
