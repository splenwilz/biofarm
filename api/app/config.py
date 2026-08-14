from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="BIOFARM_",
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
    pipedrive_owner_id: int | None = None
    pipedrive_lead_label_ids: list[str] = []
    # attribution key -> 40-char Pipedrive deal-field hash (leads inherit deal fields)
    pipedrive_lead_field_map: dict[str, str] = {}

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

    @property
    def pipedrive_enabled(self) -> bool:
        return bool(self.pipedrive_company_domain and self.pipedrive_api_token.get_secret_value())

    @property
    def ga4_enabled(self) -> bool:
        return bool(self.ga4_measurement_id and self.ga4_api_secret)
