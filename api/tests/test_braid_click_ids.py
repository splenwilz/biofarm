"""gbraid and wbraid (27 Nov 2026): Google sends these instead of a gclid for
many iOS and app clicks. GA4 saw them on thousands of sessions since July, but
the site never stored them. They now travel like gclid: footer script ->
form payload -> lead row -> Pipedrive lead fields (when mapped) and the note."""

import json
from pathlib import Path

import pytest
import respx
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from app.models import Lead
from app.schemas import Attribution
from app.services.sync import build_note_html
from tests.conftest import make_settings
from tests.test_api import get_single_lead, mock_pipedrive_happy_path

FOOTER = Path(__file__).parents[2] / "habitat-hub" / "squarespace" / "attribution-injection.html"


def test_the_attribution_schema_keeps_both():
    a = Attribution(gbraid="0AAAAAD", wbraid="CkEKCQ")
    assert a.model_dump(exclude_none=True) == {"gbraid": "0AAAAAD", "wbraid": "CkEKCQ"}


def test_the_note_names_them():
    html = build_note_html(Lead(id="x", form="contact", name="J", email="j@example.com", fields=[], attribution={"gbraid": "0AAAAAD", "wbraid": "CkEKCQ"}))
    assert "Google Ads gbraid: 0AAAAAD" in html and "Google Ads wbraid: CkEKCQ" in html


@pytest.mark.skipif(not FOOTER.exists(), reason="the footer script lives outside api/; Render and api-only copies don't have it")
def test_the_footer_script_captures_them():
    src = FOOTER.read_text()
    assert "var CLICK = ['gclid','gbraid','wbraid','fbclid','msclkid'];" in src


@respx.mock
async def test_a_submission_stores_them_and_writes_the_mapped_lead_fields(tmp_path):
    settings = make_settings(tmp_path, pipedrive_lead_field_map={"gclid": "g" * 40, "gbraid": "b" * 40, "wbraid": "w" * 40})
    routes = mock_pipedrive_happy_path()
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.app = app
            r = await ac.post("/v1/leads/contact", json={"name": "Jane", "email": "jane@example.com", "fields": ["developer"], "newsletter_declined": True,
                                                       "attribution": {"gbraid": "0AAAAAD", "landing_page": "/?gbraid=0AAAAAD"}, "first_touch": {"wbraid": "CkEKCQ"}})
            assert r.status_code == 202
            lead = await get_single_lead(ac)
    assert lead.attribution["gbraid"] == "0AAAAAD" and lead.first_touch["wbraid"] == "CkEKCQ"
    body = json.loads(routes["lead"].calls.last.request.content)
    assert body["b" * 40] == "0AAAAAD" and body["w" * 40] == "CkEKCQ"  # first touch fills the gap, as for gclid
    assert body["channel_id"] == "google/cpc"
