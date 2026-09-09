import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const lock=JSON.parse(await readFile(resolve(root,'dependencies.lock.json'),'utf8'));
let failed=false;

for(const [name,expected] of Object.entries(lock.firebase.files)){
  const bytes=await readFile(resolve(root,name));
  const actual=createHash('sha256').update(bytes).digest('hex');
  if(actual!==expected){
    failed=true;
    console.error(`${name}: integrity check failed`);
  }else console.log(`${name}: verified`);
}

if(failed)process.exitCode=1;
