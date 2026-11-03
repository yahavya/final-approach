"""Publishes the game to GitHub Pages without stale-cache crashes.

Browsers keep files for about 10 minutes, so a new page could load old modules
and break. This copies the site, stamps every module import and the page's
script tag with this commit's version, and pushes the result to the gh-pages
branch, which is what GitHub Pages serves. Source files on main stay clean.

Run from the repository: python3 tools/release.py
"""
import pathlib, re, shutil, subprocess, tempfile

root = pathlib.Path(__file__).resolve().parent.parent
run = lambda *a, cwd=root: subprocess.run(a, cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()

if run('git', 'status', '--porcelain'):
    raise SystemExit('Commit or stash your changes first.')
version = run('git', 'rev-parse', '--short', 'HEAD')
remote = run('git', 'remote', 'get-url', 'origin')

out = pathlib.Path(tempfile.mkdtemp())
for name in ['index.html', 'README.md', 'src', 'vendor', 'assets', 'tests']:
    source = root / name
    (shutil.copytree if source.is_dir() else shutil.copy2)(source, out / name)

stamp = re.compile(r"""((?:from|import)\s*['"])(\.{1,2}/[^'"?]+\.js)(\?v=[^'"]*)?(['"])""")
for js in list(out.rglob('*.js')) + list(out.rglob('*.html')):
    if 'vendor' in js.parts:
        continue
    text = js.read_text()
    text = stamp.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(4)}", text)
    text = re.sub(r'(src="\./src/main\.js)(\?v=[^"]*)?"', rf'\1?v={version}"', text)
    js.write_text(text)
(out / '.nojekyll').write_text('')

run('git', 'init', '-q', '-b', 'gh-pages', cwd=out)
run('git', 'add', '-A', cwd=out)
run('git', '-c', 'user.name=yahavya', '-c', 'user.email=87262338+yahavya@users.noreply.github.com',
    'commit', '-q', '-m', f'Release {version}', cwd=out)
run('git', 'push', '-q', '-f', remote, 'gh-pages', cwd=out)
print(f'Published {version} to gh-pages')
