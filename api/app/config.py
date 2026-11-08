import json
import logging
import re
from typing import Annotated, Any, get_args

from pydantic import AliasChoices, Field, SecretStr, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.schemas import LEAD_FORMS, FieldChoice

logger = logging.getLogger(__name__)

# Owner-map keys are checked against the known forms and fields. A bad entry
# is logged and dropped rather than failing the boot: a typo in an optional
# routing setting must never take every form on the site offline.
_OWNER_KEY = re.compile(
    rf"^({'|'.join(LEAD_FORMS)})(:({'|'.join(get_args(FieldChoice))}))?$"
)
_OWNER_KEY_HELP = (
    f"keys are '<form>' or '<form>:<field>' (forms: {', '.join(LEAD_FORMS)}; "
    f"fields: {', '.join(get_args(FieldChoice))}; lower-case)"
)


def _as_positive_int(value: Any) -> int | None:
    """A positive integer id (Pipedrive user, channel option), or None. Accepts an int or a
    digit string; rejects bools (JSON true is not user 1), floats and
    anything else."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.strip().isdecimal():
        # isdecimal(), not isdigit(): superscripts and the like pass isdigit()
        # but int() refuses them, and an exception here would fail the boot.
        try:
            return int(value) or None
        except ValueError:
            return None
    return None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BIOFARM_",
        # A variable saved with an empty value in the Render dashboard must
        # mean "unset", not "parse '' as JSON/int" (which would fail the boot).
        env_ignore_empty=True,
        populate_by_name=True,
        extra="ignore",
    )

    environment: str = "dev"

    # Render injects DATABASE_URL without our prefix; accept both spellings.
    database_url: str = Field(
        default="sqlite+aiosqlite:///./dev.db",
        validation_alias=AliasChoices("DATABASE_URL", "BIOFARM_DATABASE_URL"),
    )
    # Alembic owns the schema in production; create_all is for dev/tests only.
    auto_create_tables: bool = True

    cors_origins: list[str] = [
        "https://www.biofarm.co.uk",
        "https://biofarm.co.uk",
    ]

    pipedrive_company_domain: str = ""
    pipedrive_api_token: SecretStr = SecretStr("")
    # Fallback owner for any lead the owner map doesn't cover. Unset = the
    # API token's user (Pipedrive's default), which is wrong operationally.
    # Anything that is not a positive integer is logged and ignored.
    pipedrive_owner_id: int | None = None
    # Route ownership by enquiry type: key is "<form>" or "<form>:<field>",
    # value a Pipedrive user id. Most specific key wins, e.g.
    #   {"contact:developer": 23328240, "contact:landowner": 27433044, "cpd": 123}
    # A contact lead with fields ["developer"] resolves "contact:developer",
    # then "contact", then pipedrive_owner_id. If Pipedrive rejects the owner
    # (deactivated user, wrong id) the record is created without one.
    # NoDecode: the raw env string is parsed here, so malformed JSON is logged
    # and ignored instead of raising SettingsError at boot.
    pipedrive_owner_map: Annotated[dict[str, int], NoDecode] = {}
    # Option id of "Website" in Pipedrive's Source channel field (Company
    # settings > Data fields > Deal > Source channel, or the `channel` entry
    # of GET /v1/dealFields). Stamped on every lead, and Pipedrive carries it
    # onto the deal at conversion, so website-sourced deals stop depending on
    # someone picking the channel by hand. Unset = no channel is sent. An id
    # that is not one of the company's channels gets a 400, in which case the
    # lead is created without it (see sync) - the setting is checked at boot
    # only for shape, like the owner id.
    pipedrive_website_channel: int | None = None
    # labels applied to every API-created lead (e.g. "Website")
    pipedrive_lead_label_ids: list[str] = []
    # extra labels per form, e.g. {"newsletter": ["<Newsletter label uuid>"]}
    pipedrive_form_label_map: dict[str, list[str]] = {}
    # attribution key -> 40-char Pipedrive deal-field hash (leads inherit deal fields)
    pipedrive_lead_field_map: dict[str, str] = {}
    # "Client Type" person field (set type): field hash + form value -> option id.
    # Only applied when creating a NEW person - never overwrites existing contacts.
    pipedrive_client_type_field: str | None = None
    pipedrive_client_type_map: dict[str, int] = {}

    ga4_measurement_id: str | None = None
    ga4_api_secret: SecretStr | None = None

    # The marketing dashboard reads GET /v1/dashboard with this token in the
    # x-dashboard-token header (a shared secret until sign-in exists). Unset =
    # the endpoint refuses everyone.
    dashboard_token: SecretStr = SecretStr("")
    # Which pipelines count as which audience on the dashboard, by Pipedrive
    # pipeline id; a deal created in any other pipeline is not marketing's.
    pipedrive_pipeline_audiences: dict[int, str] = {3: "developer", 7: "developer", 2: "landowner", 6: "landowner"}
    # The KPI rule: a deal created in the Developer Pipeline is qualified at
    # creation; a Landowner Pipeline deal is qualified when it first moves past
    # CALL / QUALIFY into another stage of that pipeline.
    pipedrive_developer_pipeline_id: int = 3
    pipedrive_landowner_pipeline_id: int = 2
    pipedrive_landowner_qualify_stage_id: int = 6

    # ---- what counts as an enquiry (agreed 8 Nov 2026) --------------------------
    # An enquiry is every lead in the Leads inbox plus every deal created
    # directly in a marketing pipeline (pipedrive_pipeline_audiences), minus the
    # rules below. Inbound versus outbound lives in the dashboard's KPI config,
    # next to the same split for qualified deals. Lists and maps are JSON in
    # the environment, e.g. BIOFARM_ENQUIRY_TEST_EMAILS='["a@b.com"]'.
    # Deals with one of these Pipedrive origins are not enquiries (bulk imports).
    enquiry_excluded_deal_origins: Annotated[list[str], NoDecode] = ["Import"]
    # Records with one of these origins came through the website, so they count
    # as the Website channel when nobody set a channel.
    enquiry_website_origins: Annotated[list[str], NoDecode] = ["WebForms", "API"]
    # A record whose UTM campaign is one of these was a tracking test.
    enquiry_test_campaigns: Annotated[list[str], NoDecode] = ["tracking-test", "go-live-check", "field-map", "final-check"]
    # Persons with an address at one of these domains, or one of these
    # addresses, are the team testing the forms (compared lower-cased). The
    # team's own addresses belong in the environment, not here: set
    # BIOFARM_ENQUIRY_TEST_DOMAINS / BIOFARM_ENQUIRY_TEST_EMAILS on Render and
    # in .env (the defaults are then replaced, so repeat biofarm-test.dev).
    enquiry_test_domains: Annotated[list[str], NoDecode] = ["biofarm-test.dev"]
    enquiry_test_emails: Annotated[list[str], NoDecode] = []
    # Website sign-ups by people at these domains are staff trying the forms.
    enquiry_staff_domains: Annotated[list[str], NoDecode] = ["biofarm.co.uk"]
    # Titles matching this (case-insensitive regex) are tests. "Test Valley"
    # and "Testway" are real Hampshire places, hence the look-ahead.
    enquiry_test_title_pattern: str = r"\btest\b(?!\s+valley)"
    # Website records whose title matches this are newsletter sign-ups: counted
    # on the Newsletter page, not as enquiries.
    enquiry_newsletter_title_pattern: str = r"^\s*newsletter"
    # A word in the title that fixes the channel when the team left it blank:
    # the FBI event contacts were logged by hand after the show.
    enquiry_channel_by_title: Annotated[dict[str, str], NoDecode] = {"FBI": "Trade Show / Event"}

    # Minutes between Pipedrive mirror imports run inside this process; 0 = off.
    # It runs here rather than as a Render cron job because a cron job cannot
    # reach the service's persistent disk, where the SQLite database lives.
    mirror_import_minutes: int = Field(default=0, ge=0)

    rate_limit: str = "5/minute"
    min_fill_seconds: float = 3.0

    @field_validator("database_url", mode="after")
    @classmethod
    def _use_async_driver(cls, v: str) -> str:
        # Render hands out postgres:// or postgresql:// - SQLAlchemy async needs the asyncpg dialect.
        if v.startswith("postgres://"):
            return "postgresql+asyncpg://" + v.removeprefix("postgres://")
        if v.startswith("postgresql://"):
            return "postgresql+asyncpg://" + v.removeprefix("postgresql://")
        return v

    @field_validator("pipedrive_owner_id", "pipedrive_website_channel", mode="before")
    @classmethod
    def _positive_id_lenient(cls, v: Any, info: ValidationInfo) -> int | None:
        if v is None or v == "":
            return None
        value = _as_positive_int(v)
        if value is None:
            # Describe the value, never print it: someone could paste the API
            # token into the wrong variable, and this message goes to logs.
            logger.error(
                "BIOFARM_%s is not a positive integer id (got %s of length %d); "
                "ignoring it",
                (info.field_name or "").upper(), type(v).__name__, len(str(v)),
            )
        return value

    @field_validator("pipedrive_owner_map", mode="before")
    @classmethod
    def _owner_map_lenient(cls, v: Any) -> dict[str, int]:
        if v is None or v == "":
            return {}
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError as exc:
                logger.error(
                    "BIOFARM_PIPEDRIVE_OWNER_MAP is not valid JSON (%s); ignoring it - "
                    "leads fall back to BIOFARM_PIPEDRIVE_OWNER_ID", exc,
                )
                return {}
        if not isinstance(v, dict):
            logger.error(
                "BIOFARM_PIPEDRIVE_OWNER_MAP must be a JSON object, got %s; ignoring it",
                type(v).__name__,
            )
            return {}
        out: dict[str, int] = {}
        for key, value in v.items():
            if not isinstance(key, str) or not _OWNER_KEY.match(key):
                logger.error(
                    "BIOFARM_PIPEDRIVE_OWNER_MAP: dropping unknown key %r; %s", key, _OWNER_KEY_HELP
                )
                continue
            owner = _as_positive_int(value)
            if owner is None:
                logger.error(
                    "BIOFARM_PIPEDRIVE_OWNER_MAP[%r] is not a positive integer user id "
                    "(got %s); dropping it", key, type(value).__name__,
                )
                continue
            out[key] = owner
        return out

    # The enquiry rules are read leniently like the owner map: these settings
    # only shape a report, and a typo in one must never stop the lead API (and
    # with it the website forms) from booting. Bad values are logged and the
    # default kept.
    @field_validator(
        "enquiry_excluded_deal_origins", "enquiry_website_origins", "enquiry_test_campaigns",
        "enquiry_test_domains", "enquiry_test_emails", "enquiry_staff_domains",
        mode="before",
    )
    @classmethod
    def _string_list_lenient(cls, v: Any, info: ValidationInfo) -> list[str]:
        name = info.field_name or ""
        default = list(cls.model_fields[name].default)
        if v is None or v == "":
            return default
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError as exc:
                logger.error("BIOFARM_%s is not valid JSON (%s); ignoring it and keeping the default", name.upper(), exc)
                return default
        if not isinstance(v, list):
            logger.error("BIOFARM_%s must be a JSON array of strings, got %s; ignoring it and keeping the default", name.upper(), type(v).__name__)
            return default
        kept = [x for x in v if isinstance(x, str)]
        if len(kept) != len(v):
            logger.warning("BIOFARM_%s: dropped %d entr%s that are not strings", name.upper(), len(v) - len(kept), "y" if len(v) - len(kept) == 1 else "ies")
        return kept

    @field_validator("enquiry_channel_by_title", mode="before")
    @classmethod
    def _string_map_lenient(cls, v: Any, info: ValidationInfo) -> dict[str, str]:
        name = info.field_name or ""
        default = dict(cls.model_fields[name].default)
        if v is None or v == "":
            return default
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError as exc:
                logger.error("BIOFARM_%s is not valid JSON (%s); ignoring it and keeping the default", name.upper(), exc)
                return default
        if not isinstance(v, dict):
            logger.error("BIOFARM_%s must be a JSON object of strings, got %s; ignoring it and keeping the default", name.upper(), type(v).__name__)
            return default
        kept = {k: val for k, val in v.items() if isinstance(k, str) and isinstance(val, str)}
        if len(kept) != len(v):
            logger.warning("BIOFARM_%s: dropped %d entr%s whose key or value is not a string", name.upper(), len(v) - len(kept), "y" if len(v) - len(kept) == 1 else "ies")
        return kept

    @field_validator("enquiry_test_title_pattern", "enquiry_newsletter_title_pattern", mode="after")
    @classmethod
    def _regex_compiles(cls, v: str, info: ValidationInfo) -> str:
        """Compiled here, at boot, so a bad pattern is a log line now rather
        than a 500 on the first dashboard request."""
        name = info.field_name or ""
        try:
            re.compile(v, re.IGNORECASE)
        except re.error as exc:
            logger.error("BIOFARM_%s is not a valid regular expression (%s); keeping the default", name.upper(), exc)
            return str(cls.model_fields[name].default)
        return v

    @field_validator("enquiry_test_domains", "enquiry_test_emails", "enquiry_staff_domains", mode="after")
    @classmethod
    def _lower_trimmed(cls, v: list[str]) -> list[str]:
        return [x.strip().lower() for x in v if isinstance(x, str) and x.strip()]

    @property
    def pipedrive_enabled(self) -> bool:
        return bool(self.pipedrive_company_domain and self.pipedrive_api_token.get_secret_value())

    @property
    def ga4_enabled(self) -> bool:
        return bool(self.ga4_measurement_id and self.ga4_api_secret)
