"""Build private admin previews from the exact configured files, never from titles."""
import importlib.util,json,pathlib,re,sys
spec=importlib.util.spec_from_file_location('worker',pathlib.Path(__file__).with_name('recording-import-worker.py'))
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
base=pathlib.Path('/var/lib/new-ladyzenko-recordings').resolve()
result=[]
for item in json.load(sys.stdin):
    name=item['fileName']
    if not re.fullmatch(r'[a-zA-Z0-9_-]+\.mp4',name):raise ValueError('Invalid filename')
    file=(base/name).resolve()
    if file.parent!=base or not file.is_file():raise ValueError('Recording unavailable')
    result.append(worker.preview_payload(item['product'],file))
json.dump(result,sys.stdout)
