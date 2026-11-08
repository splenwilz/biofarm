"""Turning the mirror into the dashboard's records: the KPI rule applied to real deals."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import Base
from app.mirror.models import (
    Activity,
    CampaignStat,
    DealField,
    DealStageHistory,
    ImportRun,
    MarketingStatusChange,
    MirrorDeal,
    MirrorLead,
    MirrorPerson,
    Pipeline,
    Stage,
)
from app.models import Lead
from app.reporting.deals import DealContext, derive_deal, load_deals
from app.reporting.enquiries import (
    Candidate,
    EnquiryContext,
    candidates_from,
    contact_times,
    derive,
    first_contact,
    load_enquiries,
)
from app.reporting.newsletter import issues_from, subscriber_months
from app.reporting.service import NoImportYet, build_dashboard_data

T = datetime(2026, 9, 29, 10, 31, 28, tzinfo=UTC)
LATER = datetime(2026, 10, 7, 13, 47, 29, tzinfo=UTC)
H = timedelta(hours=1)
UTM_CAMPAIGN = "25d5b56aeb0185949c5876617bb88f346c89d139"


def settings(**over) -> Settings:
    return Settings(_env_file=None, environment="test", **over)


def ctx(**over) -> DealContext:
    base = dict(
        stage_pipeline={13: 3, 14: 3, 44: 7, 61: 7, 6: 2, 7: 2, 10: 2, 38: 6, 23: 4},
        channel_labels={1037: "Website", 1136: "Existing Network", 1134: "Trade Show / Event"},
        utm_campaign_code=UTM_CAMPAIGN,
        touch_codes={"utm_source": "s1", "utm_medium": "m1", "referrer": "r1"},
        settings=settings(),
    )
    base.update(over)
    return DealContext(**base)


def deal(**over) -> MirrorDeal:
    base = dict(id=1, title="D", pipeline_id=3, stage_id=13, status="open", channel=1037, channel_id="google / cpc", person_id=501,
                add_time=T, update_time=T, is_archived=False, is_deleted=False, custom_fields={UTM_CAMPAIGN: "spring-push"}, raw={}, fetched_at=T)
    base.update(over)
    return MirrorDeal(**base)


def move(deal_id, old, new, at) -> DealStageHistory:
    return DealStageHistory(deal_id=deal_id, old_stage_id=old, new_stage_id=new, changed_at=at)


class TestDeveloperDeals:
    def test_created_in_the_developer_pipeline_qualifies_at_creation(self):
        out = derive_deal(deal(), [], ctx())
        assert out is not None
        assert out.pipeline == "developer" and out.qualified_at == T and out.created_at == T
        assert out.channel == "Website" and out.source_label == "google / cpc" and out.campaign == "spring-push"
        assert out.person_id == 501 and out.status == "open" and out.id == "1"

    def test_moved_to_dormant_keeps_its_qualification(self):
        d = deal(pipeline_id=7, stage_id=61)
        out = derive_deal(d, [move(1, 13, 14, T), move(1, 14, 61, LATER)], ctx())
        assert out.pipeline == "developer" and out.qualified_at == T

    def test_created_directly_in_dormant_developers_is_developer_but_not_qualified(self):
        out = derive_deal(deal(pipeline_id=7, stage_id=44), [], ctx())
        assert out.pipeline == "developer" and out.qualified_at is None

    def test_created_in_developer_then_moved_to_legal_keeps_its_qualification(self):
        out = derive_deal(deal(pipeline_id=4, stage_id=23), [move(1, 14, 23, LATER)], ctx())
        assert out.pipeline == "developer" and out.qualified_at == T


class TestLandownerDeals:
    def test_qualifies_when_it_first_moves_past_call_qualify(self):
        d = deal(pipeline_id=2, stage_id=10)
        out = derive_deal(d, [move(1, 6, 7, LATER), move(1, 7, 10, LATER)], ctx())
        assert out.pipeline == "landowner" and out.qualified_at == LATER

    def test_still_in_call_qualify_is_not_qualified(self):
        out = derive_deal(deal(pipeline_id=2, stage_id=6), [], ctx())
        assert out.pipeline == "landowner" and out.qualified_at is None

    def test_moved_from_call_qualify_straight_to_dormant_is_not_qualified(self):
        out = derive_deal(deal(pipeline_id=6, stage_id=38), [move(1, 6, 38, LATER)], ctx())
        assert out.pipeline == "landowner" and out.qualified_at is None

    def test_created_past_call_qualify_qualifies_at_creation(self):
        out = derive_deal(deal(pipeline_id=2, stage_id=7), [move(1, 7, 10, LATER)], ctx())
        assert out.qualified_at == T

    def test_created_in_dormant_landowners_is_not_qualified(self):
        out = derive_deal(deal(pipeline_id=6, stage_id=38), [], ctx())
        assert out.pipeline == "landowner" and out.qualified_at is None


class TestDealSourceLabel:
    """The deal's "source/medium" comes from its UTM Source, UTM Medium and Referrer
    fields (the lead API writes them and they survive conversion); the channel id
    string only counts when it already is such a label."""

    def test_utm_fields_make_the_label(self):
        assert derive_deal(deal(channel_id=None, custom_fields={"s1": "bing", "m1": "cpc"}), [], ctx()).source_label == "bing/cpc"
        assert derive_deal(deal(channel_id=None, custom_fields={"r1": "https://www.google.com/"}), [], ctx()).source_label == "google.com/referral"

    def test_a_form_name_in_the_channel_id_is_not_a_label(self):
        assert derive_deal(deal(channel_id="Contact us", custom_fields={}), [], ctx()).source_label is None
        assert derive_deal(deal(channel_id="google/cpc", custom_fields={}), [], ctx()).source_label == "google/cpc"
        assert derive_deal(deal(channel_id="google/cpc", custom_fields={"s1": "bing", "m1": "cpc"}), [], ctx()).source_label == "bing/cpc"


class TestWebsiteChannelFallback:
    """Until BIOFARM_PIPEDRIVE_WEBSITE_CHANNEL is set on Render, leads our API
    creates reach Pipedrive with no Source channel, and so do the deals they
    are converted into. A deal that came through the website (origin API or
    Web Forms) with no channel is a Website deal, the same rule as enquiries."""

    def test_website_origin_without_a_channel_counts_as_website(self):
        assert derive_deal(deal(channel=None, origin="API"), [], ctx()).channel == "Website"
        assert derive_deal(deal(channel=None, origin="WebForms"), [], ctx()).channel == "Website"

    def test_a_set_channel_and_other_origins_are_left_alone(self):
        assert derive_deal(deal(channel=1136, origin="API"), [], ctx()).channel == "Existing Network"
        assert derive_deal(deal(channel=None, origin="ManuallyCreated"), [], ctx()).channel is None
        assert derive_deal(deal(channel=None, origin=None), [], ctx()).channel is None


class TestOtherCases:
    def test_other_pipelines_are_left_out(self):
        assert derive_deal(deal(pipeline_id=4, stage_id=23), [], ctx()) is None

    def test_deleted_deals_are_left_out_but_archived_stay(self):
        assert derive_deal(deal(is_deleted=True), [], ctx()) is None
        assert derive_deal(deal(is_archived=True), [], ctx()) is not None

    def test_unknown_channel_and_missing_fields_become_null(self):
        d = deal(channel=9999, channel_id=None, custom_fields={}, person_id=None)
        out = derive_deal(d, [], ctx())
        assert out.channel is None and out.source_label is None and out.campaign is None and out.person_id is None

    def test_empty_campaign_text_is_null(self):
        assert derive_deal(deal(custom_fields={UTM_CAMPAIGN: "  "}), [], ctx()).campaign is None

    def test_history_in_any_order_finds_the_first_move(self):
        d = deal(pipeline_id=2, stage_id=10)
        out = derive_deal(d, [move(1, 7, 10, LATER), move(1, 6, 7, T)], ctx())
        assert out.qualified_at == T

    def test_a_stage_the_mirror_does_not_know_falls_back_to_the_deal_pipeline(self):
        out = derive_deal(deal(stage_id=777), [], ctx())
        assert out.pipeline == "developer" and out.qualified_at == T

    def test_pipeline_ids_come_from_settings(self):
        s = settings(pipedrive_pipeline_audiences={"3": "landowner"}, pipedrive_developer_pipeline_id=99, pipedrive_landowner_pipeline_id=3, pipedrive_landowner_qualify_stage_id=13)
        out = derive_deal(deal(stage_id=14), [move(1, 13, 14, LATER)], ctx(settings=s))
        assert out.pipeline == "landowner" and out.qualified_at == LATER


def ectx(**over) -> EnquiryContext:
    # the team's own addresses come from the environment in real runs; set one here
    base = dict(settings=settings(enquiry_test_emails=["tester@example.org"]), channel_labels={1037: "Website", 1041: "Campaigns / Outreach", 1134: "Trade Show / Event", 1136: "Existing Network"},
                person_emails={501: ["j@example.com"], 502: ["clair@biofarm.co.uk"], 503: ["x@biofarm-test.dev"], 504: ["Tester@Example.org"]})
    base.update(over)
    return EnquiryContext(**base)


def cand(**over) -> Candidate:
    base = dict(kind="lead", id="L1", title="Website enquiry - Jo", created_at=T, origin="API", channel_id=None, person_id=501, archived=False,
                audience="other", utm_campaign=None, landing_page=None, website=None, converted=False, touch={})
    base.update(over)
    return Candidate(**base)


def website(**over) -> Lead:
    base = dict(id="w1", form="contact", name="J", email="j@example.com", fields=["developer"], page="https://www.biofarm.co.uk/bng-units?x=1",
                attribution={"utm_source": "google", "utm_medium": "cpc", "utm_campaign": "Spring Push"}, first_touch=None,
                spam_flagged=False, pipedrive_person_id=501, pipedrive_lead_id="L1", created_at=T)
    base.update(over)
    return Lead(**base)


class TestEnquiryRules:
    """The definition agreed on 8 Nov 2026, one rule per test."""

    def test_a_website_lead_is_an_enquiry_on_the_website_channel(self):
        out = derive(cand(), ectx())
        assert out.id == "L1" and out.kind == "lead" and out.channel == "Website" and out.form == "contact" and out.archived is False
        assert out.audience == "other" and out.source_label is None and out.landing_page is None and out.created_at == T

    def test_the_channel_the_team_set_wins_and_unknown_ids_are_none(self):
        assert derive(cand(channel_id=1041), ectx()).channel == "Campaigns / Outreach"
        assert derive(cand(origin="ManuallyCreated", channel_id=None), ectx()).channel is None
        assert derive(cand(origin="ManuallyCreated", channel_id=9999), ectx()).channel is None

    def test_fbi_contacts_count_as_trade_show_whatever_the_channel_says(self):
        assert derive(cand(title="Ben Swinley - FBI", origin="ManuallyCreated"), ectx()).channel == "Trade Show / Event"
        assert derive(cand(title="FBI: Lizzy Prosser", origin="WebForms", channel_id=1037), ectx()).channel == "Trade Show / Event"
        assert derive(cand(title="FBIS Ltd", origin="ManuallyCreated"), ectx()).channel is None  # whole word only

    def test_our_own_website_record_adds_form_audience_source_campaign_and_page(self):
        out = derive(cand(website=website()), ectx())
        assert out.form == "contact" and out.audience == "developer" and out.source_label == "google/cpc"
        assert out.campaign == "Spring Push" and out.landing_page == "/bng-units"

    def test_pipedrive_utm_fields_fill_in_when_there_is_no_website_record(self):
        out = derive(cand(utm_campaign=" AWD - TOF ", landing_page="https://www.biofarm.co.uk/landowners"), ectx())
        assert out.campaign == "AWD - TOF" and out.landing_page == "/landowners"

    def test_source_label_is_built_from_the_pipedrive_utm_source_medium_and_referrer_fields(self):
        assert derive(cand(touch={"utm_source": "bing", "utm_medium": "cpc"}), ectx()).source_label == "bing/cpc"
        assert derive(cand(touch={"referrer": "https://www.google.com/"}), ectx()).source_label == "google.com/referral"
        assert derive(cand(touch={"utm_source": None, "utm_medium": None, "referrer": None}), ectx()).source_label is None
        # our own website record is the fuller picture (first touch, click ids) and wins
        assert derive(cand(touch={"utm_source": "bing", "utm_medium": "cpc"}, website=website()), ectx()).source_label == "google/cpc"

    def test_form_is_read_from_the_title_of_website_records_only(self):
        assert derive(cand(title="CPD session request - Jo"), ectx()).form == "cpd"
        assert derive(cand(title="Fold enquiry - Jo"), ectx()).form == "fold"
        assert derive(cand(title="Landowner Web Enquiry Rob", origin="WebForms"), ectx()).form == "contact"
        assert derive(cand(title="Heath Farm", origin="ManuallyCreated", channel_id=1136), ectx()).form is None

    def test_imported_deals_are_not_enquiries(self):
        assert derive(cand(kind="deal", id="7", origin="Import", channel_id=1136), ectx()) == "imported"
        assert derive(cand(kind="deal", id="7", origin="ManuallyCreated", channel_id=1136), ectx()).kind == "deal"

    def test_test_titles_are_left_out_but_hampshire_is_not(self):
        assert derive(cand(title="Website enquiry - Final Test"), ectx()) == "test_title"
        assert derive(cand(title="John Doe lead (Test)", origin="ManuallyCreated"), ectx()) == "test_title"
        assert derive(cand(title="Test Valley LPA - BGS-040626001", origin="ManuallyCreated"), ectx()).id == "L1"
        assert derive(cand(title="Aster Communities Testway House", origin="ManuallyCreated"), ectx()).id == "L1"

    def test_test_campaigns_and_test_people_are_left_out(self):
        assert derive(cand(utm_campaign="go-live-check"), ectx()) == "test_campaign"
        assert derive(cand(website=website(attribution={"utm_campaign": "tracking-test"})), ectx()) == "test_campaign"
        assert derive(cand(person_id=503), ectx()) == "test_person"  # biofarm-test.dev
        assert derive(cand(person_id=504, title="Website enquiry - Godswill William"), ectx()) == "test_person"  # the address, any case
        assert derive(cand(person_id=504, title="Heath Farm", origin="ManuallyCreated", kind="deal", id="9"), ectx()) == "test_person"

    def test_staff_website_sign_ups_are_left_out_but_staff_deals_are_kept(self):
        assert derive(cand(person_id=502, title="Newsletter Sign Up Clair", origin="WebForms"), ectx()) == "staff"
        assert derive(cand(person_id=502, title="Website Enquiry Clair", origin="WebForms"), ectx()) == "staff"
        assert derive(cand(person_id=502, kind="deal", id="9", title="Sleight Farm", origin="ManuallyCreated", channel_id=1136), ectx()).kind == "deal"

    def test_newsletter_sign_ups_are_not_enquiries(self):
        assert derive(cand(title="Newsletter signup - Jo"), ectx()) == "newsletter"
        assert derive(cand(title="Newsletter Sign Up Jamie", origin="WebForms"), ectx()) == "newsletter"
        assert derive(cand(website=website(form="newsletter")), ectx()) == "newsletter"

    def test_archived_leads_are_kept_and_marked(self):
        out = derive(cand(archived=True, origin="ManuallyCreated", channel_id=1134), ectx())
        assert out.archived is True and out.channel == "Trade Show / Event"

    def test_a_deal_keeps_its_pipeline_audience(self):
        out = derive(cand(kind="deal", id="9", title="Sleight Farm", origin="ManuallyCreated", channel_id=1136, audience="landowner"), ectx())
        assert out.audience == "landowner" and out.form is None and out.kind == "deal"


def mlead(id, **over) -> MirrorLead:
    base = dict(id=id, title="Website enquiry - Jo", origin="API", channel=None, person_id=501, is_archived=False, is_deleted=False, add_time=T, update_time=T,
                custom_fields={}, raw={}, fetched_at=T)
    base.update(over)
    return MirrorLead(**base)


class TestCandidates:
    """Leads and deals become one list; a converted lead is counted once, at the lead's date."""

    def test_a_converted_lead_still_in_the_mirror_is_the_enquiry_not_the_deal(self):
        lead = mlead("L1", channel=1134, add_time=T - 48 * H)
        converted = deal(id=9, source_lead_id="L1", add_time=T, channel=1136)
        out = candidates_from([lead], [(converted, "developer")], {})
        assert [(c.kind, c.id, c.created_at, c.channel_id, c.audience) for c in out] == [("lead", "L1", T - 48 * H, 1134, "developer")]

    def test_a_converted_lead_pipedrive_has_deleted_is_counted_as_the_deal_marked_converted(self):
        out = candidates_from([], [(deal(id=9, source_lead_id="gone"), "developer"), (deal(id=10), "developer")], {})
        assert [(c.kind, c.id, c.created_at, c.converted) for c in out] == [("deal", "9", T, True), ("deal", "10", T, False)]

    def test_converted_marks_the_wire_record_so_the_dashboard_does_not_treat_it_as_sales_created(self):
        out = derive(cand(kind="deal", id="9", title="Sleight Farm", origin="ManuallyCreated", channel_id=1136, converted=True), ectx())
        assert out.kind == "deal" and out.converted is True
        assert derive(cand(), ectx()).converted is False

    def test_deleted_leads_are_skipped_and_website_records_are_matched_by_lead_id_or_origin(self):
        d = deal(id=9, origin="API", origin_id="w2")
        leads = [mlead("L1"), mlead("L2", is_deleted=True)]
        records = {"L1": website(id="w1"), "w2": website(id="w2", pipedrive_lead_id=None)}
        out = candidates_from(leads, [(d, "developer")], records)
        assert [(c.kind, c.id, c.website.id if c.website else None) for c in out] == [("lead", "L1", "w1"), ("deal", "9", "w2")]

    def test_deal_custom_fields_feed_campaign_and_page(self):
        d = deal(id=9, custom_fields={UTM_CAMPAIGN: "spring-push", "f4ca": "https://www.biofarm.co.uk/x"})
        out = candidates_from([], [(d, "developer")], {}, utm_campaign_code=UTM_CAMPAIGN, landing_page_code="f4ca")
        assert out[0].utm_campaign == "spring-push" and out[0].landing_page == "https://www.biofarm.co.uk/x"

    def test_touch_fields_are_read_by_field_code_from_the_lead_then_the_converted_deal(self):
        codes = {"utm_source": "s1", "utm_medium": "m1", "referrer": "r1"}
        lead = mlead("L1", custom_fields={"s1": "bing", "m1": "cpc"})
        plain = candidates_from([lead], [], {}, touch_codes=codes)
        assert plain[0].touch == {"utm_source": "bing", "utm_medium": "cpc", "referrer": None}
        converted = deal(id=9, source_lead_id="L1", custom_fields={"r1": "https://www.google.com/"})
        out = candidates_from([mlead("L1")], [(converted, "developer")], {}, touch_codes=codes)
        assert out[0].touch == {"utm_source": None, "utm_medium": None, "referrer": "https://www.google.com/"}
        assert candidates_from([], [(converted, "developer")], {}, touch_codes=codes)[0].touch["referrer"] == "https://www.google.com/"


def act(id, **over) -> Activity:
    base = dict(id=id, type="call", done=True, person_id=501, add_time=T + H, update_time=T + H, marked_as_done_time=T + 2 * H, is_deleted=False, raw={}, fetched_at=T)
    base.update(over)
    return Activity(**base)


class TestFirstContact:
    def test_first_contact_is_the_earliest_touch_after_the_enquiry(self):
        assert first_contact(T, [T + 26 * H, T - 5 * H, T + 2 * H]) == T + 2 * H

    def test_none_when_nothing_was_logged_after_the_enquiry(self):
        assert first_contact(T, [T - H]) is None
        assert first_contact(T, []) is None

    def test_touches_are_done_calls_emails_and_meetings_against_the_person(self):
        acts = [
            act(1),  # a done call: marked_as_done_time
            act(2, type="meeting", marked_as_done_time=None, add_time=T + 5 * H),  # done but never "marked": when it was logged
            act(3, type="task"),  # a task is work, not contact
            act(4, done=False, marked_as_done_time=None),  # a planned call has not happened
            act(5, is_deleted=True),
            act(6, type="email", person_id=502, marked_as_done_time=T + 3 * H),
            act(7, person_id=None),
        ]
        assert contact_times(acts) == {501: [T + 2 * H, T + 5 * H], 502: [T + 3 * H]}


def stat(campaign_id, person_id, *, name="Newsletter - October 2026", sent=LATER, opens=0, clicks=0) -> CampaignStat:
    return CampaignStat(campaign_id=campaign_id, person_id=person_id, campaign_name=name, campaign_type="regular", sent_at=sent, opens=opens, clicks=clicks, clicked_links=[], raw={}, fetched_at=T)


def status(id, person_id, value, at, *, reason="user", campaign_id=None) -> MarketingStatusChange:
    return MarketingStatusChange(id=id, person_id=person_id, status=value, changed_at=at, reason=reason, campaign_id=campaign_id, user_id=None if campaign_id else 11, raw={})


def subscriber(id, marketing_status, add_time) -> MirrorPerson:
    return MirrorPerson(id=id, name=f"P{id}", marketing_status=marketing_status, add_time=add_time, raw={}, fetched_at=T)


def month(y, m, d=1, h=9):
    return datetime(y, m, d, h, 0, tzinfo=UTC)


class TestNewsletter:
    def test_issues_aggregate_one_row_per_campaign(self):
        stats = [
            stat(33, 1, opens=2, clicks=1), stat(33, 2), stat(33, 3, opens=1, sent=LATER - H),
            stat(32, 1, name="Newsletter -September 2026", sent=T),
        ]
        changes = [
            status(1, 2, "unsubscribed", LATER + H, reason="campaign", campaign_id=33),
            status(2, 3, "bounced", LATER + H, reason="campaign", campaign_id=33),
            status(3, 4, "unsubscribed", LATER + H),  # removed by a colleague, not by this issue
        ]
        issues = issues_from(stats, changes)
        assert [(i.id, i.subject, i.sent_at, i.recipients, i.opens, i.clicks, i.unsubscribes) for i in issues] == [
            ("32", "Newsletter -September 2026", T, 1, 0, 0, 0),
            ("33", "Newsletter - October 2026", LATER - H, 3, 2, 1, 1),
        ]

    def test_issues_count_people_not_repeat_opens(self):
        issues = issues_from([stat(33, 1, opens=19, clicks=3)], [])
        assert issues[0].opens == 1 and issues[0].clicks == 1

    def test_subscribers_at_each_month_end_with_joins_and_leaves(self):
        persons = [
            subscriber(1, "subscribed", month(2025, 9)),
            subscriber(2, "unsubscribed", month(2025, 9)),
            subscriber(3, "subscribed", month(2026, 7, 3)),  # no history read yet: counted from when the person was added
            subscriber(4, "no_consent", month(2025, 9)),
            subscriber(5, "bounced", month(2025, 9)),
        ]
        changes = [
            status(1, 1, "subscribed", month(2025, 10, 9)),
            status(2, 2, "subscribed", month(2026, 5, 11)), status(3, 2, "unsubscribed", month(2026, 5, 18)),
            status(4, 5, "subscribed", month(2025, 10, 31)), status(5, 5, "bounced", month(2026, 3, 18), reason="campaign", campaign_id=20),
        ]
        rows = subscriber_months(persons, changes, up_to="2026-08")
        assert [(r.month, r.subscribers, r.added, r.removed) for r in rows] == [
            ("2025-10", 2, 2, 0), ("2025-11", 2, 0, 0), ("2025-12", 2, 0, 0), ("2026-01", 2, 0, 0), ("2026-02", 2, 0, 0),
            ("2026-03", 1, 0, 1), ("2026-04", 1, 0, 0), ("2026-05", 1, 1, 1), ("2026-06", 1, 0, 0), ("2026-07", 2, 1, 0), ("2026-08", 2, 0, 0),
        ]

    def test_a_person_whose_history_was_read_is_not_double_counted_from_add_time(self):
        rows = subscriber_months([subscriber(1, "subscribed", month(2025, 9))], [status(1, 1, "subscribed", month(2025, 10, 9))], up_to="2025-10")
        assert [(r.month, r.subscribers, r.added) for r in rows] == [("2025-10", 1, 1)]

    def test_current_status_wins_when_the_history_does_not_reach_it(self):
        """Pipedrive's flow misses some re-subscriptions: a person marked subscribed
        today whose history ends at an unsubscribe counts from the first campaign
        they received after that, which proves they were back on the list."""
        persons = [subscriber(1, "subscribed", month(2025, 9)), subscriber(2, "subscribed", month(2025, 9)), subscriber(3, "unsubscribed", month(2025, 9))]
        changes = [
            status(1, 1, "subscribed", month(2025, 10, 9)), status(2, 1, "unsubscribed", month(2025, 10, 9, 10)),
            status(3, 2, "subscribed", month(2025, 10, 9)), status(4, 2, "unsubscribed", month(2025, 10, 9, 10)),
            status(5, 3, "subscribed", month(2025, 10, 9)),
        ]
        sends = {1: [month(2025, 10, 1), month(2025, 11, 24), month(2026, 1, 14)]}  # person 2 received nothing we know of
        rows = subscriber_months(persons, changes, up_to="2026-01", sends=sends, now=month(2026, 1, 20))
        assert [(r.month, r.subscribers, r.added, r.removed) for r in rows] == [
            ("2025-10", 1, 3, 2),  # person 3 is still "subscribed" by history alone
            ("2025-11", 2, 1, 0),  # person 1 back from the November send
            ("2025-12", 2, 0, 0),
            ("2026-01", 2, 1, 1),  # person 2 counted from now; person 3 leaves now, since Pipedrive says unsubscribed
        ]

    def test_nothing_to_count_gives_no_months(self):
        assert subscriber_months([subscriber(4, "no_consent", month(2025, 9))], [], up_to="2026-08") == []


@pytest.fixture
async def sessions(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/r.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def seed(sessions, *, with_run=True):
    async with sessions() as s:
        s.add_all([
            Pipeline(id=3, name="Developer Pipeline", raw={}, fetched_at=T), Pipeline(id=2, name="Landowner Pipeline", raw={}, fetched_at=T), Pipeline(id=7, name="DORMANT Developers", raw={}, fetched_at=T),
            Stage(id=13, pipeline_id=3, name="OPPORTUNITY (Qualified)", raw={}, fetched_at=T), Stage(id=14, pipeline_id=3, name="QUOTED", raw={}, fetched_at=T),
            Stage(id=61, pipeline_id=7, name="With Broker Not Dead", raw={}, fetched_at=T),
            Stage(id=6, pipeline_id=2, name="CALL / QUALIFY", raw={}, fetched_at=T), Stage(id=7, pipeline_id=2, name="PROPOSAL", raw={}, fetched_at=T),
            DealField(field_code="channel", name="Source channel", field_type="enum", options=[{"id": 1037, "label": "Website"}, {"id": 1134, "label": "Trade Show / Event"}, {"id": 1136, "label": "Existing Network"}], raw={}, fetched_at=T),
            DealField(field_code=UTM_CAMPAIGN, name="UTM Campaign", field_type="varchar", is_custom=True, raw={}, fetched_at=T),
            DealField(field_code="5828a8ac0a61e006e3e57afe22aabf696c7d483b", name="UTM Source", field_type="varchar", is_custom=True, raw={}, fetched_at=T),
            DealField(field_code="afddc536adc0ae2be8eb856c5d8836aa509b6d37", name="UTM Medium", field_type="varchar", is_custom=True, raw={}, fetched_at=T),
            DealField(field_code="2c617b2d3ac3a6b302efcedce8c70a50b0bf61d4", name="Referrer", field_type="varchar", is_custom=True, raw={}, fetched_at=T),
            deal(id=1), deal(id=2, pipeline_id=7, stage_id=61, channel=1136, custom_fields={}),
            deal(id=3, pipeline_id=2, stage_id=7, channel=None, custom_fields={}), deal(id=4, is_deleted=True),
            deal(id=5, origin="Import", channel=1136, custom_fields={}, add_time=T - 24 * H),
            move(2, 13, 14, T), move(2, 14, 61, LATER), move(3, 6, 7, LATER),
            Lead(id="l1", form="contact", name="J", email="j@example.com", fields=["developer"], attribution={"utm_source": "google", "utm_medium": "cpc"}, pipedrive_person_id=501, pipedrive_lead_id="L1", created_at=T),
            Lead(id="l2", form="newsletter", name="S", email="s@example.com", fields=[], spam_flagged=True, created_at=T),
            mlead("L1"), mlead("L2", title="RSK Biocensus", origin="ManuallyCreated", channel=1136, person_id=None, is_archived=True, add_time=T + H),
            mlead("L3", title="Website enquiry - Final Test", add_time=T + 2 * H), mlead("L4", title="Newsletter signup - S", person_id=None, add_time=T + 3 * H),
            mlead("L5", title="Ben Swinley - FBI", origin="ManuallyCreated", person_id=None, add_time=T + 4 * H), mlead("L6", is_deleted=True, add_time=T + 5 * H),
            mlead("L7", title="Website enquiry - Pat", person_id=None, add_time=T + 6 * H,
                  custom_fields={"5828a8ac0a61e006e3e57afe22aabf696c7d483b": "bing", "afddc536adc0ae2be8eb856c5d8836aa509b6d37": "cpc", "2c617b2d3ac3a6b302efcedce8c70a50b0bf61d4": "https://www.bing.com/"}),
            mlead("L8", title="Website enquiry - Sam", person_id=None, add_time=T + 7 * H, custom_fields={"2c617b2d3ac3a6b302efcedce8c70a50b0bf61d4": "https://www.google.com/"}),
            subscriber(501, "subscribed", T), status(1, 501, "subscribed", T + H), stat(33, 501, opens=1),
            act(1, marked_as_done_time=LATER), act(2, type="task"),
        ])
        if with_run:
            s.add(ImportRun(started_at=T, finished_at=LATER, mode="full", status="ok"))
        await s.commit()


async def test_load_deals_reads_the_mirror(sessions):
    await seed(sessions)
    async with sessions() as s:
        deals = await load_deals(s, settings())
    by_id = {d.id: d for d in deals}
    assert set(by_id) == {"1", "2", "3", "5"}  # an imported deal is still a deal; it is only not an enquiry
    assert by_id["1"].qualified_at == T and by_id["1"].campaign == "spring-push"
    assert by_id["2"].qualified_at == T and by_id["2"].channel == "Existing Network" and by_id["2"].pipeline == "developer"
    assert by_id["3"].qualified_at == LATER and by_id["3"].pipeline == "landowner" and by_id["3"].channel is None


async def test_build_dashboard_data_has_the_dashboard_shape(sessions):
    await seed(sessions)
    async with sessions() as s:
        data = await build_dashboard_data(s, settings())
    payload = data.model_dump(by_alias=True, mode="json")
    assert payload["source"] == "pipedrive" and payload["syncedAt"] == "2026-10-07T13:47:29Z"
    assert {d["id"] for d in payload["deals"]} == {"1", "2", "3", "5"}
    deal_one = next(d for d in payload["deals"] if d["id"] == "1")
    assert deal_one["qualifiedAt"] == "2026-09-29T10:31:28Z" and "qualified_at" not in deal_one
    enquiries = {e["id"]: e for e in payload["enquiries"]}
    assert [e["id"] for e in payload["enquiries"]] == ["1", "2", "3", "L1", "L2", "L5", "L7", "L8"]  # by date, deals before leads on a tie; 5 imported, L3 test, L4 newsletter, L6 deleted
    assert enquiries["L7"]["sourceLabel"] == "bing/cpc" and enquiries["L8"]["sourceLabel"] == "google.com/referral"  # from the Pipedrive UTM and Referrer fields
    assert enquiries["L5"]["sourceLabel"] is None
    assert enquiries["L1"] == {"id": "L1", "createdAt": "2026-09-29T10:31:28Z", "kind": "lead", "form": "contact", "audience": "developer", "channel": "Website",
                               "sourceLabel": "google/cpc", "campaign": None, "landingPage": "/", "firstContactAt": "2026-10-07T13:47:29Z", "personId": 501, "archived": False, "converted": False}
    assert enquiries["L2"]["channel"] == "Existing Network" and enquiries["L2"]["archived"] is True and enquiries["L2"]["form"] is None and enquiries["L2"]["audience"] == "other"
    assert enquiries["L5"]["channel"] == "Trade Show / Event"
    assert enquiries["1"]["kind"] == "deal" and enquiries["1"]["audience"] == "developer" and enquiries["1"]["campaign"] == "spring-push" and enquiries["1"]["channel"] == "Website"
    assert enquiries["3"]["audience"] == "landowner" and enquiries["3"]["channel"] is None
    assert payload["newsletter"]["signups"] == [{"month": "2026-09", "count": 1}]
    for key in ("spend", "traffic", "events", "annotations"):
        assert payload[key] == []
    assert payload["newsletter"]["issues"] == [{"id": "33", "sentAt": "2026-10-07T13:47:29Z", "subject": "Newsletter - October 2026", "recipients": 1, "opens": 1, "clicks": 0, "unsubscribes": 0}]
    assert payload["newsletter"]["subscribers"] == [{"month": "2026-09", "subscribers": 1, "added": 1, "removed": 0}, {"month": "2026-10", "subscribers": 1, "added": 0, "removed": 0}]
    assert payload["search"] == {"months": [], "aiReferrals": []}


async def test_load_enquiries_reports_what_each_rule_removed(sessions):
    await seed(sessions)
    async with sessions() as s:
        report = await load_enquiries(s, settings())
    assert [e.id for e in report.enquiries] == ["1", "2", "3", "L1", "L2", "L5", "L7", "L8"]
    assert report.excluded == {"imported": 1, "test_title": 1, "newsletter": 1}
    assert report.newsletter_signups == [T + 3 * H]


async def test_build_dashboard_data_reads_each_table_once_and_leaves_the_raw_json_behind(sessions):
    """The feed is rebuilt from the whole mirror; it must not load every table
    twice, nor the raw API JSON kept on each row (tens of megabytes on the real
    account) that no figure needs."""
    from sqlalchemy import event

    await seed(sessions)
    statements: list[str] = []
    engine = sessions.kw["bind"]

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(" ".join(statement.split()))

    event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        async with sessions() as s:
            await build_dashboard_data(s, settings())
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record)
    selects = [st for st in statements if st.upper().startswith("SELECT")]
    reads = lambda table: [st for st in selects if f"FROM {table}" in st]
    assert len(reads("pd_deals")) == 1 and len(reads("pd_deal_stage_history")) == 1
    for table in ("pd_deals", "pd_leads", "pd_activities", "pd_campaign_stats", "pd_marketing_status_changes", "pd_persons"):
        assert all(".raw" not in st for st in reads(table)), table
    activity_reads = reads("pd_activities")
    assert activity_reads and "WHERE" in activity_reads[0]  # done calls/emails/meetings with a person, filtered in SQL


async def test_the_raw_json_left_in_the_database_cannot_be_lazy_loaded_by_accident(sessions):
    """Deferred columns would otherwise try a lazy load on access, which asyncio
    does not allow; raiseload makes the mistake a clear error instead."""
    from sqlalchemy.exc import InvalidRequestError

    from app.reporting.deals import load_marketing_deals

    await seed(sessions)
    async with sessions() as s:
        _, kept = await load_marketing_deals(s, settings())
        with pytest.raises(InvalidRequestError, match="raiseload"):
            _ = kept[0][0].raw


async def test_build_dashboard_data_refuses_before_the_first_import(sessions):
    await seed(sessions, with_run=False)
    async with sessions() as s:
        with pytest.raises(NoImportYet):
            await build_dashboard_data(s, settings())
