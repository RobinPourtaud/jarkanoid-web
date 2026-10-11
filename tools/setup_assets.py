"""Download, verify, and extract the official installer without executing it."""
from pathlib import Path
import hashlib, shutil, subprocess, sys, urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://www.jarkanoid.com/Downloads/JARKANOID3.exe'
SHA256 = 'ec788786aa8578c7c1bef527a24df6266595dd7450f99b44e9bd174bc29a7736'

def run(*args): subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)

def main():
    for tool in ['innoextract', 'ffmpeg']:
        if not shutil.which(tool): raise SystemExit(f'{tool} is required. On macOS: brew install innoextract ffmpeg libopenmpt')
    venv = ROOT / '.venv'
    python = venv / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    if not python.exists(): run(sys.executable, '-m', 'venv', venv)
    run(python, '-m', 'pip', 'install', '-r', ROOT / 'tools/requirements.txt')
    research = ROOT / 'research'; research.mkdir(exist_ok=True)
    installer = research / 'JARKANOID3.exe'
    if not installer.exists():
        temp = installer.with_suffix('.part')
        print('Downloading the official installer (18.6 MiB)…', flush=True)
        request = urllib.request.Request(URL, headers={'User-Agent':'Jarkanoid-preservation-port/0.1'})
        with urllib.request.urlopen(request, timeout=120) as response, temp.open('wb') as output: shutil.copyfileobj(response, output)
        if hashlib.sha256(temp.read_bytes()).hexdigest() != SHA256:
            raise SystemExit('Installer checksum changed. Inspect the new download before updating the pinned checksum.')
        temp.replace(installer)
    if hashlib.sha256(installer.read_bytes()).hexdigest() != SHA256: raise SystemExit('Installer checksum mismatch.')
    run('innoextract', '-s', '-d', research / 'extracted', installer)
    run(python, ROOT / 'tools/extract_assets.py')
    run(python, ROOT / 'tools/render_music.py')
    print('All 110 levels and original assets are ready. Run npm run dev.', flush=True)

if __name__ == '__main__': main()
