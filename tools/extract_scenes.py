"""Decode the native D3DVERTEX meshes and J3S transform scripts."""
from pathlib import Path
import json, math, struct

SCENES = ['INTRO', 'OUTRO', 'YOUWON']

def decode_script(data):
    values = struct.unpack(f'<{len(data)//4}f', data)
    initial = [list(values[i:i+9]) for i in range(0, 180, 9)]
    segments, cursor = [], 180
    while cursor < len(values):
        assert values[cursor] == -10, (cursor, values[cursor])
        frames = values[cursor+1]
        cursor += 2
        assert frames.is_integer() and frames > 0
        velocity = [[0.0] * 9 for _ in range(20)]
        while cursor < len(values) and values[cursor] != -10:
            if cursor + 3 > len(values): break
            obj, channel, value = values[cursor:cursor+3]
            if not (obj.is_integer() and 1 <= obj <= 20 and channel.is_integer() and -9 <= channel <= -1):
                return {'initial': initial, 'segments': segments, 'frames': sum(s['frames'] for s in segments), 'trailingBytes': len(data)-cursor*4}
            velocity[int(obj)-1][int(-channel)-1] += value
            cursor += 3
        segments.append({'frames': int(frames), 'velocity': velocity})
    return {'initial': initial, 'segments': segments, 'frames': sum(s['frames'] for s in segments), 'trailingBytes': len(data)-cursor*4}

def extract_scenes(res, folder):
    scenes = []
    for index, name in enumerate(SCENES):
        script = decode_script(res[f'J3S_{name}'][101])
        textures = struct.unpack('<20h', res['IND'][101+index])
        meshes = []
        for rid, data in sorted(res[f'OBJECTS_{name}'].items()):
            assert len(data) % 96 == 0
            assert all(math.isfinite(v) for v in struct.unpack(f'<{len(data)//4}f', data))
            mesh_name = f'{name.lower()}-{rid}.bin'
            (folder/mesh_name).write_bytes(data)
            texture = textures[rid-101]
            texture_name = f'texture-{texture}.png' if texture else None
            if texture:
                from PIL import Image
                import io
                Image.open(io.BytesIO(res['TILES'][texture+100])).save(folder/texture_name)
            meshes.append({'file': mesh_name, 'vertices': len(data)//32, 'texture': texture_name})
        scene = {'name': name.lower(), 'meshes': meshes, **script}
        (folder/f'scene-{name.lower()}.json').write_text(json.dumps(scene,separators=(',',':')))
        scenes.append({'name': name.lower(), 'meshes': len(meshes), 'frames': script['frames']})
    return scenes

if __name__ == '__main__':
    from extract_assets import resources
    root = Path(__file__).resolve().parents[1]
    for pack in range(3):
        res = resources(root/f'research/extracted/app/Pack{pack}.exe')
        print(pack, extract_scenes(res,root/f'public/assets/pack{pack}'))
