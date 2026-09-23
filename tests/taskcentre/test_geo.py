"""Geofence classification: the safety-relevant rule is that a bad fix is never called 'outside'."""
from __future__ import annotations

import pytest

from sentinel.store.taskcentre_models import GeofenceRow
from sentinel.taskcentre.geo import INSIDE, OUTSIDE, UNVERIFIED, classify, haversine_m

CENTER_LAT, CENTER_LON = 12.9184, 77.7325


def fence(radius_m: float = 500.0, max_accuracy_m: float | None = 100.0) -> GeofenceRow:
    return GeofenceRow(geofence_id="fence-test", site_id="north-quarry", name="test", center_lat=CENTER_LAT,
                       center_lon=CENTER_LON, radius_m=radius_m, max_accuracy_m=max_accuracy_m, active=True)


def north(metres: float) -> float:
    """A latitude `metres` north of the fence centre."""
    return CENTER_LAT + metres / 111_320.0


def test_haversine_zero_and_symmetry() -> None:
    assert haversine_m(CENTER_LAT, CENTER_LON, CENTER_LAT, CENTER_LON) == pytest.approx(0.0, abs=1e-6)
    a = haversine_m(CENTER_LAT, CENTER_LON, 12.9, 77.7)
    assert a == pytest.approx(haversine_m(12.9, 77.7, CENTER_LAT, CENTER_LON), rel=1e-12)


def test_haversine_known_distances() -> None:
    """One degree of latitude is ~111.2 km; 100 m north is 100 m."""
    assert haversine_m(0.0, 0.0, 1.0, 0.0) == pytest.approx(111_195.0, rel=0.001)
    assert haversine_m(CENTER_LAT, CENTER_LON, north(100.0), CENTER_LON) == pytest.approx(100.0, rel=0.01)


def test_inside_at_centre_and_within_radius() -> None:
    assert classify(CENTER_LAT, CENTER_LON, 5.0, fence()) == (INSIDE, pytest.approx(0.0, abs=1e-6))
    status, distance_m = classify(north(300.0), CENTER_LON, 10.0, fence())
    assert status == INSIDE
    assert distance_m == pytest.approx(300.0, rel=0.01)


def test_boundary_counts_as_inside() -> None:
    """Exactly on the radius is inside; a metre beyond it is outside."""
    point = north(400.0)
    distance_m = haversine_m(point, CENTER_LON, CENTER_LAT, CENTER_LON)
    assert classify(point, CENTER_LON, 10.0, fence(radius_m=distance_m))[0] == INSIDE
    assert classify(point, CENTER_LON, 10.0, fence(radius_m=distance_m - 1.0))[0] == OUTSIDE


def test_outside_reports_the_distance() -> None:
    status, distance_m = classify(north(1500.0), CENTER_LON, 12.0, fence())
    assert status == OUTSIDE
    assert distance_m == pytest.approx(1500.0, rel=0.01)


@pytest.mark.parametrize("lat, lon", [(None, CENTER_LON), (CENTER_LAT, None), (None, None)])
def test_missing_coordinates_are_unverified(lat: float | None, lon: float | None) -> None:
    assert classify(lat, lon, 5.0, fence()) == (UNVERIFIED, None)


def test_missing_accuracy_is_unverified() -> None:
    assert classify(CENTER_LAT, CENTER_LON, None, fence()) == (UNVERIFIED, None)


def test_poor_accuracy_is_unverified_never_outside() -> None:
    """A 3 km-accurate fix 2 km away proves nothing: it must not accuse the person of leaving site."""
    assert classify(north(2000.0), CENTER_LON, 3000.0, fence()) == (UNVERIFIED, None)
    assert classify(CENTER_LAT, CENTER_LON, 100.1, fence()) == (UNVERIFIED, None)


def test_accuracy_exactly_at_the_limit_is_accepted() -> None:
    assert classify(CENTER_LAT, CENTER_LON, 100.0, fence())[0] == INSIDE


def test_no_fence_is_unverified() -> None:
    assert classify(CENTER_LAT, CENTER_LON, 5.0, None) == (UNVERIFIED, None)
