import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


def make_settings(tmp_path, **overrides) -> Settings:
    defaults = dict(
        database_url=f"sqlite+aiosqlite:///{tmp_path}/test.db",
        environment="test",
        auto_create_tables=True,
        pipedrive_company_domain="biofarm",
        pipedrive_api_token="test-token",
        rate_limit="1000/minute",
        min_fill_seconds=3.0,
    )
    defaults.update(overrides)
    return Settings(_env_file=None, **defaults)


@pytest.fixture
def settings(request, tmp_path) -> Settings:
    # @pytest.mark.settings(key=value, ...) overrides fields for one test
    marker = request.node.get_closest_marker("settings")
    overrides = marker.kwargs if marker else {}
    unknown = set(overrides) - set(Settings.model_fields)
    if unknown:  # Settings has extra="ignore", so a typo would silently no-op
        raise pytest.UsageError(f"@pytest.mark.settings: unknown field(s) {sorted(unknown)}")
    return make_settings(tmp_path, **overrides)


@pytest.fixture
async def client(settings):
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ac.app = app
            yield ac
