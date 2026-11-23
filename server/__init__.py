import os

# F1 (final checkpoint): Ultralytics loads a checkpoint with torch.load(weights_only=False)
# unless this flag is on, and a crafted .pt file then runs code on the server. The flag is
# read once when ultralytics is first imported, so it is set here, before any server module
# can import it. Every bundled model and every model this app trains loads with it on.
os.environ.setdefault("ULTRALYTICS_SAFE_LOAD", "1")
