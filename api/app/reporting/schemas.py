"""The JSON the dashboard reads: the same shape as its `DashboardData` type,
camelCase on the wire. Sections without a feed yet are empty lists."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_serializer
from pydantic.alias_generators import to_camel


class Wire(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, serialize_by_alias=True)

    @field_serializer("*", when_used="json")
    def _utc_z(self, value):
        # "2026-10-07T13:47:29Z", the form the dashboard's demo data uses
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%dT%H:%M:%SZ")
        return value


Pipeline = Literal["developer", "landowner"]
Channel = Literal["Website", "Info email inbox", "Campaigns / Outreach", "Linkedin", "Trade Show / Event", "Introducer", "Existing Network", "Marketplace"]
DealStatus = Literal["open", "won", "lost"]
EnquiryForm = Literal["contact", "newsletter", "cpd", "fold"]
Audience = Literal["developer", "landowner", "other"]


class DealOut(Wire):
    id: str
    pipeline: Pipeline
    channel: Channel | None
    created_at: datetime
    qualified_at: datetime | None
    status: DealStatus
    source_label: str | None
    campaign: str | None
    person_id: int | None


class EnquiryOut(Wire):
    """A Pipedrive lead or a deal created directly (see app/reporting/enquiries.py)."""

    id: str
    created_at: datetime
    kind: Literal["lead", "deal"]
    # The website form, when the record came through the site; None for the team's own records.
    form: EnquiryForm | None
    audience: Audience
    # Pipedrive's Source channel; the dashboard splits inbound from outbound on it.
    channel: Channel | None
    # "source/medium" from our own website record, when one matched.
    source_label: str | None
    campaign: str | None
    landing_page: str | None
    first_contact_at: datetime | None
    person_id: int | None
    # A lead the team closed without converting; still an enquiry, filterable.
    archived: bool = False
    # A deal converted from a lead Pipedrive has since deleted: it came in as a
    # lead, so it is not one the team created directly (it only carries the
    # conversion date). Always False for kind "lead".
    converted: bool = False


class NewsletterIssueOut(Wire):
    id: str
    sent_at: datetime
    subject: str
    recipients: int
    opens: int
    clicks: int
    unsubscribes: int


class SubscriberMonthOut(Wire):
    month: str
    subscribers: int
    added: int
    removed: int


class SignupMonthOut(Wire):
    month: str
    count: int


class NewsletterOut(Wire):
    issues: list[NewsletterIssueOut] = []
    subscribers: list[SubscriberMonthOut] = []
    # Newsletter sign-ups through the website, by month (not enquiries).
    signups: list[SignupMonthOut] = []


class SearchOut(Wire):
    months: list = []
    ai_referrals: list = []


class DashboardDataOut(Wire):
    deals: list[DealOut]
    enquiries: list[EnquiryOut]
    spend: list = []
    newsletter: NewsletterOut = NewsletterOut()
    search: SearchOut = SearchOut()
    traffic: list = []
    events: list = []
    annotations: list = []
    synced_at: datetime
    source: Literal["demo", "pipedrive"] = "pipedrive"
