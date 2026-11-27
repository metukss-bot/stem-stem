import argparse

from .pipeline import process_inbox

p = argparse.ArgumentParser(description="StemStem inbox 분석")
p.add_argument("root", help="StemStem 폴더 (예: /content/drive/MyDrive/StemStem)")
p.add_argument("--device", default=None)
args = p.parse_args()
process_inbox(args.root, args.device)
