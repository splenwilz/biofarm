from typing import AsyncIterator

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Lead
from app.schemas import ContactSubmission, LeadSubmissionBase, NewsletterSubmission
from app.services.spam import evaluate_spam
from app.services.sync import process_lead


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessionmaker() as session:
        yield session


async def enforce_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    allowed = await request.app.state.rate_limiter.hit(
        request.app.state.rate_limit_item, "leads", ip
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many requests")


router = APIRouter(prefix="/v1/leads", dependencies=[Depends(enforce_rate_limit)])


async def _accept_lead(
    submission: LeadSubmissionBase,
    lead: Lead,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession,
) -> dict:
    settings = request.app.state.settings
    verdict = evaluate_spam(submission, min_fill_seconds=settings.min_fill_seconds)

    lead.client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    lead.user_agent = user_agent[:512] if user_agent else None
    lead.spam_flagged = verdict.is_spam
    lead.spam_reasons = verdict.reasons

    if verdict.is_spam:
        lead.sync_status = "skipped_spam"
    elif not settings.pipedrive_enabled:
        lead.sync_status = "disabled"  # GA4 may still fire below

    session.add(lead)
    await session.commit()

    if not verdict.is_spam and (settings.pipedrive_enabled or settings.ga4_enabled):
        background_tasks.add_task(
            process_lead, lead.id, request.app.state.sessionmaker, settings
        )

    return {"status": "accepted", "id": lead.id}


@router.post("/contact", status_code=202)
async def submit_contact(
    submission: ContactSubmission,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    lead = Lead(
        form="contact",
        name=submission.name,
        email=submission.email,
        phone=submission.phone,
        message=submission.message,
        fields=list(submission.fields),
        newsletter_opt_in=submission.newsletter_opt_in,
        page=submission.page,
        attribution=submission.attribution.model_dump(exclude_none=True)
        if submission.attribution
        else None,
        first_touch=submission.first_touch.model_dump(exclude_none=True)
        if submission.first_touch
        else None,
        ga_client_id=submission.ga_client_id,
        ga_session_id=submission.ga_session_id,
    )
    return await _accept_lead(submission, lead, request, background_tasks, session)


@router.post("/newsletter", status_code=202)
async def submit_newsletter(
    submission: NewsletterSubmission,
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> dict:
    lead = Lead(
        form="newsletter",
        name=submission.name,
        email=submission.email,
        fields=[submission.field] if submission.field else [],
        # signing up to the newsletter IS the consent
        newsletter_opt_in=True,
        page=submission.page,
        attribution=submission.attribution.model_dump(exclude_none=True)
        if submission.attribution
        else None,
        first_touch=submission.first_touch.model_dump(exclude_none=True)
        if submission.first_touch
        else None,
        ga_client_id=submission.ga_client_id,
        ga_session_id=submission.ga_session_id,
    )
    return await _accept_lead(submission, lead, request, background_tasks, session)
