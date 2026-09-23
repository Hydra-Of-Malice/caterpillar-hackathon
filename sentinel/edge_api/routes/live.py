"""Live view: GET /live/snapshot and WS /ws/live (snapshot 2 Hz + alert/eta/task/health/window frames)."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from sentinel.edge_api.routes import get_rt
from sentinel.edge_api.runtime import EdgeRuntime

router = APIRouter(tags=["live"])


@router.get("/live/snapshot")
def live_snapshot(rt: EdgeRuntime = Depends(get_rt)) -> dict[str, Any]:
    """Seatbelt, proximity sectors, travel speed, idle today, current task progress, ETA, alert slot."""
    return rt.snapshot()


@router.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    rt: EdgeRuntime = ws.app.state.runtime
    await ws.accept()
    queue = rt.ws_register()
    try:
        await ws.send_json({"type": "health", "data": rt.health()})
        await ws.send_json({"type": "snapshot", "data": rt.snapshot()})
        receiver = asyncio.create_task(_drain(ws))
        while not receiver.done():
            getter = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait({getter, receiver}, return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                await ws.send_json(getter.result())
            else:
                getter.cancel()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        rt.ws_unregister(queue)


async def _drain(ws: WebSocket) -> None:
    """Consume client messages until the socket closes (the stream is server → client only)."""
    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        return
