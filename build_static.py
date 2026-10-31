"""Build the public site using an explicit file list; never publish local data."""
import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC_FILES = (
    'index.html', 'styles.css', 'app.js', 'model-worker.js',
    'MAP_WR_Media6.py', 'MAP_WR_Media9.py',
    'Example_6.xlsx', 'Example_9.xlsx', '模型原理与引用.docx',
    'vendor/xlsx.full.min.js', '.nojekyll',
)


def build(destination=None):
    destination = Path(destination or ROOT / '_site').resolve()
    if destination == ROOT or ROOT in destination.parents and destination != ROOT / '_site':
        raise ValueError('Use _site in the project, or a separate output directory.')
    for relative in PUBLIC_FILES:
        source = ROOT / relative
        if not source.is_file():
            raise FileNotFoundError(f'Missing public file: {relative}')
    destination.mkdir(parents=True, exist_ok=True)
    # Refuse unknown files instead of deleting or accidentally publishing them.
    unknown = [p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file() and p.relative_to(destination).as_posix() not in PUBLIC_FILES]
    if unknown:
        raise ValueError(f'Output contains unexpected files: {unknown}')
    for relative in PUBLIC_FILES:
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, target)
    print(f'Static website ready: {destination} ({len(PUBLIC_FILES)} files)')
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    build(parser.parse_args().output)
