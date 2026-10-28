# constants

Values that more than one project has to agree on, and that are owned by the
code rather than by the database or an API response. One file per domain.

`reports.ts` is the report taxonomy — families, types, wire codes. It is the
**source of truth**: `libs/db`'s seed projects it into `report_family` /
`report_type`, and the mobile app reads it directly for the picker, the BLE
mesh wire codes and its typesafe `ReportTypeKey` union.

Deliberately not fetched at runtime: a report type is unusable by a client
that has no icon and no label for it, and both of those ship with the build —
so the taxonomy can never usefully outrun the bundle. Changing it is a commit
plus an OTA, not a server toggle.
