from scripts.setup_pipedrive_fields import newsletter_settings

NEWSLETTER = {"field_name": "Newsletter Sign Up", "field_code": "828536aa", "field_type": "enum",
              "options": [{"id": 1120, "label": "Opted In"}, {"id": 1121, "label": "Opted Out"}]}


def test_prints_the_newsletter_field_settings_when_the_field_exists():
    out = newsletter_settings([{"field_name": "UTM Source", "field_code": "abc", "field_type": "varchar"}, NEWSLETTER])
    assert out == ['BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD=828536aa', 'BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP={"opted_in": 1120, "opted_out": 1121}']


def test_says_so_when_the_field_or_its_options_are_missing():
    assert newsletter_settings([]) == ["Newsletter Sign Up field not found in Pipedrive; leave BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD unset"]
    odd = dict(NEWSLETTER, options=[{"id": 7, "label": "Yes"}])
    assert newsletter_settings([odd]) == ["Newsletter Sign Up field 828536aa has no 'Opted In' / 'Opted Out' options (found: Yes); set the option map by hand"]
