import {initializeApp} from './vendor/firebase-app.js';
import {getAuth,setPersistence,browserLocalPersistence,browserSessionPersistence,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from './vendor/firebase-auth.js';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,memoryLocalCache,collection,doc,onSnapshot,writeBatch,terminate,clearIndexedDbPersistence,waitForPendingWrites} from './vendor/firebase-firestore.js';
import {OWNER} from './core.mjs';
export async function connect(config,trusted,callbacks){
 const app=initializeApp(config,'red-ridge');const auth=getAuth(app);await setPersistence(auth,trusted?browserLocalPersistence:browserSessionPersistence);
 const db=initializeFirestore(app,{localCache:trusted?persistentLocalCache({tabManager:persistentMultipleTabManager()}):memoryLocalCache()});let stops=[];
 const col=name=>collection(db,'users',OWNER,name==='photos'?'dailyPhotos':'dailyRecords');
 const stop=()=>{stops.forEach(f=>f());stops=[]};
 onAuthStateChanged(auth,async user=>{stop();if(user&&user.uid!==OWNER){callbacks.error('This Google account is not authorized for Red Ridge.');await signOut(auth);return}callbacks.auth(user);if(!user)return;
 for(const name of ['records','photos'])stops.push(onSnapshot(col(name),{includeMetadataChanges:true},snap=>callbacks.snapshot(name,snap.docs.map(d=>({...d.data(),id:d.id})),snap.metadata),err=>callbacks.error('Sync is unavailable. Check Red Ridge’s Firestore rules in Settings. '+err.code)));
 });
 return {signIn:()=>signInWithPopup(auth,new GoogleAuthProvider()),signOut:async()=>{stop();await signOut(auth);await terminate(db);if(trusted)await clearIndexedDbPersistence(db)},token(){if(auth.currentUser?.uid!==OWNER)throw Error('Sign in to upload photos.');return auth.currentUser.getIdToken()},wait:()=>waitForPendingWrites(db),write(ops){if(auth.currentUser?.uid!==OWNER)throw Error('Sign in to save.');const b=writeBatch(db);for(const op of ops){const ref=doc(col(op.collection||'records'),op.id);if(op.remove)b.delete(ref);else b.set(ref,op.value)}return b.commit()}};
}
