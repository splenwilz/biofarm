"""Deals as the dashboard counts them.

A deal belongs to the audience of the pipeline it was created in, found from
its stage history (the stage before its first move, else its current stage),
so a deal parked in a DORMANT pipeline or moved on to Legal keeps its
origin. Qualification follows the KPI rule in the config: Developer Pipeline
deals qualify at creation; Landowner Pipeline deals qualify when they first
leave CALL / QUALIFY for another stage of that pipeline.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.config import Settings
from app.mirror.models import DealField, DealStageHistory, MirrorDeal, Stage
from app.reporting.schemas import Channel, DealOut, DealStatus
from app.services.attribution import touch_label

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


def origin_stage(deal: MirrorDeal, history: list[DealStageHistory]) -> int | None:
    moves = sorted((h for h in history if h.old_stage_id is not None), key=lambda h: h.changed_at)
    return moves[0].old_stage_id if moves else deal.stage_id


def qualified_at(deal: MirrorDeal, history: list[DealStageHistory], origin_pipeline: int, first_stage: int | None, ctx: DealContext):
    s = ctx.settings
    if origin_pipeline == s.pipedrive_developer_pipeline_id:
        return deal.add_time
    if origin_pipeline == s.pipedrive_landowner_pipeline_id:
        if first_stage != s.pipedrive_landowner_qualify_stage_id:
            return deal.add_time
        past = [h for h in history if h.old_stage_id == s.pipedrive_landowner_qualify_stage_id and ctx.stage_pipeline.get(h.new_stage_id) == origin_pipeline]
        return min(past, key=lambda h: h.changed_at).changed_at if past else None
    return None


def derive_deal(deal: MirrorDeal, history: list[DealStageHistory], ctx: DealContext) -> DealOut | None:
    """The dashboard's view of one deal, or None when it is not marketing's
    (deleted, or created outside the audience pipelines)."""
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
    return DealOut(
        id=str(deal.id),
        pipeline=audience,
        channel=label if label in CHANNELS else None,
        created_at=deal.add_time,
        qualified_at=qualified_at(deal, history, origin_pipeline, first_stage, ctx),
        status=deal.status,
        source_label=source,
        campaign=campaign,
        person_id=deal.person_id,
    )


async def load_context(session: AsyncSession, settings: Settings) -> DealContext:
    stages = (await session.execute(select(Stage.id, Stage.pipeline_id))).all()
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
    return DealContext(stage_pipeline={s.id: s.pipeline_id for s in stages if s.pipeline_id is not None}, channel_labels=labels, utm_campaign_code=codes.get("UTM Campaign"),
                       settings=settings, touch_codes=touch, field_codes=codes)


MarketingDeals = list[tuple[MirrorDeal, DealOut]]


async def load_marketing_deals(session: AsyncSession, settings: Settings) -> tuple[DealContext, MarketingDeals]:
    """Every deal the KPI rule keeps, with its dashboard view, read once for
    both the deals and the enquiries sections. The raw API JSON on each row is
    not loaded: nothing here needs it and it is most of the table's bytes."""
    ctx = await load_context(session, settings)
    history: dict[int, list[DealStageHistory]] = defaultdict(list)
    for h in (await session.execute(select(DealStageHistory))).scalars():
        history[h.deal_id].append(h)
    stmt = select(MirrorDeal).options(defer(MirrorDeal.raw, raiseload=True)).where(MirrorDeal.is_deleted.is_(False)).order_by(MirrorDeal.add_time, MirrorDeal.id)
    kept: MarketingDeals = []
    for d in (await session.execute(stmt)).scalars():
        out = derive_deal(d, history.get(d.id, []), ctx)
        if out is not None:
            kept.append((d, out))
    return ctx, kept


async def load_deals(session: AsyncSession, settings: Settings) -> list[DealOut]:
    _, kept = await load_marketing_deals(session, settings)
    return [out for _, out in kept]


Audience = Literal["developer", "landowner"]
