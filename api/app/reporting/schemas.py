"""The JSON the dashboard reads: the same shape as its `DashboardData` type,
camelCase on the wire. Sections without a feed yet are empty lists."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    model_validator,
)
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
EnquiryForm = Literal["contact", "newsletter", "cpd", "fold", "landowner"]
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
    # The "Qualified Lead?" option as Sales set it (YES / NO), None when unset
    # or before the field existed. A lead ticked YES before conversion is a
    # record here too, under its lead id (see app/reporting/deals.py).
    qualification_status: str | None = None
    # Who and where, for the qualified-opportunities list: the deal's title, the
    # person and their organisation as Pipedrive names them, the stage the deal
    # sits in (None for a lead not yet converted), how the record came in
    # (website = a form or our API, team = created by hand, import = bulk) and
    # which team member created and owns it. Empty when the mirror cannot say.
    title: str | None = None
    person_name: str | None = None
    organisation: str | None = None
    stage: str | None = None
    origin: Literal["website", "team", "import"] | None = None
    created_by: str | None = None
    owner: str | None = None
    # The lead this deal was converted from, so the enquiry it came in as can be found.
    source_lead_id: str | None = None
    # Why it counts, in words, from the rule that applied (None while unqualified).
    qualified_by: str | None = None


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


class CpdMonthOut(Wire):
    """CPD session requests through the website in one calendar month (not enquiries)."""

    month: str
    bookings: int


class NewsletterOut(Wire):
    issues: list[NewsletterIssueOut] = []
    subscribers: list[SubscriberMonthOut] = []
    # Newsletter sign-ups through the website, by month (not enquiries).
    signups: list[SignupMonthOut] = []


SpendPlatform = Literal["google_ads", "microsoft_ads", "linkedin_ads", "other"]
# The dashboard's TrafficChannel: GA4's default channel groups mapped in app/reporting/google.py.
TrafficChannel = Literal["Organic search", "Paid search", "Direct", "Referral", "Organic social", "Paid social", "Email", "AI assistant", "Display", "Paid other", "Other"]
AiAssistant = Literal["ChatGPT", "Perplexity", "Claude", "Gemini", "Copilot"]
ConversionKind = Literal["enquiry", "newsletter_signup", "email_click"]


class SpendEntryOut(Wire):
    """Media spend for one campaign in one month. Feed rows carry a stable id
    ("gads-<campaign id>-<month>") so the dashboard can tell them from entries typed in by hand."""

    id: str
    month: str
    platform: SpendPlatform
    campaign: str
    amount_gbp: float


class TrafficMonthOut(Wire):
    month: str
    channel: TrafficChannel
    sessions: int


class SearchMonthOut(Wire):
    month: str
    # Search Console: queries matching the brand pattern
    brand_impressions: int
    brand_clicks: int
    # GA4 sessions in the "AI Assistant" channel group
    ai_sessions: int
    # Share of sampled prompts naming Biofarm: not measured yet
    ai_mention_share: float | None = None
    # Unfiltered Search Console totals and the non-brand remainder. Brand plus
    # non-brand falls short of the total: filtered queries leave out the long tail.
    total_clicks: int = 0
    total_impressions: int = 0
    non_brand_clicks: int = 0
    non_brand_impressions: int = 0


class AiReferralOut(Wire):
    month: str
    assistant: AiAssistant
    sessions: int


class SearchOut(Wire):
    months: list[SearchMonthOut] = []
    ai_referrals: list[AiReferralOut] = []


class ConversionMonthOut(Wire):
    """GA4 key events by month: the website's own count of enquiries (the
    "Contact Form" tag), newsletter sign-ups and email clicks."""

    month: str
    event: ConversionKind
    count: int


EventType = Literal["trade_show", "cpd", "webinar", "open_day"]
MatchTerm = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class EventMatchIn(Wire):
    """How an event's records are found in Pipedrive: any one signal, inside
    the window. No signal at all is allowed: an event with no Pipedrive trail
    (a CPD session, say) simply counts no enquiries."""

    labels: list[MatchTerm] = Field(default_factory=list, max_length=50)
    deal_sources: list[MatchTerm] = Field(default_factory=list, max_length=50)
    title_words: list[MatchTerm] = Field(default_factory=list, max_length=50)
    channel: bool = False
    window_from: date
    window_to: date

    @model_validator(mode="after")
    def _window_in_order_and_something_to_match(self):
        if self.window_to < self.window_from:
            raise ValueError("window_to must not be before window_from")
        return self


class EventIn(Wire):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    date: date
    type: EventType
    attendees: Annotated[int, Field(ge=0)] | None = None
    # Above zero or absent, as the dialog enforces: a stored 0 would read as "£0 per qualified" on the Events page.
    cost_gbp: Annotated[float, Field(gt=0)] | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    match: EventMatchIn


class EventStoredOut(EventIn):
    """An event as stored: what a write returns."""

    id: str
    updated_at: datetime


class EventOut(Wire):
    """An event as the dashboard shows it: the stored fields plus what the
    mirror counts for it. `leads` is the dashboard's word for enquiries
    matched to the event; `matched_by` says which signal found each."""

    id: str
    name: str
    date: datetime
    type: EventType
    attendees: int | None
    cost_gbp: float | None
    notes: str | None
    match: EventMatchIn
    leads: int
    qualified: int
    matched_by: dict[str, int]
    updated_at: datetime


class DashboardDataOut(Wire):
    deals: list[DealOut]
    enquiries: list[EnquiryOut]
    # CPD session bookings by month, July 2026 to the month of the last import,
    # every month present (zero when none). Read from Pipedrive leads only.
    cpd_bookings: list[CpdMonthOut] = []
    spend: list[SpendEntryOut] = []
    newsletter: NewsletterOut = NewsletterOut()
    search: SearchOut = SearchOut()
    traffic: list[TrafficMonthOut] = []
    conversions: list[ConversionMonthOut] = []
    events: list[EventOut] = []
    annotations: list = []
    synced_at: datetime
    # When the Google pull (Ads, GA4, Search Console) last completed with every
    # source landing; null until it has. A run where one source failed does not
    # move it, so the dashboard's staleness alert fires after two such days.
    google_synced_at: datetime | None = None
    source: Literal["demo", "pipedrive"] = "pipedrive"
