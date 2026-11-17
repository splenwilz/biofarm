"""Marketing events: stored by hand (name, date, cost), their enquiries and
qualified opportunities counted from the Pipedrive mirror by the signals
Sales actually used (lead label, Deal Source, a title word, the event channel)."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import MarketingEvent
from app.reporting.events import EventRecord, MatchRules, assign_records, load_events
from app.reporting.schemas import DealOut, EnquiryOut

T = datetime(2025, 11, 6, 10, 0, tzinfo=UTC)


def rec(id: str, *, when: datetime = T, title: str = "", labels: tuple[str, ...] = (), deal_source: str | None = None, channel: str | None = None, qualified: bool = False) -> EventRecord:
    return EventRecord(id=id, created_at=when, title=title, label_ids=frozenset(labels), deal_source=deal_source, channel=channel, qualified=qualified)


def event(id: str, name: str, on: date, **rules) -> MarketingEvent:
    base = {"labels": [], "deal_sources": [], "title_words": [], "channel": False, "window_from": on.replace(day=1).isoformat(), "window_to": date(on.year + (on.month + 4 - 1) // 12, (on.month + 4 - 1) % 12 + 1, 1).isoformat()}
    return MarketingEvent(id=id, name=name, date=datetime(on.year, on.month, on.day, 9, tzinfo=UTC), type="trade_show", match={**base, **rules}, created_at=T, updated_at=T)


FBI_2025 = event("e1", "Farm Business Innovation 2025", date(2025, 11, 5), title_words=["FBI"], deal_sources=["Farm Business Innovation"], channel=True)
UKREIIF = event("e2", "UKREiiF 2026", date(2026, 5, 20), labels=["lab-ukreiif"])


def test_match_rules_read_the_stored_json_and_tolerate_missing_keys():
    rules = MatchRules.from_json({"labels": ["x"], "title_words": ["FBI"], "window_from": "2025-11-01", "window_to": "2026-03-01"})
    assert rules.labels == frozenset({"x"}) and rules.title_words == ("FBI",) and rules.deal_sources == frozenset() and rules.channel is False
    assert rules.window_from == date(2025, 11, 1) and rules.window_to == date(2026, 3, 1)
    with pytest.raises(ValueError):
        MatchRules.from_json({"window_from": "2025-11-01"})  # no window_to
    # a hand-edited empty word is dropped rather than compiled into a match-anything pattern
    loose = MatchRules.from_json({"title_words": ["FBI", "", "  "], "window_from": "2025-11-01", "window_to": "2026-03-01"})
    assert loose.title_words == ("FBI",)
    assert loose.signal(rec("1", when=T, title="A farmer near Bude"), "Trade Show / Event") is None


def test_a_record_joins_an_event_by_any_one_signal_inside_the_window():
    records = [
        rec("a", title="FBI: someone"),
        rec("b", deal_source="Farm Business Innovation"),
        rec("c", channel="Trade Show / Event"),
        rec("d", labels=("lab-ukreiif",), when=datetime(2026, 5, 21, tzinfo=UTC)),
        rec("e", title="FBI: too late", when=datetime(2026, 6, 1, tzinfo=UTC)),  # outside FBI's window
        rec("f", title="plain enquiry"),
    ]
    out = assign_records([FBI_2025, UKREIIF], records, "Trade Show / Event")
    assert out["e1"].ids == {"a", "b", "c"} and out["e2"].ids == {"d"}
    assert out["e1"].matched_by == {"title": 1, "deal_source": 1, "channel": 1}
    assert out["e2"].matched_by == {"label": 1}


def test_title_words_match_whole_words_case_insensitively_and_never_substrings():
    e = event("e", "Padel", date(2026, 8, 1), title_words=["padel"])
    out = assign_records([e], [rec("yes", title="BNG PADEL evening", when=datetime(2026, 8, 3, tzinfo=UTC)), rec("no", title="paddle steamer", when=datetime(2026, 8, 3, tzinfo=UTC))], "Trade Show / Event")
    assert out["e"].ids == {"yes"}


def test_a_record_counts_for_one_event_only_the_nearest_by_date():
    fbi_2024 = event("f24", "Farm Business Innovation 2024", date(2024, 11, 6), title_words=["FBI"], window_from="2024-11-01", window_to="2025-12-31")
    fbi_2025 = event("f25", "Farm Business Innovation 2025", date(2025, 11, 5), title_words=["FBI"], window_from="2024-11-01", window_to="2026-03-01")
    out = assign_records([fbi_2024, fbi_2025], [rec("late24", title="FBI x", when=datetime(2024, 12, 2, tzinfo=UTC)), rec("in25", title="FBI y", when=datetime(2025, 11, 7, tzinfo=UTC))], "Trade Show / Event")
    assert out["f24"].ids == {"late24"} and out["f25"].ids == {"in25"}


def test_qualified_is_counted_from_the_records():
    out = assign_records([FBI_2025], [rec("a", title="FBI a", qualified=True), rec("b", title="FBI b"), rec("c", title="FBI c", qualified=True)], "Trade Show / Event")
    assert (out["e1"].leads, out["e1"].qualified) == (3, 2)


def test_an_event_whose_stored_rules_are_unreadable_counts_nothing_instead_of_failing_the_payload(monkeypatch):
    import app.reporting.events as module

    warned: list[str] = []
    monkeypatch.setattr(module.log, "warning", lambda msg, *args: warned.append(msg % args))
    broken = MarketingEvent(id="b", name="Broken", date=T, type="cpd", match={}, created_at=T, updated_at=T)
    out = assign_records([broken, FBI_2025], [rec("a", title="FBI a")], "Trade Show / Event")
    assert out["b"].leads == 0 and out["e1"].ids == {"a"}
    assert warned and "Broken" in warned[0] and "window" in warned[0]


async def test_load_events_builds_records_from_the_mirror_and_the_enquiry_list(settings):
    """Lead enquiries read the lead's title, labels and Deal Source; deal
    enquiries read the deal's, and are qualified when the deal is."""
    from app.db import Base, make_engine
    from app.mirror.models import DealField, MirrorDeal, MirrorLead

    engine = make_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    code = "a" * 40
    async with Session() as s:
        s.add_all([
            DealField(field_code="channel", name="Source channel", field_type="enum", is_custom=False, options=[{"id": 1134, "label": "Trade Show / Event"}], raw={}, fetched_at=T),
            DealField(field_code=code, name="Deal Source", field_type="enum", is_custom=True, options=[{"id": 7, "label": "Farm Business Innovation"}], raw={}, fetched_at=T),
            MirrorLead(id="lead-1", title="FBI: a farmer", add_time=T, update_time=T, custom_fields={}, raw={"label_ids": []}, fetched_at=T),
            MirrorLead(id="lead-2", title="Someone", add_time=T, update_time=T, custom_fields={code: 7}, raw={"label_ids": ["lab-ukreiif"]}, fetched_at=T),
            MirrorDeal(id=5, title="Deal from the show", pipeline_id=3, stage_id=13, status="open", add_time=T, update_time=T, custom_fields={}, raw={}, fetched_at=T, channel=1134),
            MarketingEvent(id="e1", name="FBI 2025", date=T, type="trade_show", cost_gbp=1200.0, attendees=80, match={"title_words": ["FBI"], "deal_sources": ["Farm Business Innovation"], "channel": True, "window_from": "2025-11-01", "window_to": "2026-03-01"}, created_at=T, updated_at=T),
        ])
        await s.commit()
    enquiries = [
        EnquiryOut(id="lead-1", created_at=T, kind="lead", form=None, audience="other", channel="Trade Show / Event", source_label=None, campaign=None, landing_page=None, first_contact_at=None, person_id=None),
        EnquiryOut(id="lead-2", created_at=T, kind="lead", form=None, audience="other", channel="Website", source_label=None, campaign=None, landing_page=None, first_contact_at=None, person_id=None),
        EnquiryOut(id="5", created_at=T, kind="deal", form=None, audience="developer", channel="Trade Show / Event", source_label=None, campaign=None, landing_page=None, first_contact_at=None, person_id=None),
    ]
    deals = [DealOut(id="5", pipeline="developer", channel="Trade Show / Event", created_at=T, qualified_at=T, status="open", source_label=None, campaign=None, person_id=None)]
    async with Session() as s:
        out = await load_events(s, enquiries, deals)
        # a lead Sales ticked "Qualified Lead?" YES on (a qualified record under its lead id) counts for its event too
        ticked = DealOut(id="lead-1", pipeline="developer", channel="Trade Show / Event", created_at=T, qualified_at=T, status="open", source_label=None, campaign=None, person_id=None, qualification_status="YES")
        with_tick = await load_events(s, enquiries, deals + [ticked])
    await engine.dispose()
    assert len(out) == 1
    e = out[0]
    assert (e.id, e.name, e.cost_gbp, e.attendees) == ("e1", "FBI 2025", 1200.0, 80)
    assert (e.leads, e.qualified) == (3, 1)
    assert e.matched_by == {"title": 1, "deal_source": 1, "channel": 1}
    assert (with_tick[0].leads, with_tick[0].qualified) == (3, 2)


async def test_a_converted_deal_keeps_the_signals_of_the_lead_it_came_from(settings):
    """Pipedrive deletes a lead at conversion and copies no lead label onto the
    deal, so an event matched only by a label (UKREiiF, Groundswell) lost every
    qualified deal. The deal carries the id of its lead (source_lead_id) and the
    mirror keeps its own copy of the lead after Pipedrive drops it, so the deal
    inherits the copy's labels, and its Deal Source and channel where the deal
    has none. A deal whose lead was never mirrored counts as before."""
    from app.db import Base, make_engine
    from app.mirror.models import DealField, MirrorDeal, MirrorLead

    engine = make_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    code = "a" * 40
    may = datetime(2026, 5, 21, 10, 0, tzinfo=UTC)
    async with Session() as s:
        s.add_all([
            DealField(field_code="channel", name="Source channel", field_type="enum", is_custom=False, options=[{"id": 1134, "label": "Trade Show / Event"}], raw={}, fetched_at=T),
            DealField(field_code=code, name="Deal Source", field_type="enum", is_custom=True, options=[{"id": 7, "label": "Farm Business Innovation"}], raw={}, fetched_at=T),
            # the mirror's copy of a lead Pipedrive has since converted and deleted
            MirrorLead(id="lead-gone", title="A farmer", add_time=may, update_time=may, is_deleted=True, custom_fields={}, raw={"label_ids": ["lab-ukreiif"]}, fetched_at=may),
            MirrorLead(id="lead-gone-2", title="Another farmer", add_time=T, update_time=T, is_deleted=True, custom_fields={code: 7}, raw={"label_ids": []}, fetched_at=T),
            MirrorDeal(id=6, title="A farmer", pipeline_id=3, stage_id=13, status="open", add_time=may, update_time=may, custom_fields={}, raw={}, fetched_at=may, source_lead_id="lead-gone"),
            MirrorDeal(id=7, title="Another farmer", pipeline_id=3, stage_id=13, status="open", add_time=T, update_time=T, custom_fields={}, raw={}, fetched_at=T, source_lead_id="lead-gone-2"),
            MirrorDeal(id=8, title="Lead never mirrored", pipeline_id=3, stage_id=13, status="open", add_time=T, update_time=T, custom_fields={}, raw={}, fetched_at=T, source_lead_id="never-seen"),
            MarketingEvent(id="fbi", name="FBI 2025", date=T, type="trade_show", match={"deal_sources": ["Farm Business Innovation"], "window_from": "2025-11-01", "window_to": "2026-03-01"}, created_at=T, updated_at=T),
            MarketingEvent(id="ukreiif", name="UKREiiF 2026", date=may, type="trade_show", match={"labels": ["lab-ukreiif"], "window_from": "2026-05-01", "window_to": "2026-09-01"}, created_at=T, updated_at=T),
        ])
        await s.commit()
    enquiry = lambda id, when: EnquiryOut(id=id, created_at=when, kind="deal", form=None, audience="landowner", channel=None, source_label=None, campaign=None, landing_page=None, first_contact_at=None, person_id=None)  # noqa: E731
    enquiries = [enquiry("6", may), enquiry("7", T), enquiry("8", T)]
    deals = [DealOut(id="6", pipeline="landowner", channel=None, created_at=may, qualified_at=may, status="open", source_label=None, campaign=None, person_id=None)]
    async with Session() as s:
        out = {e.id: e for e in await load_events(s, enquiries, deals)}
    await engine.dispose()
    assert (out["ukreiif"].leads, out["ukreiif"].qualified, out["ukreiif"].matched_by) == (1, 1, {"label": 1})
    assert (out["fbi"].leads, out["fbi"].qualified, out["fbi"].matched_by) == (1, 0, {"deal_source": 1})


async def test_any_change_to_an_event_moves_updated_at_even_when_the_writer_forgets_to(settings):
    """The dashboard payload's cache key is the newest updated_at, so a write
    that leaves it alone would serve the old events until something else
    changed. The column's onupdate covers a writer that does not set it."""
    from sqlalchemy import select

    from app.db import Base, make_engine

    engine = make_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    old = datetime(2020, 1, 1, tzinfo=UTC)
    async with Session() as s:
        s.add(MarketingEvent(id="e1", name="Before", date=T, type="cpd", match={"window_from": "2025-11-01", "window_to": "2025-11-30"}, created_at=old, updated_at=old))
        await s.commit()
    async with Session() as s:
        event = (await s.execute(select(MarketingEvent))).scalar_one()
        event.name = "After"  # no updated_at set by hand
        await s.commit()
    async with Session() as s:
        event = (await s.execute(select(MarketingEvent))).scalar_one()
        assert event.name == "After" and event.updated_at > old
    await engine.dispose()


def test_the_matcher_stays_fast_at_the_largest_rules_the_api_accepts():
    """Fifty hundred-character title words on each of thirteen events, over a
    mirror-sized record set: one compiled alternation per event keeps this
    well under a second. Searching a fresh pattern per word took minutes,
    stalling the whole API process on every payload rebuild."""
    import random
    import string
    import time
    from datetime import timedelta

    rng = random.Random(1)
    word = lambda: "".join(rng.choices(string.ascii_lowercase, k=100))  # noqa: E731
    events = [
        MarketingEvent(id=f"e{i}", name=f"E{i}", date=T + timedelta(days=30 * i), type="cpd", match={"title_words": [word() for _ in range(50)], "window_from": "2024-01-01", "window_to": "2028-12-31"}, created_at=T, updated_at=T)
        for i in range(13)
    ]
    records = [rec(str(i), when=T + timedelta(days=i % 700), title=" ".join(rng.choices(string.ascii_lowercase, k=80))) for i in range(2300)]
    started = time.perf_counter()
    assign_records(events, records)
    assert time.perf_counter() - started < 3.0
