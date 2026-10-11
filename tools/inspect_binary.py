"""Recover VB6 module metadata and disassemble the native game without running it."""
from pathlib import Path
import hashlib, json, re, struct
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'research/extracted/app/JIII.exe'
pe = pefile.PE(str(source))
base = pe.OPTIONAL_HEADER.ImageBase
raw = source.read_bytes()
def data(va, size): return pe.get_data(va - base, size)
def u32(va): return struct.unpack('<I', data(va, 4))[0]
def u16(va): return struct.unpack('<H', data(va, 2))[0]
def name(va): return data(va, 200).split(b'\0')[0].decode('latin1')

vb = base + pe.get_rva_from_offset(raw.index(b'VB5!'))
project = u32(vb + 0x30)
table = u32(project + 4)
count = u16(table + 0x2a)
objects = u32(table + 0x30)
result = []
for i in range(count):
    obj = objects + i * 48
    result.append({'name': name(u32(obj + 24)), 'descriptor': hex(obj), 'info': hex(u32(obj))})
(ROOT / 'research/objects.json').write_text(json.dumps(result, indent=2))
cs = Cs(CS_ARCH_X86, CS_MODE_32)
cs.skipdata = True
start = 0x40e030
lines = []
for inst in cs.disasm(data(start, 0x473000 - start), start):
    lines.append(f'{inst.address:08x} {inst.mnemonic} {inst.op_str}')
assembly = '\n'.join(lines)
(ROOT / 'research/disassembly.txt').write_text(assembly)
addresses = {
    'initial_settings': 0x40e030, 'settings_conversion': 0x40f150,
    'choose_bonus': 0x429200, 'reset_powers': 0x42d230,
    'scene_object_transform': 0x436fb0, 'load_scenes': 0x43a3c0,
    'scene_player': 0x43f1f0, 'scene_read_command': 0x43fb50,
    'scene_translation_x': 0x4401f0, 'load_sounds': 0x444a60,
    'play_sounds': 0x442d70,
    'load_level': 0x417f40, 'bonus_dispatch': 0x4298a0,
    'destroy_brick': 0x42f270, 'damage_brick': 0x42fe20,
    'split': 0x430170, 'nine_balls': 0x430500,
    'enlarge_bat': 0x4308f0, 'pierce': 0x430ba0,
    'descend_wall': 0x430de0, 'explosive_ball': 0x431320,
    'power_ball': 0x431560, 'laser_bat': 0x4317a0,
    'lightning': 0x431ea0, 'sticky_bat': 0x4326a0,
    'shrink_bat': 0x432b00, 'enlarge_ball': 0x432db0,
    'shrink_ball': 0x433080, 'fast': 0x4332f0,
    'slow': 0x433550, 'lose_life': 0x4337b0,
    'extra_life': 0x435210, 'detonate': 0x435440,
    'rain': 0x4359f0, 'skip_level': 0x4444a0,
    'reveal_hidden': 0x448430, 'plus_5000': 0x448660,
    'minus_5000': 0x448880,
}
folder = ROOT / 'research/functions'
folder.mkdir(exist_ok=True)
functions = {int(f[:8], 16): f for f in re.split(r'(?=^\w+ push ebp$)', assembly, flags=re.M) if f.strip()}
for label, address in addresses.items():
    if address not in functions: raise ValueError(f'Function {label} not found at {address:x}')
    (folder / f'{label}.asm').write_text(functions[address])
report = {'binary_sha256': hashlib.sha256(raw).hexdigest(), 'vb_header': hex(vb), 'module_count': count, 'modules': result, 'identified_functions': {k:hex(v) for k,v in addresses.items()}}
(ROOT / 'research/binary-analysis.json').write_text(json.dumps(report, indent=2))
print(f'Recovered {count} module descriptors, {len(addresses)} identified function disassemblies, and the full native code listing.')
