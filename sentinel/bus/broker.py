"""Fallback MQTT broker (pure Python, amqtt) for machines without Docker.

Primary broker is Mosquitto:  docker compose up -d broker
Fallback:                      .venv/Scripts/python -m sentinel.bus.broker
Listens on 1883 (TCP) and 9001 (WebSocket, for the browser UI).
"""
from __future__ import annotations

import asyncio


def main() -> None:
    from amqtt.broker import Broker

    config = {
        "listeners": {
            "default": {"type": "tcp", "bind": "0.0.0.0:1883"},
            "ws": {"type": "ws", "bind": "0.0.0.0:9001"},
        },
        "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}},
    }

    async def run() -> None:
        broker = Broker(config)
        await broker.start()
        print("amqtt broker on :1883 (tcp) and :9001 (ws)")
        await asyncio.Event().wait()

    asyncio.run(run())


if __name__ == "__main__":
    main()
