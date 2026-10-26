import os
import sys

BENCH = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.abspath(os.path.join(BENCH, "../../../../.."))
CLIPS = os.environ.get("FOCUS_REFS_CLIPS", os.path.join(REPO, "docs/focus-refs/clips"))
sys.path.insert(0, BENCH)
