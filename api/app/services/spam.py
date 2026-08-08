from dataclasses import dataclass, field

from app.schemas import LeadSubmissionBase


@dataclass
class SpamVerdict:
    is_spam: bool
    reasons: list[str] = field(default_factory=list)


def evaluate_spam(
    submission: LeadSubmissionBase, *, min_fill_seconds: float
) -> SpamVerdict:
    reasons: list[str] = []
    if submission.website:
        reasons.append("honeypot")
    if submission.fill_ms is not None and submission.fill_ms < min_fill_seconds * 1000:
        reasons.append("too_fast")
    return SpamVerdict(is_spam=bool(reasons), reasons=reasons)
