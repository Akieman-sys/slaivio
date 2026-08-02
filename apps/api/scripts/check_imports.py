"""Import the application exactly as the process manager does at startup."""

from importlib import import_module
from pathlib import Path
import sys


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


def main() -> None:
    module = import_module("app.main")
    if not hasattr(module, "app"):
        raise RuntimeError("app.main did not expose a FastAPI application")
    print("OK import app.main")


if __name__ == "__main__":
    main()
