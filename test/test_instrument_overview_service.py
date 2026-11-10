"""
Tests for the pure chain math in services/instrument_overview_service.py:
PCR and Max Pain computed from a chain already in hand, no broker or I/O.
"""

from services.instrument_overview_service import _pcr_and_max_pain


def _row(strike, ce_oi=0, pe_oi=0):
    return {"strike": strike, "ce": {"oi": ce_oi}, "pe": {"oi": pe_oi}}


def test_pcr_is_put_oi_over_call_oi():
    chain = [_row(100, ce_oi=200, pe_oi=100), _row(110, ce_oi=300, pe_oi=400)]
    pcr, _ = _pcr_and_max_pain(chain)
    assert pcr == round(500 / 500, 2)


def test_pcr_is_none_when_no_call_oi():
    chain = [_row(100, ce_oi=0, pe_oi=50)]
    pcr, _ = _pcr_and_max_pain(chain)
    assert pcr is None


def test_max_pain_picks_the_strike_with_least_total_writer_loss():
    # All OI concentrated at 100: writers lose least if spot settles at 100.
    chain = [_row(90), _row(100, ce_oi=1000, pe_oi=1000), _row(110)]
    _, max_pain = _pcr_and_max_pain(chain)
    assert max_pain == 100


def test_max_pain_on_an_empty_chain_is_none():
    pcr, max_pain = _pcr_and_max_pain([])
    assert pcr is None
    assert max_pain is None
