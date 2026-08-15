"""
Toy shipping cost calculator — intentionally buggy for AIECP framework testing.

Bug: the boundary at 5kg uses `>` instead of `>=`. This means a 5.00kg
package is charged the LIGHT rate (8.0) when it should be charged the
HEAVY rate (15.0). The docstring below documents the intended behavior,
which the implementation contradicts — this is the exact same shape as
the membership-expiry off-by-one bug in executor/examples/e2e-membership-bug/.

This file exists so chat-sandbox LLMs (ChatGPT Code Interpreter, etc.)
have a REAL source file to test the full AIECP bug-report workflow
against: locate-evidence → reproduce → diagnose → propose-fix →
apply-fix → verify → regression-protect → replay → report. Previous
tests (2026-08-14) used an isolated Python snippet the user pasted,
which correctly blocked at "requires target source file" because
the function wasn't in the repo. This file fixes that — the function
is now in the repo, at this path.
"""


def calculate_shipping_cost(weight_kg: float, express: bool = False) -> float:
    """Calculate the shipping cost for a package.

    Pricing tiers:
    - LIGHT rate ($8.00): packages under 5kg
    - HEAVY rate ($15.00): packages 5kg or heavier

    Express shipping doubles the cost.

    Args:
        weight_kg: The weight of the package in kilograms.
        express: If True, apply 2x multiplier for express shipping.

    Returns:
        The shipping cost in USD.

    Examples:
        >>> calculate_shipping_cost(3.0)
        8.0
        >>> calculate_shipping_cost(5.0)  # 5kg is HEAVY (>= 5)
        15.0
        >>> calculate_shipping_cost(5.0, express=True)  # 5kg express = 15.0 * 2
        30.0
        >>> calculate_shipping_cost(10.0)
        15.0
    """
    if weight_kg > 5:  # BUG: should be >= (5kg is HEAVY per docstring)
        base = 15.0
    else:
        base = 8.0

    if express:
        return base * 2
    return base
