"""Deals as the dashboard counts them.

A deal belongs to the audience of the pipeline it was created in, found from
its stage history (the stage before its first move, else its current stage),
so a deal parked in a DORMANT pipeline or moved on to Legal keeps its
origin. Qualification follows the KPI rule in the config. Until 17 Nov 2026:
Developer Pipeline deals qualify at creation; Landowner Pipeline deals qualify
when they first leave CALL / QUALIFY for another stage of that pipeline. From
that day Sales tick a "Qualified Lead?" field on every lead and deal, and the
tick decides: a deal (or a still-open lead, see enquiries.py) received on or
after the start date qualifies when the field says YES, at the moment the
changelog saw the tick or else when the record came in, and not otherwise. A
deal converted from a lead counts from the lead's date, as the enquiry does.
"""

import logging
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.config import Settings
from app.mirror.models import DealChange, DealField, DealStageHistory, MirrorDeal, MirrorLead, MirrorOrganization, MirrorPerson, MirrorUser, Stage
from app.reporting.schemas import Channel, DealOut, DealStatus
from app.services.attribution import touch_label

logger = logging.getLogger(__name__)

CHANNELS: frozenset[str] = frozenset(Channel.__args__)
STATUSES: frozenset[str] = frozenset(DealStatus.__args__)


@dataclass(frozen=True)
class DealContext:
    """What every deal is read against: which pipeline each stage belongs to,
    the Source channel labels by option id, and the UTM Campaign field code."""

    stage_pipeline: dict[int, int]
    channel_labels: dict[int, str]
    utm_campaign_code: str | None
    settings: Settings
    # utm_source / utm_medium / referrer -> the custom field code that holds it
    touch_codes: dict[str, str] = field(default_factory=dict)
    # Other custom fields by name (Landing Page), for the enquiry loader
    field_codes: dict[str, str] = field(default_factory=dict)
    # The "Qualified Lead?" field: its code, its options by id and the id of
    # YES; None when the mirror has no such field (the pipeline rule applies).
    qualified_code: str | None = None
    qualified_options: Mapping[int, str] = field(default_factory=dict)
    qualified_yes: int | None = None
    # When the changelog first saw each deal's field set to YES.
    qualified_ticks: Mapping[int, datetime] = field(default_factory=dict)
    # Names for the qualified-opportunities list: stages, users (creator and
    # owner), persons and the organisation each person belongs to.
    stage_names: Mapping[int, str] = field(default_factory=dict)
    user_names: Mapping[int, str] = field(default_factory=dict)
    person_names: Mapping[int, str] = field(default_factory=dict)
    person_orgs: Mapping[int, int] = field(default_factory=dict)
    org_names: Mapping[int, str] = field(default_factory=dict)


def _option_id(value: object) -> int | None:
    """An option field's value as the mirror holds it: an int from v2 deals,
    its text from v1 leads, nothing when unset."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    return int(text) if text.isdigit() else None


def qualification_status(custom_fields: object, ctx: DealContext) -> str | None:
    """The "Qualified Lead?" option label a record carries, or None."""
    if not ctx.qualified_code or not isinstance(custom_fields, Mapping):
        return None
    option = _option_id(custom_fields.get(ctx.qualified_code))
    return ctx.qualified_options.get(option) if option is not None else None


def says_yes(custom_fields: object, ctx: DealContext) -> bool:
    if ctx.qualified_yes is None or not ctx.qualified_code or not isinstance(custom_fields, Mapping):
        return False
    return _option_id(custom_fields.get(ctx.qualified_code)) == ctx.qualified_yes


def tick_rule_applies(received: datetime, ctx: DealContext) -> bool:
    """Whether a record received at `received` is judged by the tick: the rule
    is on, the mirror knows the field, and the date is on or after the start."""
    start = ctx.settings.pipedrive_qualified_rule_from
    return start is not None and ctx.qualified_code is not None and received.date() >= start


def origin_stage(deal: MirrorDeal, history: list[DealStageHistory]) -> int | None:
    moves = sorted((h for h in history if h.old_stage_id is not None), key=lambda h: h.changed_at)
    return moves[0].old_stage_id if moves else deal.stage_id


def day(at: datetime) -> str:
    """"29 Sep 2026", the way the dashboard writes dates."""
    return f"{at.day} {at:%b %Y}"


def qualification(deal: MirrorDeal, history: list[DealStageHistory], origin_pipeline: int, first_stage: int | None, ctx: DealContext, received: datetime | None = None) -> tuple[datetime | None, str | None]:
    """When the record qualified and why, in words; (None, None) while it has
    not. `received` is when the enquiry came in: the lead's date for a deal
    converted from one, else the deal's own."""
    s = ctx.settings
    received = received or deal.add_time
    if received is not None and tick_rule_applies(received, ctx):
        if not says_yes(deal.custom_fields, ctx):
            return None, None
        tick = ctx.qualified_ticks.get(deal.id)
        if tick is not None:
            return tick, f"Sales ticked {s.pipedrive_qualified_field_name} {s.pipedrive_qualified_yes_label} on {day(tick)}"
        return received, f"{s.pipedrive_qualified_field_name} {s.pipedrive_qualified_yes_label} when it came in, {day(received)}"
    if origin_pipeline == s.pipedrive_developer_pipeline_id:
        return deal.add_time, "Created in the Developer Pipeline: qualified on arrival"
    if origin_pipeline == s.pipedrive_landowner_pipeline_id:
        if first_stage != s.pipedrive_landowner_qualify_stage_id:
            return deal.add_time, "Landowner Pipeline: created past CALL / QUALIFY, qualified on arrival"
        past = [h for h in history if h.old_stage_id == s.pipedrive_landowner_qualify_stage_id and ctx.stage_pipeline.get(h.new_stage_id) == origin_pipeline]
        if not past:
            return None, None
        at = min(past, key=lambda h: h.changed_at).changed_at
        return at, f"Landowner Pipeline: moved past CALL / QUALIFY on {day(at)}"
    return None, None


def qualified_at(deal: MirrorDeal, history: list[DealStageHistory], origin_pipeline: int, first_stage: int | None, ctx: DealContext, received: datetime | None = None):
    return qualification(deal, history, origin_pipeline, first_stage, ctx, received)[0]


def origin_kind(origin: str | None, s: Settings) -> Literal["website", "team", "import"] | None:
    """How a record came in, from Pipedrive's origin: a web form or our API is
    the website, a bulk import is an import, anything else was made by hand."""
    if origin is None:
        return None
    if origin in s.enquiry_website_origins:
        return "website"
    if origin in s.enquiry_excluded_deal_origins:
        return "import"
    return "team"


def derive_deal(deal: MirrorDeal, history: list[DealStageHistory], ctx: DealContext, *, received: datetime | None = None) -> DealOut | None:
    """The dashboard's view of one deal, or None when it is not marketing's
    (deleted, or created outside the audience pipelines). `received` is the
    date of the lead the deal was converted from, when the mirror has it."""
    if deal.is_deleted or deal.add_time is None or deal.status not in STATUSES:
        return None
    first_stage = origin_stage(deal, history)
    origin_pipeline = ctx.stage_pipeline.get(first_stage, deal.pipeline_id) if first_stage is not None else deal.pipeline_id
    audience = ctx.settings.pipedrive_pipeline_audiences.get(origin_pipeline) if origin_pipeline is not None else None
    if audience not in ("developer", "landowner"):
        return None
    label = ctx.channel_labels.get(deal.channel) if deal.channel is not None else None
    if label is None and deal.origin in ctx.settings.enquiry_website_origins:
        label = "Website"  # came through the website (our API or a Pipedrive web form) with no channel set
    campaign = deal.custom_fields.get(ctx.utm_campaign_code) if ctx.utm_campaign_code and isinstance(deal.custom_fields, dict) else None
    campaign = campaign.strip() if isinstance(campaign, str) and campaign.strip() else None
    fields = deal.custom_fields if isinstance(deal.custom_fields, dict) else {}
    source = touch_label({key: fields.get(code) for key, code in ctx.touch_codes.items()})
    if source is None and deal.channel_id and "/" in deal.channel_id:
        source = deal.channel_id  # already a "source/medium" label
    at, why = qualification(deal, history, origin_pipeline, first_stage, ctx, received)
    org_id = ctx.person_orgs.get(deal.person_id) if deal.person_id is not None else None
    return DealOut(
        id=str(deal.id),
        pipeline=audience,
        channel=label if label in CHANNELS else None,
        created_at=deal.add_time,
        qualified_at=at,
        status=deal.status,
        source_label=source,
        campaign=campaign,
        person_id=deal.person_id,
        qualification_status=qualification_status(deal.custom_fields, ctx),
        title=deal.title,
        person_name=ctx.person_names.get(deal.person_id) if deal.person_id is not None else None,
        organisation=ctx.org_names.get(org_id) if org_id is not None else None,
        stage=ctx.stage_names.get(deal.stage_id) if deal.stage_id is not None else None,
        origin=origin_kind(deal.origin, ctx.settings),
        created_by=ctx.user_names.get(deal.creator_user_id) if deal.creator_user_id is not None else None,
        owner=ctx.user_names.get(deal.owner_id) if deal.owner_id is not None else None,
        source_lead_id=deal.source_lead_id,
        qualified_by=why,
    )


async def load_context(session: AsyncSession, settings: Settings) -> DealContext:
    stages = (await session.execute(select(Stage.id, Stage.pipeline_id, Stage.name))).all()
    users = {uid: name for uid, name in (await session.execute(select(MirrorUser.id, MirrorUser.name))).all() if name}
    persons = (await session.execute(select(MirrorPerson.id, MirrorPerson.name, MirrorPerson.org_id).where(MirrorPerson.is_deleted.is_(False)))).all()
    orgs = {oid: name for oid, name in (await session.execute(select(MirrorOrganization.id, MirrorOrganization.name).where(MirrorOrganization.is_deleted.is_(False)))).all() if name}
    channel_field = await session.get(DealField, "channel")
    labels: dict[int, str] = {}
    for option in (channel_field.options if channel_field and channel_field.options else []):
        if isinstance(option, dict) and isinstance(option.get("id"), int) and isinstance(option.get("label"), str):
            labels[option["id"]] = option["label"]
    wanted = ["UTM Campaign", "UTM Source", "UTM Medium", "Referrer", "Landing Page"]
    codes: dict[str, str] = {}
    for code, name in (await session.execute(select(DealField.field_code, DealField.name).where(DealField.name.in_(wanted), DealField.is_custom.is_(True)).order_by(DealField.field_code))).all():
        codes.setdefault(name, code)
    touch = {key: codes[name] for key, name in (("utm_source", "UTM Source"), ("utm_medium", "UTM Medium"), ("referrer", "Referrer")) if name in codes}
    qualified_code, qualified_options, qualified_yes = await _qualified_field(session, settings)
    return DealContext(stage_pipeline={s.id: s.pipeline_id for s in stages if s.pipeline_id is not None}, channel_labels=labels, utm_campaign_code=codes.get("UTM Campaign"),
                       settings=settings, touch_codes=touch, field_codes=codes, qualified_code=qualified_code, qualified_options=qualified_options, qualified_yes=qualified_yes,
                       stage_names={s.id: s.name for s in stages if s.name}, user_names=users,
                       person_names={pid: name for pid, name, _ in persons if name}, person_orgs={pid: org for pid, _, org in persons if org is not None}, org_names=orgs)


async def _qualified_field(session: AsyncSession, settings: Settings) -> tuple[str | None, dict[int, str], int | None]:
    """The "Qualified Lead?" field as the mirror last read it: code, options
    and the id of the YES option. Missing pieces are logged, since the rule
    then silently falls back to the pipeline rule."""
    if settings.pipedrive_qualified_rule_from is None:
        return None, {}, None
    name = settings.pipedrive_qualified_field_name
    stmt = select(DealField).where(DealField.name == name, DealField.is_custom.is_(True)).order_by(DealField.field_code)
    fields = (await session.execute(stmt)).scalars().all()
    if not fields:
        logger.warning("the mirror has no deal field named %r; the pipeline rule applies to every deal until the next import brings it", name)
        return None, {}, None
    if len(fields) > 1:  # the account already has two fields called "Estimated Area (Ha)"; say which one the rule reads
        logger.warning("%d deal fields named %r (%s); the rule reads %s, the lowest code", len(fields), name, ", ".join(f.field_code for f in fields), fields[0].field_code)
    options = {o["id"]: o["label"] for o in (fields[0].options or []) if isinstance(o, dict) and isinstance(o.get("id"), int) and isinstance(o.get("label"), str)}
    wanted = settings.pipedrive_qualified_yes_label.strip().casefold()
    yes = next((oid for oid, label in options.items() if label.strip().casefold() == wanted), None)
    if yes is None:
        logger.warning("deal field %r has no option labelled %r (it has %s); nothing counts as qualified by the tick", name, settings.pipedrive_qualified_yes_label, list(options.values()))
        return None, {}, None
    return fields[0].field_code, options, yes


async def _qualified_ticks(session: AsyncSession, ctx: DealContext) -> dict[int, datetime]:
    if not ctx.qualified_code or ctx.qualified_yes is None:
        return {}
    stmt = (select(DealChange.deal_id, func.min(DealChange.changed_at)).where(DealChange.field_key == ctx.qualified_code, DealChange.new_value == str(ctx.qualified_yes))
            .group_by(DealChange.deal_id))
    return {deal_id: at for deal_id, at in (await session.execute(stmt)).all() if at is not None}


MarketingDeals = list[tuple[MirrorDeal, DealOut]]


async def load_marketing_deals(session: AsyncSession, settings: Settings) -> tuple[DealContext, MarketingDeals]:
    """Every deal the KPI rule keeps, with its dashboard view, read once for
    both the deals and the enquiries sections. The raw API JSON on each row is
    not loaded: nothing here needs it and it is most of the table's bytes."""
    ctx = await load_context(session, settings)
    ctx = replace(ctx, qualified_ticks=await _qualified_ticks(session, ctx))
    history: dict[int, list[DealStageHistory]] = defaultdict(list)
    for h in (await session.execute(select(DealStageHistory))).scalars():
        history[h.deal_id].append(h)
    # When each lead came in, the mirror's deleted copies included: a converted deal is judged from its lead's date.
    lead_dates = {lead_id: at for lead_id, at in (await session.execute(select(MirrorLead.id, MirrorLead.add_time))).all() if at is not None}
    stmt = select(MirrorDeal).options(defer(MirrorDeal.raw, raiseload=True)).where(MirrorDeal.is_deleted.is_(False)).order_by(MirrorDeal.add_time, MirrorDeal.id)
    kept: MarketingDeals = []
    for d in (await session.execute(stmt)).scalars():
        out = derive_deal(d, history.get(d.id, []), ctx, received=lead_dates.get(d.source_lead_id) if d.source_lead_id else None)
        if out is not None:
            kept.append((d, out))
    return ctx, kept


async def load_deals(session: AsyncSession, settings: Settings) -> list[DealOut]:
    _, kept = await load_marketing_deals(session, settings)
    return [out for _, out in kept]


Audience = Literal["developer", "landowner"]
