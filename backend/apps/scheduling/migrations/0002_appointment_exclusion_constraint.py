"""Install a PostgreSQL EXCLUDE USING gist constraint that prevents two
blocking appointments from overlapping for the same doctor.

PROJECT_BRIEF explicitly requires this **at the database level**:

    Double-booking himoyasi: PostgreSQL ExclusionConstraint (btree_gist)
    — (doctor_id, tstzrange(scheduled_start, scheduled_end)) DB darajasida

The constraint requires the ``btree_gist`` extension (installed by
``scripts/init-postgres.sql`` when the postgres container boots).

The migration is a no-op on non-Postgres backends so ``pytest`` can
still run against SQLite. The application-level overlap check in
:mod:`apps.scheduling.services` continues to guard SQLite tests and
also acts as a fast pre-check on Postgres.
"""
from __future__ import annotations

from django.db import migrations


CONSTRAINT_NAME = "scheduling_appointment_doctor_no_overlap"
BLOCKING_STATUSES_SQL = "('scheduled', 'confirmed', 'in_progress')"

CREATE_SQL = f"""
    ALTER TABLE scheduling_appointment
    ADD CONSTRAINT {CONSTRAINT_NAME}
    EXCLUDE USING gist (
        doctor_id WITH =,
        tstzrange(scheduled_start, scheduled_end, '[)') WITH &&
    )
    WHERE (status IN {BLOCKING_STATUSES_SQL} AND is_active = TRUE)
"""

DROP_SQL = f"""
    ALTER TABLE scheduling_appointment
    DROP CONSTRAINT IF EXISTS {CONSTRAINT_NAME}
"""


def apply_constraint(apps, schema_editor):
    """Add the exclusion constraint only on PostgreSQL."""
    if schema_editor.connection.vendor != "postgresql":
        return
    # Ensure btree_gist is available (idempotent — the init script also
    # runs this, but it's cheap insurance).
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    schema_editor.execute(CREATE_SQL)


def remove_constraint(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(DROP_SQL)


class Migration(migrations.Migration):

    dependencies = [
        ("scheduling", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            apply_constraint,
            reverse_code=remove_constraint,
            elidable=False,
        ),
    ]
