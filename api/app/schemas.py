from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

# "What field are you in?" / "I am a...": the stored keys. The dashboard's audience split
# reads developer and landowner; the other roles count as "other" until the team says otherwise.
FieldChoice = Literal["developer", "planning_consultant", "ecologist", "landowner", "other"]
FIELD_LABELS: dict[str, str] = {
    "developer": "Developer",
    "planning_consultant": "Planning consultant",
    "ecologist": "Ecologist",
    "landowner": "Landowner",
    "other": "Other",
}
# Forms the API accepts; each route stores one of these in Lead.form and the
# owner map (config) only accepts keys built from them.
LEAD_FORMS = ("contact", "newsletter", "cpd", "fold", "landowner")


class Attribution(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    utm_source: str | None = Field(default=None, max_length=255)
    utm_medium: str | None = Field(default=None, max_length=255)
    utm_campaign: str | None = Field(default=None, max_length=255)
    utm_term: str | None = Field(default=None, max_length=255)
    utm_content: str | None = Field(default=None, max_length=255)
    gclid: str | None = Field(default=None, max_length=255)
    fbclid: str | None = Field(default=None, max_length=255)
    msclkid: str | None = Field(default=None, max_length=255)
    referrer: str | None = Field(default=None, max_length=2048)
    landing_page: str | None = Field(default=None, max_length=2048)


class LeadSubmissionBase(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    email: EmailStr = Field(max_length=320)
    # Honeypot: hidden in the form, humans leave it empty. Kept unstripped so a
    # bot filling it with whitespace still trips the check.
    website: Annotated[
        str, StringConstraints(strip_whitespace=False, max_length=2048)
    ] = ""
    # Milliseconds between first focus and submit, computed client-side -
    # elapsed time is immune to client/server clock skew.
    fill_ms: float | None = Field(default=None, ge=0)
    page: str | None = Field(default=None, max_length=512)
    ga_client_id: str | None = Field(default=None, max_length=64)
    ga_session_id: str | None = Field(default=None, max_length=64)
    attribution: Attribution | None = None
    first_touch: Attribution | None = None


# "Where did you hear about us?" on the contact form: the stored value -> the
# label the form shows and the Pipedrive note repeats. Keys are what the form
# submits; change a label freely, add a key here and in the form together.
HeardAbout = Literal["search", "linkedin", "referral", "event", "newsletter", "press", "marketplace", "ai", "other"]
HEARD_ABOUT_LABELS: dict[str, str] = {
    "search": "Search engine",
    "linkedin": "LinkedIn",
    "referral": "Recommended by someone",
    "event": "Event or trade show",
    "newsletter": "Biofarm newsletter",
    "press": "Press or article",
    "marketplace": "BNG marketplace or listing site",
    "ai": "AI assistant (like ChatGPT)",
    "other": "Other",
}


class ContactSubmission(LeadSubmissionBase):
    phone: str | None = Field(default=None, max_length=50)
    fields: list[FieldChoice] = Field(default_factory=list, max_length=10)
    message: str | None = Field(default=None, max_length=5000)
    newsletter_opt_in: bool = False
    heard_about: HeardAbout | None = None
    # Their own words when heard_about is "other" (the form shows a text box then).
    heard_about_other: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None

    @field_validator("heard_about_other", mode="after")
    @classmethod
    def _empty_words_are_none(cls, value: str | None) -> str | None:
        return value or None

    @model_validator(mode="after")
    def _other_words_only_with_other(self):
        if self.heard_about_other is not None and self.heard_about != "other":
            raise ValueError('heard_about_other is only accepted when heard_about is "other"')
        return self


class NewsletterSubmission(LeadSubmissionBase):
    field: FieldChoice | None = None


TeamSize = Literal["1-5", "6-15", "16-40", "40+"]


class CpdSubmission(LeadSubmissionBase):
    """'Arrange a session' form on the BNG CPD landing page."""

    company: str = Field(min_length=1, max_length=200)
    role: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=50)
    # Field chips removed 8 Oct (Vix: a landowner wouldn't book a CPD session);
    # still accepted if sent, so an old cached form can't 422.
    fields: list[FieldChoice] = Field(default_factory=list, max_length=10)
    team_size: TeamSize | None = None
    message: str | None = Field(default=None, max_length=5000)


class LandownerSubmission(LeadSubmissionBase):
    """The landowner page's form: the old Pipedrive embed's questions (name,
    email, phone, message, newsletter) with no field chips - the page itself
    says landowner, so the route fixes fields=["landowner"]."""

    phone: str | None = Field(default=None, max_length=50)
    message: str | None = Field(default=None, max_length=5000)
    newsletter_opt_in: bool = False


class FoldSubmission(LeadSubmissionBase):
    """'Join the Fold' form on the landowner Fold landing page."""

    phone: str | None = Field(default=None, max_length=50)
    habitat_bank: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=200)
    units: str | None = Field(default=None, max_length=50)
    message: str | None = Field(default=None, max_length=5000)
