import json
import logging
import re
from typing import Annotated, Any, get_args

from pydantic import AliasChoices, Field, SecretStr, field_validator
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


def _as_user_id(value: Any) -> int | None:
    """A positive integer Pipedrive user id, or None. Accepts an int or a
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

    @field_validator("pipedrive_owner_id", mode="before")
    @classmethod
    def _owner_id_lenient(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        owner = _as_user_id(v)
        if owner is None:
            # Describe the value, never print it: someone could paste the API
            # token into the wrong variable, and this message goes to logs.
            logger.error(
                "BIOFARM_PIPEDRIVE_OWNER_ID is not a positive integer user id (got %s of "
                "length %d); ignoring it (leads default to the API token's user)",
                type(v).__name__, len(str(v)),
            )
        return owner

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
            owner = _as_user_id(value)
            if owner is None:
                logger.error(
                    "BIOFARM_PIPEDRIVE_OWNER_MAP[%r] is not a positive integer user id "
                    "(got %s); dropping it", key, type(value).__name__,
                )
                continue
            out[key] = owner
        return out

    @property
    def pipedrive_enabled(self) -> bool:
        return bool(self.pipedrive_company_domain and self.pipedrive_api_token.get_secret_value())

    @property
    def ga4_enabled(self) -> bool:
        return bool(self.ga4_measurement_id and self.ga4_api_secret)
