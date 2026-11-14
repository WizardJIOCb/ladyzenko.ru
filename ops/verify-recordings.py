#!/usr/bin/env python3
"""Read-only validation of imported MP4s; output a credential-free report."""
import hashlib
import json
import pathlib
import subprocess
import sys

directory = pathlib.Path('/var/lib/new-ladyzenko-recordings')
results = []
for metadata in sorted(directory.glob('school-lecture-*.verified.json')):
    record = json.loads(metadata.read_text())
    if len(sys.argv) > 1 and record['id'] not in sys.argv[1:]:
        continue
    video = directory / (record['id'] + '.mp4')
    if record['bytes'] != video.stat().st_size:
        raise RuntimeError('Imported file changed: ' + record['id'])
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                            'stream=codec_type,codec_name,width,height', '-of', 'json', str(video)],
                           capture_output=True, check=True, text=True, timeout=60)
    streams = json.loads(probe.stdout)['streams']
    if not any(s.get('codec_name') == 'h264' for s in streams) or not any(s.get('codec_name') == 'aac' for s in streams):
        raise RuntimeError('Unexpected browser codecs: ' + record['id'])
    for second in (1, int(record['duration'] / 2), int(record['duration'] - 5)):
        subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-ss', str(second), '-i', str(video),
                        '-t', '2', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'],
                       capture_output=True, check=True, timeout=90)
    samples = []
    with video.open('rb') as source:
        for offset in (0, record['bytes'] // 2, record['bytes'] - 1024):
            source.seek(offset)
            samples.append({'offset': offset, 'sha256': hashlib.sha256(source.read(1024)).hexdigest()})
    results.append({**record, 'streams': streams, 'decodedSamples': 3, 'rangeSamples': samples})
print(json.dumps(results))
