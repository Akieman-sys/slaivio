from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(
        self,
        org_id: str,
        manager_id: str,
        websocket: WebSocket,
    ):
        await websocket.accept()
        if org_id not in self.connections:
            self.connections[org_id] = {}

        self.connections[org_id][manager_id] = websocket

    def disconnect(
        self,
        org_id: str,
        manager_id: str,
    ):
        if org_id in self.connections:
            self.connections[org_id].pop(
                manager_id,
                None,
            )

            if not self.connections[org_id]:
                del self.connections[org_id]

    async def broadcast_to_org(
        self,
        org_id: str,
        payload: dict,
    ):
        org_connections = self.connections.get(
            org_id,
            {},
        )
        disconnected = []

        for manager_id, websocket in org_connections.items():
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(manager_id)

        for manager_id in disconnected:
            self.disconnect(
                org_id,
                manager_id,
            )

    async def broadcast_to_manager(
        self,
        org_id: str,
        manager_id: str,
        payload: dict,
    ):
        websocket = self.connections.get(
            org_id,
            {},
        ).get(manager_id)

        if websocket:
            await websocket.send_json(payload)

    async def broadcast(
        self,
        payload: dict,
    ):
        org_id = payload.get("org_id")
        if not org_id:
            raise ValueError("org_id is required for tenant-scoped broadcasts")
        await self.broadcast_to_org(
            org_id,
            payload,
        )


manager = ConnectionManager()
