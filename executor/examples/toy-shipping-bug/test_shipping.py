"""
Test suite for calculate_shipping_cost.

These tests SHOULD all pass once the bug is fixed. Currently, the
boundary test (test_heavy_rate_at_exactly_5kg) FAILS because the
implementation uses `>` instead of `>=`.

Run with: python -m pytest test_shipping.py -v
"""


from shipping import calculate_shipping_cost


def test_light_rate_under_5kg():
    """Packages under 5kg should be charged the LIGHT rate ($8)."""
    assert calculate_shipping_cost(3.0) == 8.0
    assert calculate_shipping_cost(4.99) == 8.0
    assert calculate_shipping_cost(0.1) == 8.0


def test_heavy_rate_over_5kg():
    """Packages over 5kg should be charged the HEAVY rate ($15)."""
    assert calculate_shipping_cost(5.01) == 15.0
    assert calculate_shipping_cost(10.0) == 15.0
    assert calculate_shipping_cost(100.0) == 15.0


def test_heavy_rate_at_exactly_5kg():
    """BUG: 5.00kg should be HEAVY ($15), but implementation gives LIGHT ($8).

    Per the docstring: 'HEAVY rate ($15.00): packages 5kg or heavier'
    So 5.00kg is HEAVY. But `weight_kg > 5` is False when weight_kg == 5.0,
    so the function returns 8.0 instead of 15.0. This test FAILS until
    the bug is fixed (change `>` to `>=`).
    """
    assert calculate_shipping_cost(5.0) == 15.0, (
        f"Expected 15.0 (HEAVY rate for 5kg), but got {calculate_shipping_cost(5.0)}. "
        f"Per docstring: 'HEAVY rate: packages 5kg or heavier'. "
        f"The implementation uses `>` instead of `>=`."
    )


def test_express_doubles_cost():
    """Express shipping should double the cost."""
    assert calculate_shipping_cost(3.0, express=True) == 16.0   # 8.0 * 2
    assert calculate_shipping_cost(10.0, express=True) == 30.0  # 15.0 * 2


def test_express_at_boundary():
    """Express shipping at the 5kg boundary should be 30.0 (15.0 * 2).

    This test also FAILS until the bug is fixed — it depends on
    calculate_shipping_cost(5.0) returning 15.0 (HEAVY).
    """
    assert calculate_shipping_cost(5.0, express=True) == 30.0, (
        f"Expected 30.0 (15.0 * 2 for express 5kg), but got {calculate_shipping_cost(5.0, express=True)}. "
        f"Depends on the boundary fix (>= instead of >)."
    )


def test_zero_weight():
    """Edge case: 0kg should be LIGHT rate (not an error)."""
    assert calculate_shipping_cost(0.0) == 8.0


def test_negative_weight():
    """Edge case: negative weight — undefined behavior, but should not crash.

    The function doesn't validate input; this test documents that
    negative weights are treated as LIGHT (since -1.0 > 5 is False).
    A future enhancement could add input validation.
    """
    # Current behavior: negative weight → LIGHT rate
    assert calculate_shipping_cost(-1.0) == 8.0
