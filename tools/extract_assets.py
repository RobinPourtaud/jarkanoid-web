"""Extract original PE resources into browser assets; never executes game binaries."""
from pathlib import Path
import argparse, hashlib, io, json, struct, subprocess
import pefile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ['BALLE', 'BONUS', 'NORMAL_BAT_LEFT', 'NORMAL_BAT_CENTER', 'NORMAL_BAT_RIGHT', 'GLUE_BAT_LEFT', 'GLUE_BAT_CENTER', 'GLUE_BAT_RIGHT', 'BULLET', 'MER', 'TIRS', 'COLLISION_EFFECTS', 'EXPLODER', 'RAIN', 'TITLE', 'ORAGE']

def resources(path):
    pe = pefile.PE(str(path))
    result = {}
    for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        category = str(entry.name or entry.id)
        result[category] = {}
        for item in entry.directory.entries:
            loc = item.directory.entries[0].data.struct
            result[category][int(item.id)] = pe.get_data(loc.OffsetToData, loc.Size)
    return result

def mp3(data):
    pos = 12
    while pos + 8 <= len(data):
        size = struct.unpack_from('<I', data, pos + 4)[0]
        if data[pos:pos+4] == b'data': return data[pos+8:pos+8+size]
        pos += 8 + size + size % 2
    raise ValueError('Missing WAVE data chunk')

def keyed(data):
    im = Image.open(io.BytesIO(data)).convert('RGBA')
    im.putdata([(r,g,b,0 if r < 8 and g < 4 and b < 8 else 255) for r,g,b,a in im.get_flattened_data()])
    return im

def extract_sprites(res, folder):
    atlas = {}
    images = []
    for category in SPRITES:
        for rid, data in sorted(res.get(category, {}).items()):
            im = keyed(data)
            images.append((f'{category}/{rid-100}',im))
    x = y = row_h = 0
    placements = []
    for key,im in images:
        if x + im.width > 1024: x,y,row_h = 0,y+row_h+2,0
        placements.append((key,im,x,y))
        atlas[key] = [x,y,im.width,im.height]
        x += im.width + 2
        row_h = max(row_h,im.height)
    sheet = Image.new('RGBA',(1024,y+row_h))
    for key,im,x,y in placements: sheet.paste(im,(x,y))
    sheet.save(folder/'sprites.png')
    (folder/'sprites.json').write_text(json.dumps(atlas,separators=(',',':')))
    return len(images)

def extract(app, output):
    output.mkdir(parents=True, exist_ok=True)
    packs = []
    provenance = {}
    for index in range(3):
        source = app / f'Pack{index}.exe'
        provenance[source.name] = hashlib.sha256(source.read_bytes()).hexdigest()
        res = resources(source)
        folder = output / f'pack{index}'
        folder.mkdir(exist_ok=True)
        levels = []
        for rid, data in sorted(res['CODE'].items()):
            cells = list(struct.unpack('<1054h', data[:2108]))
            assert set(cells) <= {-2,-1,0,1,2,3}
            art = Image.open(io.BytesIO(res['LEVEL'][rid]))
            assert art.size == (1023,680), art.size
            (folder / f'level-{rid-100}.jpg').write_bytes(res['LEVEL'][rid])
            tile = res['TILES'].get(rid, res['TILES'][101])
            Image.open(io.BytesIO(tile)).save(folder / f'tile-{rid-100}.png')
            levels.append({'number':rid-100,'cells':cells})
        sprite_count = extract_sprites(res, folder)
        for rid,data in res['SOUNDS'].items(): (folder/f'sound-{rid-100}.mp3').write_bytes(mp3(data))
        music = {}
        for rid,data in sorted(res['MUSICS'].items()):
            if data[:4] == b'RIFF':
                filename = f'music-{rid}.mp3'
                (folder/filename).write_bytes(mp3(data))
                music[rid] = filename
            elif data[:4] == b'MThd':
                filename = f'music-{rid}.mid'
                (folder/filename).write_bytes(data)
                music[rid] = filename
            elif len(data) == 4 and data[0] == 66:
                module_id = data[1]+100
                filename = f'module-{module_id}.mod'
                (folder/filename).write_bytes(res['MODULES'][module_id])
                music[rid] = filename.replace('.mod','.wav')
            elif len(data) == 4 and data[0] == 65:
                music[rid] = music[data[1]+100]
        tracks = []
        for lev in levels:
            key = max((k for k in music if k <= lev['number']+103),default=None)
            tracks.append(music.get(key))
        (folder/'levels.json').write_text(json.dumps(levels,separators=(',',':')))
        from extract_scenes import extract_scenes
        scenes = extract_scenes(res, folder)
        packs.append({'scenes': scenes, 'sceneMusic': {name: music.get(101+i) for i,name in enumerate(['intro','outro','youwon'])}, 'id':index,'name':['The Original','Pack 2','Pack 3'][index], 'levels':len(levels),'music':tracks})
        print(f'Pack {index}: {len(levels)} levels, {sprite_count} sprites, {len(music)} music entries')
    (output/'manifest.json').write_text(json.dumps({'packs':packs,'sha256':provenance},indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--app', type=Path, default=ROOT/'research/extracted/app')
    parser.add_argument('--output', type=Path, default=ROOT/'public/assets')
    args=parser.parse_args()
    extract(args.app,args.output)
