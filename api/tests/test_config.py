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


def test_website_channel_from_env_string(monkeypatch):
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_WEBSITE_CHANNEL", "1037")
    assert Settings(_env_file=None).pipedrive_website_channel == 1037


def test_website_channel_bad_values_are_ignored_not_fatal(caplog):
    for bad in ("website", "", "0", "-3", "1.5", True):
        s = Settings(_env_file=None, pipedrive_website_channel=bad)
        assert s.pipedrive_website_channel is None, bad
    assert "BIOFARM_PIPEDRIVE_WEBSITE_CHANNEL" in caplog.text


def test_enquiry_rules_have_the_agreed_defaults():
    """The enquiry rules agreed on 8 Nov 2026: imported deals are not enquiries,
    website-origin records default to the Website channel, test and staff
    submissions are left out, FBI event contacts count as Trade Show / Event."""
    s = Settings(_env_file=None)
    assert s.enquiry_excluded_deal_origins == ["Import"]
    assert s.enquiry_website_origins == ["WebForms", "API"]
    assert s.enquiry_test_campaigns == ["tracking-test", "go-live-check", "field-map", "final-check"]
    # personal addresses live in the environment, not in the code: only the synthetic test domain is a default
    assert s.enquiry_test_domains == ["biofarm-test.dev"]
    assert s.enquiry_test_emails == []
    assert s.enquiry_staff_domains == ["biofarm.co.uk"]
    assert s.enquiry_channel_by_title == {"FBI": "Trade Show / Event"}
    assert s.enquiry_newsletter_title_pattern and s.enquiry_test_title_pattern


def test_enquiry_rules_parse_from_json_env(monkeypatch):
    monkeypatch.setenv("BIOFARM_ENQUIRY_TEST_EMAILS", '["A@Example.com", " b@example.com "]')
    monkeypatch.setenv("BIOFARM_ENQUIRY_CHANNEL_BY_TITLE", '{"FBI": "Trade Show / Event", "CLA": "Trade Show / Event"}')
    s = Settings(_env_file=None)
    assert s.enquiry_test_emails == ["a@example.com", "b@example.com"]  # compared lower-cased and trimmed
    assert s.enquiry_channel_by_title == {"FBI": "Trade Show / Event", "CLA": "Trade Show / Event"}


def test_a_malformed_enquiry_list_in_the_environment_is_logged_and_ignored(monkeypatch, caplog):
    """A typo in one of these must not take the lead API (and the website forms)
    down at boot: the default stays and the problem is logged, as for the owner map."""
    monkeypatch.setenv("BIOFARM_ENQUIRY_TEST_EMAILS", '["a@b.com", oops')
    monkeypatch.setenv("BIOFARM_ENQUIRY_CHANNEL_BY_TITLE", "not json")
    monkeypatch.setenv("BIOFARM_ENQUIRY_EXCLUDED_DEAL_ORIGINS", '{"a": 1}')  # valid JSON, wrong shape
    with caplog.at_level("ERROR"):
        s = Settings(_env_file=None)
    assert s.enquiry_test_emails == [] and s.enquiry_channel_by_title == {"FBI": "Trade Show / Event"} and s.enquiry_excluded_deal_origins == ["Import"]
    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "BIOFARM_ENQUIRY_TEST_EMAILS" in messages and "BIOFARM_ENQUIRY_CHANNEL_BY_TITLE" in messages and "BIOFARM_ENQUIRY_EXCLUDED_DEAL_ORIGINS" in messages


def test_enquiry_lists_still_parse_from_good_json_and_drop_non_strings(monkeypatch):
    monkeypatch.setenv("BIOFARM_ENQUIRY_TEST_CAMPAIGNS", '["x", 5, " y "]')
    monkeypatch.setenv("BIOFARM_ENQUIRY_CHANNEL_BY_TITLE", '{"FBI": "Trade Show / Event", "n": 3}')
    s = Settings(_env_file=None)
    assert s.enquiry_test_campaigns == ["x", " y "]
    assert s.enquiry_channel_by_title == {"FBI": "Trade Show / Event"}


def test_an_invalid_regex_setting_is_logged_and_the_default_kept(monkeypatch, caplog):
    """Compiled at boot, not on the first dashboard request."""
    monkeypatch.setenv("BIOFARM_ENQUIRY_TEST_TITLE_PATTERN", r"\btest(")
    with caplog.at_level("ERROR"):
        s = Settings(_env_file=None)
    assert s.enquiry_test_title_pattern == r"\btest\b(?!\s+valley)"
    assert "BIOFARM_ENQUIRY_TEST_TITLE_PATTERN" in " ".join(r.getMessage() for r in caplog.records)


def test_entries_dropped_from_an_enquiry_setting_are_logged(monkeypatch, caplog):
    monkeypatch.setenv("BIOFARM_ENQUIRY_TEST_CAMPAIGNS", '["x", 5]')
    monkeypatch.setenv("BIOFARM_ENQUIRY_CHANNEL_BY_TITLE", '{"FBI": 3}')
    with caplog.at_level("WARNING"):
        s = Settings(_env_file=None)
    assert s.enquiry_test_campaigns == ["x"] and s.enquiry_channel_by_title == {}
    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "BIOFARM_ENQUIRY_TEST_CAMPAIGNS" in messages and "BIOFARM_ENQUIRY_CHANNEL_BY_TITLE" in messages


def test_newsletter_option_map_parses_from_json_env_and_coerces_digit_strings(monkeypatch):
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD", "newshash")
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP", '{"opted_in": "1120", "opted_out": 1121}')
    s = Settings(_env_file=None)
    assert s.pipedrive_newsletter_field == "newshash"
    assert s.pipedrive_newsletter_option_map == {"opted_in": 1120, "opted_out": 1121}


def test_a_malformed_newsletter_option_map_is_logged_and_ignored_not_fatal(monkeypatch, caplog):
    # a bad paste on Render must never take every form on the site offline
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP", '{"opted_in": 1120, "opted_out": 1121')
    assert Settings(_env_file=None).pipedrive_newsletter_option_map == {}
    assert "BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP" in caplog.text and "JSON" in caplog.text
    caplog.clear()
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP", "[1120, 1121]")
    assert Settings(_env_file=None).pipedrive_newsletter_option_map == {}
    assert "JSON object" in caplog.text
    caplog.clear()
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP", '{"optedin": 1120, "opted_out": "no", "opted_in": 1120}')
    assert Settings(_env_file=None).pipedrive_newsletter_option_map == {"opted_in": 1120}
    assert "'optedin'" in caplog.text and "'opted_out'" in caplog.text
    monkeypatch.setenv("BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP", "")
    assert Settings(_env_file=None).pipedrive_newsletter_option_map == {}


def test_an_incomplete_newsletter_setting_warns_at_boot(caplog):
    Settings(_env_file=None, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120})
    assert "BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP" in caplog.text and "opted_out" in caplog.text
    caplog.clear()
    Settings(_env_file=None, pipedrive_newsletter_option_map={"opted_in": 1120, "opted_out": 1121})
    assert "BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD" in caplog.text
    caplog.clear()
    Settings(_env_file=None, pipedrive_newsletter_field="newshash", pipedrive_newsletter_option_map={"opted_in": 1120, "opted_out": 1121})
    Settings(_env_file=None)
    assert "NEWSLETTER" not in caplog.text
