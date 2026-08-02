import asyncio
import json

from app.platform.quarantine_replay_service import replay_due


def main() -> None:
    result = asyncio.run(replay_due(limit=100))
    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
