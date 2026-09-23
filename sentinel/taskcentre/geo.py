"""Geofence maths for the Task Centre.

Geolocation is an indication of presence, never proof. A missing fix, or one whose reported accuracy
is worse than the fence's ``max_accuracy_m``, is classified ``unverified`` and never ``outside``:
a bad fix is not evidence that somebody left the site, and a false "outside" would accuse a person.
"""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from typing import Protocol

EARTH_RADIUS_M = 6_371_008.8   # IUGG mean Earth radius

INSIDE = "inside"
OUTSIDE = "outside"
UNVERIFIED = "unverified"
STATUSES = (INSIDE, OUTSIDE, UNVERIFIED)


class Fence(Protocol):
    """What :func:`classify` needs from a fence (``GeofenceRow`` satisfies it)."""
    center_lat: float
    center_lon: float
    radius_m: float
    max_accuracy_m: float | None


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    phi1, phi2 = radians(lat1), radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = radians(lon2 - lon1)
    h = sin(d_phi / 2.0) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_M * asin(min(1.0, sqrt(h)))


def classify(lat: float | None, lon: float | None, accuracy_m: float | None,
             fence: Fence | None) -> tuple[str, float | None]:
    """Classify a reported position against a fence.

    Returns ``("inside"|"outside"|"unverified", distance_m|None)``. Missing coordinates, a missing
    accuracy, no active fence, or ``accuracy_m > fence.max_accuracy_m`` all give ``("unverified", None)``
    -- such a fix is never reported as ``outside``. On the boundary (``distance == radius_m``) the
    position counts as inside.
    """
    if fence is None or lat is None or lon is None:
        return UNVERIFIED, None
    max_accuracy = getattr(fence, "max_accuracy_m", None)
    if accuracy_m is None or (max_accuracy is not None and accuracy_m > max_accuracy):
        return UNVERIFIED, None
    distance_m = haversine_m(float(lat), float(lon), fence.center_lat, fence.center_lon)
    return (INSIDE if distance_m <= fence.radius_m else OUTSIDE), distance_m
