#!/usr/bin/env python3
"""Import an owner-provided private manifest; never log source URLs or tokens.

Usage: python import-recordings.py /private/manifest.json /private/media-directory
Manifest entries: id, url, duration (seconds). Requires yt-dlp and ffmpeg.
"""
import concurrent.futures
import json
import os
import pathlib
import pwd
import re
import shutil
import subprocess
import sys
import time

import yt_dlp

os.umask(0o027)
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text())
destination = pathlib.Path(sys.argv[2])
destination.mkdir(parents=True, exist_ok=True, mode=0o750)
nginx_user = re.search(r'^\s*user\s+([A-Za-z0-9_-]+)', pathlib.Path('/etc/nginx/nginx.conf').read_text(), re.M).group(1)
nginx_gid = pwd.getpwnam(nginx_user).pw_gid


class Quiet:
    def debug(self, *args, **kwargs): pass
    def warning(self, *args, **kwargs): pass
    def error(self, *args, **kwargs): pass


def import_one(item):
    ident = item['id']
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', ident):
        raise ValueError('Invalid recording ID')
    output = destination / (ident + '.mp4')
    result_file = destination / (ident + '.verified.json')
    try:
        if result_file.exists() and output.exists():
            previous = json.loads(result_file.read_text())
            if previous.get('bytes') == output.stat().st_size:
                print(json.dumps(previous), flush=True)
                return True
        if shutil.disk_usage(destination).free < 3 * 1024**3:
            raise RuntimeError('Insufficient free space')
        with yt_dlp.YoutubeDL({
            'quiet': True, 'logger': Quiet(), 'noprogress': True,
            'format': 'best[height<=720][ext=mp4]/best[height<=720]',
            'outtmpl': str(output), 'socket_timeout': 40,
            'retries': 5, 'fragment_retries': 5, 'concurrent_fragment_downloads': 16,
            'skip_unavailable_fragments': False,
            'postprocessor_args': {'ffmpeg': ['-movflags', '+faststart']},
            'fixup': 'force',
        }) as downloader:
            if '--direct' in sys.argv[3:]:
                info = downloader.extract_info(item['url'], download=False)
                playlist = destination / (ident + '.source.m3u8')
                playlist.write_text('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1550000\n' + info['url'] + '\n')
                playlist.chmod(0o600)
                incoming = destination / (ident + '.incoming.mp4')
                try:
                    transfer = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-nostdin', '-y',
                                    '-protocol_whitelist', 'file,http,https,tcp,tls,crypto',
                                    '-i', str(playlist), '-map', '0:v:0', '-map', '0:a:0',
                                    '-c', 'copy', '-bsf:a', 'aac_adtstoasc',
                                    '-movflags', '+faststart', str(incoming)],
                                   capture_output=True, check=True, timeout=7200)
                    if transfer.stderr.strip():
                        raise RuntimeError('Stream transfer reported errors')
                    incoming.replace(output)
                finally:
                    playlist.unlink(missing_ok=True)
            else:
                downloader.download([item['url']])
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                                'format=duration:stream=codec_type,width,height',
                                '-of', 'json', str(output)],
                               check=True, capture_output=True, text=True)
        data = json.loads(probe.stdout)
        duration = float(data['format']['duration'])
        if abs(duration - item['duration']) > 15:
            raise RuntimeError('Duration mismatch')
        if not any(s['codec_type'] == 'video' for s in data['streams']) or not any(s['codec_type'] == 'audio' for s in data['streams']):
            raise RuntimeError('Video or audio missing')
        output.chmod(0o640)
        os.chown(output, 0, nginx_gid)
        result = {'id': ident, 'status': 'verified', 'duration': duration,
                  'bytes': output.stat().st_size, 'streams': data['streams'],
                  'verifiedAt': int(time.time())}
        result_file.write_text(json.dumps(result) + '\n')
        result_file.chmod(0o600)
    except Exception as error:
        # Provider error messages can include credentials; log only their class.
        result = {'id': ident, 'status': 'failed', 'error': type(error).__name__}
    print(json.dumps(result), flush=True)
    return result['status'] == 'verified'


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    succeeded = list(pool.map(import_one, manifest))
sys.exit(0 if all(succeeded) else 1)
