import fs from 'node:fs';
import { saveRecordingPreview } from '../lib/recording-media.ts';
const payload=fs.readFileSync(0,'utf8');if(payload.length>4*1024*1024)throw new Error('Preview batch too large');
const rows=JSON.parse(payload);if(!Array.isArray(rows))throw new Error('Expected preview batch');
for(const row of rows)saveRecordingPreview(row);
console.log(JSON.stringify({previewsSaved:rows.length}));
