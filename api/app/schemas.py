from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

FieldChoice = Literal["developer", "landowner", "other"]


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


class ContactSubmission(LeadSubmissionBase):
    phone: str | None = Field(default=None, max_length=50)
    fields: list[FieldChoice] = Field(default_factory=list, max_length=10)
    message: str | None = Field(default=None, max_length=5000)
    newsletter_opt_in: bool = False


class NewsletterSubmission(LeadSubmissionBase):
    field: FieldChoice | None = None
