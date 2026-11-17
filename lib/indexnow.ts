import fs from 'node:fs';
import path from 'node:path';
import { createHash,randomBytes } from 'node:crypto';
import { stateDir } from './commerce.ts';
import { legacyDuplicate, privatePath } from './seo.ts';

export function queueIndexNow(pathname:string) {
  if(!pathname.startsWith('/')||pathname.startsWith('//')||/[?#\r\n]/.test(pathname)||privatePath(pathname)||legacyDuplicate(pathname))return;
  const dir=path.join(stateDir(),'seo','queue');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,createHash('sha256').update(pathname).digest('hex')+'.json');
  const temp=file+'.'+randomBytes(6).toString('hex')+'.tmp';fs.writeFileSync(temp,JSON.stringify({path:pathname,updated:new Date().toISOString()}),{mode:0o600});fs.renameSync(temp,file);
}
