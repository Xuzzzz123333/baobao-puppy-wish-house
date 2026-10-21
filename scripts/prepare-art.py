"""Encode original generated artwork for the mini program's size budget."""
from pathlib import Path
from PIL import Image
import shutil
import argparse

root = Path(__file__).resolve().parents[1]
original = root / 'assets' / 'puppy-storefront-original.png'
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, help='Optional newly generated storefront PNG')
args = parser.parse_args()
if args.source and args.source.resolve() != original.resolve():
    shutil.copyfile(args.source, original)
for input_path, output_name, dimensions in [
    (original, 'puppy-storefront-ui.jpg', (1280, 640)),
    (root / 'assets' / 'baobao-dog-avatar.png', 'puppy-avatar-ui.jpg', (480, 480)),
]:
    image = Image.open(input_path).convert('RGB')
    image.thumbnail(dimensions, Image.Resampling.LANCZOS)
    target = root / 'assets' / output_name
    image.save(target, quality=88, optimize=True)
    print(f'{output_name}: {image.size}, {target.stat().st_size} bytes')
