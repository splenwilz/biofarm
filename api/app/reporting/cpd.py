"""CPD session bookings by month, for the dashboard's "CPD bookings" line.

A booking is a CPD session request that came through the website (the lead
our /v1/leads/cpd route creates, titled "CPD session request"), after the
enquiry loader has applied its test and staff exclusions. They are not
enquiries: a training booking is not a BNG enquiry (26 Nov 2026). Google Ads
tracks them separately through the agency's tag, so nothing here reads GA4
or Ads, and nothing can double count.
"""

from collections.abc import Iterable
from datetime import datetime

from app.reporting.schemas import CpdMonthOut

# The CPD page went live on 6 October 2026; July is where the dashboard's
# other series start, so the line shows the empty months before launch too.
FIRST_MONTH = "2026-07"


def _next_month(month: str) -> str:
    y, m = int(month[:4]), int(month[5:7])
    return f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"


def cpd_months(times: Iterable[datetime], *, up_to: datetime, first_month: str = FIRST_MONTH) -> list[CpdMonthOut]:
    """One row per calendar month (UTC) from first_month to the month of
    `up_to`, oldest first, zero where nothing was booked. A booking dated
    before first_month is counted in its own month, which is then included."""
    counts: dict[str, int] = {}
    for t in times:
        month = t.strftime("%Y-%m")
        counts[month] = counts.get(month, 0) + 1
    start = min([first_month, *counts]) if counts else first_month
    end = max(up_to.strftime("%Y-%m"), *counts) if counts else up_to.strftime("%Y-%m")
    out: list[CpdMonthOut] = []
    month = start
    while month <= end:
        out.append(CpdMonthOut(month=month, bookings=counts.get(month, 0)))
        month = _next_month(month)
    return out
