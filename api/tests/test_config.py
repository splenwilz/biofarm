from app.config import Settings


def test_render_postgres_url_is_rewritten_for_asyncpg():
    s = Settings(_env_file=None, database_url="postgresql://u:p@host/db")
    assert s.database_url == "postgresql+asyncpg://u:p@host/db"

    s = Settings(_env_file=None, database_url="postgres://u:p@host/db")
    assert s.database_url == "postgresql+asyncpg://u:p@host/db"


def test_sqlite_url_is_untouched():
    s = Settings(_env_file=None, database_url="sqlite+aiosqlite:///x.db")
    assert s.database_url == "sqlite+aiosqlite:///x.db"


def test_api_token_is_secret():
    s = Settings(_env_file=None, pipedrive_api_token="super-secret")
    assert "super-secret" not in repr(s)
    assert s.pipedrive_api_token.get_secret_value() == "super-secret"


def test_pipedrive_enabled_requires_domain_and_token():
    assert not Settings(_env_file=None).pipedrive_enabled
    assert not Settings(_env_file=None, pipedrive_company_domain="x").pipedrive_enabled
    assert Settings(
        _env_file=None, pipedrive_company_domain="x", pipedrive_api_token="t"
    ).pipedrive_enabled


def test_lead_field_map_parses_from_json_env(monkeypatch):
    monkeypatch.setenv(
        "BIOFARM_PIPEDRIVE_LEAD_FIELD_MAP",
        '{"utm_source": "a" }',
    )
    s = Settings(_env_file=None)
    assert s.pipedrive_lead_field_map == {"utm_source": "a"}


def test_ga4_enabled_requires_both_values():
    assert not Settings(_env_file=None, ga4_measurement_id="G-X").ga4_enabled
    assert Settings(
        _env_file=None, ga4_measurement_id="G-X", ga4_api_secret="s"
    ).ga4_enabled
