"""AI Task Centre: worksite accounts, geofenced punches, assignable tasks, tickets and notifications.

Additive to the existing CAT Sentinel copilot: the ``tc_*`` tables in
``sentinel.store.taskcentre_models`` plus an ``/api/v1/tc`` API surface on the cloud service.
All timestamps are UTC seconds (the UI labels every operational time "GMT"), permissions are
enforced in the API, and geolocation is treated as an indication of presence, never as proof.
"""
