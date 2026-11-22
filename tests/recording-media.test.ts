import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {NextRequest} from 'next/server';
import {GET} from '../app/api/admin/[action]/route.ts';
import {setupAdmin,login,adminCookie} from '../lib/admin.ts';
import {recordingMedia,saveRecordingPreview} from '../lib/recording-media.ts';
import {recordingImports,importAction} from '../lib/recording-imports.ts';
import {getLectureProducts,saveLectureDetails,detailsVersion} from '../lib/catalogue.ts';
import {GET as coverGET} from '../app/api/site/recording-cover/[id]/route.ts';
import {storeImage} from '../lib/mirror.ts';
const state=fs.mkdtempSync(path.join(os.tmpdir(),'lady-preview-'));process.env.COMMERCE_STATE=state;
const product='school-lecture-01',fileName=product+'.mp4';
function mapping(name=fileName){fs.writeFileSync(path.join(state,'config.json'),JSON.stringify({lectureRemoteFiles:{[product]:name},lectureFiles:{},shopKey:'private_fixture_key'}));}
function request(action:string,token='',id=product){return GET(new NextRequest('https://new.ladyzenko.ru/api/admin/'+action+'?product='+encodeURIComponent(id),{headers:token?{cookie:adminCookie+'='+token}:{}}),{params:Promise.resolve({action})});}
after(()=>fs.rmSync(state,{recursive:true,force:true}));
test('admin preview requires an unexpired administrator session and only serves the configured recording',async()=>{
 mapping();setupAdmin('private-preview-test-password');const token=login('private-preview-test-password');
 for(const action of ['recording-video','recording-poster'])assert.equal((await request(action)).status,401);
 const response=await request('recording-video',token);assert.equal(response.status,200);assert.equal(response.headers.get('x-accel-redirect'),'/commerce-remote/'+fileName);
 assert.match(response.headers.get('cache-control')!,/no-store/);assert.match(response.headers.get('x-robots-tag')!,/noindex/);
 assert.equal((await request('recording-video',token,'../../config.json')).status,404);
 assert.equal((await request('recording-video',token,'lecture-1798546824600')).status,404);
 assert.equal((await request('recording-video',login('private-preview-test-password',Math.floor(Date.now()/1000)-8*3600))).status,401);
});
test('preview metadata follows the exact file, cannot replace video mappings, and disappears when the mapping changes',async()=>{
 mapping();assert.equal(recordingMedia(product)?.posterUrl,null);
 const image=Buffer.concat([Buffer.from([255,216]),Buffer.alloc(128),Buffer.from([255,217])]);
 const payload={action:'preview',product,fileName,bytes:1234567,duration:4584.7,width:640,height:360,poster:image.toString('base64')};
 assert.throws(()=>saveRecordingPreview({...payload,fileName:'other.mp4'}),/изменилась/);
 assert.throws(()=>saveRecordingPreview({...payload,poster:Buffer.from('<svg/>').toString('base64')}),/JPEG/);
 await importAction(payload);
 const media=recordingImports().find(r=>r.id===product)!.media!;assert.equal(media.fileName,fileName);assert.equal(media.durationSeconds,4584.7);assert.equal(media.sizeBytes,1234567);assert.ok(media.posterUrl);
 const token=login('private-preview-test-password');const response=await request('recording-poster',token);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await response.arrayBuffer()),image);
  const p=()=>getLectureProducts().find(p=>p.id===product)!;assert.match(p().image!,/^\/api\/site\/recording-cover\//);assert.equal(p().coverImage,'');
  const cover=await coverGET(new Request('https://new.ladyzenko.ru/api/site/recording-cover/'+product),{params:Promise.resolve({id:product})});assert.equal(cover.status,200);assert.equal(cover.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await cover.arrayBuffer()),image);
  const custom=storeImage(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
  saveLectureDetails({product,version:detailsVersion(p()),title:p().title,description:p().description,amount:p().amount,image:custom});assert.equal(p().image,custom);
  saveLectureDetails({product,version:detailsVersion(p()),title:p().title,description:p().description,amount:p().amount,image:''});assert.match(p().image!,/^\/api\/site\/recording-cover\//);
 const json=JSON.stringify(recordingImports());assert.equal(json.includes('private_fixture_key'),false);assert.equal(json.includes('/var/lib'),false);
 mapping(product+'-aaaaaaaaaaaaaaaa.mp4');assert.equal(recordingMedia(product)?.posterUrl,null);assert.equal((await request('recording-poster',token)).status,404);
});
