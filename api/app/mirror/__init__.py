"""Read-only mirror of the Pipedrive account in our own database.

The reader can only GET; the importer upserts by Pipedrive id, so it is safe
to run again; the raw API record is kept beside the typed columns so a field
nobody asked for yet is still there later.
"""
