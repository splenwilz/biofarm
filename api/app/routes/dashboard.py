"""GET /v1/dashboard: the marketing dashboard's records.

Read by the dashboard's server, never the browser, with a shared token in
the x-dashboard-token header. No token configured means nobody gets in. The
payload is built once per import and kept in memory: every page view asks
for it, and building it reads the whole mirror.
"""

import secrets
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import APIKeyHeader

from app.reporting.schemas import DashboardDataOut
from app.reporting.service import NoImportYet, build_dashboard_data, payload_version

token_header = APIKeyHeader(name="x-dashboard-token", auto_error=False)


def require_dashboard_token(request: Request, token: Annotated[str | None, Depends(token_header)]) -> None:
    expected = request.app.state.settings.dashboard_token.get_secret_value()
    if not expected:
        raise HTTPException(status_code=503, detail="Dashboard token not configured")
    if token is None or not secrets.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Not authenticated", headers={"WWW-Authenticate": "APIKey"})


router = APIRouter(prefix="/v1/dashboard", dependencies=[Depends(require_dashboard_token)])


@router.get("", response_model=DashboardDataOut)
async def dashboard(request: Request, response: Response) -> DashboardDataOut:
    response.headers["Cache-Control"] = "no-store"
    state = request.app.state
    cached: tuple[tuple[datetime, datetime | None], DashboardDataOut] | None = getattr(state, "dashboard_cache", None)
    async with state.sessionmaker() as session:
        version = await payload_version(session)
        if version is None:
            raise HTTPException(status_code=503, detail="No Pipedrive import yet: run scripts/import_pipedrive.py first")
        if cached is not None and cached[0] == version:
            return cached[1]
        try:
            payload = await build_dashboard_data(session, state.settings, synced_at=version[0])
        except NoImportYet as exc:  # pragma: no cover - checked above; kept for a race with a deleted run row
            raise HTTPException(status_code=503, detail=f"No Pipedrive import yet: {exc}") from exc
    state.dashboard_cache = (version, payload)
    return payload
