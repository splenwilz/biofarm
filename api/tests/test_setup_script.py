from scripts.setup_pipedrive_fields import heard_about_settings, newsletter_settings

NEWSLETTER = {"field_name": "Newsletter Sign Up", "field_code": "828536aa", "field_type": "enum",
              "options": [{"id": 1120, "label": "Opted In"}, {"id": 1121, "label": "Opted Out"}]}


def test_prints_the_newsletter_field_settings_when_the_field_exists():
    out = newsletter_settings([{"field_name": "UTM Source", "field_code": "abc", "field_type": "varchar"}, NEWSLETTER])
    assert out == ['BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD=828536aa', 'BIOFARM_PIPEDRIVE_NEWSLETTER_OPTION_MAP={"opted_in": 1120, "opted_out": 1121}']


def test_says_so_when_the_field_or_its_options_are_missing():
    assert newsletter_settings([]) == ["Newsletter Sign Up field not found in Pipedrive; leave BIOFARM_PIPEDRIVE_NEWSLETTER_FIELD unset"]
    odd = dict(NEWSLETTER, options=[{"id": 7, "label": "Yes"}])
    assert newsletter_settings([odd]) == ["Newsletter Sign Up field 828536aa has no 'Opted In' / 'Opted Out' options (found: Yes); set the option map by hand"]


HEARD = {"field_name": "How they heard", "field_code": "f4c890ea", "field_type": "set",
         "options": [{"id": 1261, "label": "Search engine"}, {"id": 1265, "label": "LinkedIn"}, {"id": 1266, "label": "Recommended by someone"}, {"id": 1267, "label": "Event or trade show"},
                     {"id": 1268, "label": "Biofarm newsletter"}, {"id": 1269, "label": "Press or article"}, {"id": 1270, "label": "BNG marketplace or listing site"},
                     {"id": 1271, "label": "AI assistant (like ChatGPT)"}, {"id": 1272, "label": "Other"}]}


def test_prints_the_how_they_heard_settings_from_the_forms_own_labels():
    out = heard_about_settings([NEWSLETTER, HEARD])
    assert out == [
        "BIOFARM_PIPEDRIVE_HEARD_ABOUT_FIELD=f4c890ea",
        'BIOFARM_PIPEDRIVE_HEARD_ABOUT_OPTION_MAP={"search": 1261, "linkedin": 1265, "referral": 1266, "event": 1267, "newsletter": 1268, "press": 1269, "marketplace": 1270, "ai": 1271, "other": 1272}',
    ]


def test_says_which_answers_the_how_they_heard_field_lacks():
    assert heard_about_settings([]) == ["How they heard field not found in Pipedrive; leave BIOFARM_PIPEDRIVE_HEARD_ABOUT_FIELD unset"]
    short = dict(HEARD, options=[{"id": 1261, "label": "Search engine"}, {"id": 1, "label": "Facebook"}])
    assert heard_about_settings([short]) == [
        "BIOFARM_PIPEDRIVE_HEARD_ABOUT_FIELD=f4c890ea",
        'BIOFARM_PIPEDRIVE_HEARD_ABOUT_OPTION_MAP={"search": 1261}',
        "How they heard field f4c890ea has no option labelled 'LinkedIn', 'Recommended by someone', 'Event or trade show', 'Biofarm newsletter', 'Press or article', "
        "'BNG marketplace or listing site', 'AI assistant (like ChatGPT)', 'Other' (found: Search engine, Facebook); those answers stay in the note only",
    ]
