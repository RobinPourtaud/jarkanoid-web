"""Render extracted tracker modules using libopenmpt, then encode for browsers."""
from pathlib import Path
import ctypes as c
import ctypes.util
import json, subprocess

root=Path(__file__).resolve().parents[1]
lib=c.CDLL(ctypes.util.find_library('openmpt') or '/opt/homebrew/lib/libopenmpt.dylib')
lib.openmpt_module_create_from_memory2.argtypes=[c.c_void_p,c.c_size_t]+[c.c_void_p]*7
lib.openmpt_module_create_from_memory2.restype=c.c_void_p
lib.openmpt_module_read_interleaved_stereo.argtypes=[c.c_void_p,c.c_int32,c.c_size_t,c.POINTER(c.c_int16)]
lib.openmpt_module_read_interleaved_stereo.restype=c.c_size_t
lib.openmpt_module_destroy.argtypes=[c.c_void_p]
for path in (root/'public/assets').glob('pack*/*.mod'):
    dest=path.with_suffix('.mp3')
    if dest.exists(): continue
    data=path.read_bytes(); buffer=c.create_string_buffer(data)
    module=lib.openmpt_module_create_from_memory2(buffer,len(data),None,None,None,None,None,None,None)
    if not module: raise RuntimeError(f'Cannot decode {path}')
    encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','s16le','-ar','44100','-ac','2','-i','pipe:0','-codec:a','libmp3lame','-b:a','128k',str(dest)],stdin=subprocess.PIPE)
    samples=(c.c_int16*(4096*2))()
    for _ in range(44100*60*20//4096):
        count=lib.openmpt_module_read_interleaved_stereo(module,44100,4096,samples)
        if count==0: break
        encoder.stdin.write(bytes(samples)[:count*4])
    encoder.stdin.close()
    if encoder.wait(): raise RuntimeError('Audio encoding failed')
    lib.openmpt_module_destroy(module)
    print(dest.relative_to(root),flush=True)
manifest=root/'public/assets/manifest.json'
s=manifest.read_text().replace('.wav','.mp3')
manifest.write_text(s)
