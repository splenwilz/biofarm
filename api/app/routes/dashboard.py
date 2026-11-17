"""/v1/dashboard: the marketing dashboard's records, and the few things the
dashboard writes back (marketing events, with their costs).

Read by the dashboard's server, never the browser, with a shared token in
the x-dashboard-token header. No token configured means nobody gets in. The
payload is built once per import and kept in memory: every page view asks
for it, and building it reads the whole mirror. A write changes the events
table, which is part of the payload's version, so the next read rebuilds.
"""

import secrets
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import APIKeyHeader
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.models import MarketingEvent
from app.reporting.schemas import DashboardDataOut, EventIn, EventStoredOut
from app.reporting.service import NoImportYet, build_dashboard_data, payload_version

token_header = APIKeyHeader(name="x-dashboard-token", auto_error=False)


def require_dashboard_token(request: Request, token: Annotated[str | None, Depends(token_header)]) -> None:
    expected = request.app.state.settings.dashboard_token.get_secret_value()
    if not expected:
        raise HTTPException(status_code=503, detail="Dashboard token not configured")
    if token is None or not secrets.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Not authenticated", headers={"WWW-Authenticate": "APIKey"})


router = APIRouter(prefix="/v1/dashboard", dependencies=[Depends(require_dashboard_token)])


def _missing_table(exc: Exception) -> bool:
    """SQLite says "no such table", Postgres "relation ... does not exist": a
    migration has not been applied, which a 503 with the remedy says better
    than a bare 500."""
    message = str(exc).lower()
    return "no such table" in message or "does not exist" in message


@router.get("", response_model=DashboardDataOut)
async def dashboard(request: Request, response: Response) -> DashboardDataOut:
    response.headers["Cache-Control"] = "no-store"
    state = request.app.state
    cached: tuple[tuple, DashboardDataOut] | None = getattr(state, "dashboard_cache", None)
    async with state.sessionmaker() as session:
        try:
            version = await payload_version(session)
            if version is None:
                raise HTTPException(status_code=503, detail="No Pipedrive import yet: run scripts/import_pipedrive.py first")
            if cached is not None and cached[0] == version:
                return cached[1]
            payload = await build_dashboard_data(session, state.settings, synced_at=version[0])
        except NoImportYet as exc:  # pragma: no cover - checked above; kept for a race with a deleted run row
            raise HTTPException(status_code=503, detail=f"No Pipedrive import yet: {exc}") from exc
        except (ProgrammingError, OperationalError) as exc:
            if not _missing_table(exc):
                raise
            raise HTTPException(status_code=503, detail="Database schema is behind the code: run `alembic upgrade head`") from exc
    state.dashboard_cache = (version, payload)
    return payload


def _stored(event: MarketingEvent) -> EventStoredOut:
    return EventStoredOut(id=event.id, name=event.name, date=event.date.date(), type=event.type, attendees=event.attendees, cost_gbp=event.cost_gbp, notes=event.notes, match=event.match, updated_at=event.updated_at)


def _apply(event: MarketingEvent, body: EventIn) -> None:
    event.name = body.name
    event.date = datetime(body.date.year, body.date.month, body.date.day, 9, tzinfo=UTC)
    event.type = body.type
    event.attendees = body.attendees
    event.cost_gbp = body.cost_gbp
    event.notes = body.notes
    event.match = body.match.model_dump(mode="json", by_alias=False)
    event.updated_at = datetime.now(UTC)


@router.post("/events", response_model=EventStoredOut, status_code=status.HTTP_201_CREATED)
async def create_event(body: EventIn, request: Request) -> EventStoredOut:
    async with request.app.state.sessionmaker() as session:
        event = MarketingEvent()
        _apply(event, body)
        session.add(event)
        await session.commit()
        await session.refresh(event)
        return _stored(event)


@router.put("/events/{event_id}", response_model=EventStoredOut)
async def update_event(event_id: str, body: EventIn, request: Request) -> EventStoredOut:
    async with request.app.state.sessionmaker() as session:
        event = await session.get(MarketingEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="No such event")
        _apply(event, body)
        await session.commit()
        await session.refresh(event)
        return _stored(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, request: Request) -> None:
    async with request.app.state.sessionmaker() as session:
        event = await session.get(MarketingEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="No such event")
        await session.delete(event)
        await session.commit()
