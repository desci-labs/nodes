# `openalex-importer`

This service runs continually, scraping the OpenAlex works API for works updated every day. Each day queried returns
a (large) chunk of denormalised works, which is then normalised into separate tables. This is all done in a single
transaction, so we can ensure atomic delta updates.

Data is upserted into the tables to the extent that primary keys allow it, so the database will inch toward equalling
the OpenAlex works dataset every time a work is updated. This means that we don't duplicate the different versions of
a work, instead it's updated in place with the latest information.

To keep track of what works have been updated, the service uses two special tables: `batch` and `works_batch`:

- For each import operation, a row is created in `batch` which includes the date range it queried the OpenAlex API.
- For each work in that data, a row is created in `works_batch` mapping it to the relevant batch.

This can be used to figure out which works have been updated between certain dates, by selecting batches between those
dates and joining that with the `works_batch` table to get which `work_id`'s have been affected by updates during that
time.

There are two types of filters that can be used in the OpenAlex API: `created` and `updated` works. `created` only
returns works created that day, and `updated` returns the state of works either created or updated that day. Running
continuously with `created` would get all works, but they would drift into increasing staleness.

> [!WARNING]
> Since data is mutated for every updated work, running imports of previous dates **is destructive** as it could
> overwrite fresh data with stale data. This would eventually be corrected, but it will basically force us to re-run
> the sync from that point onward.

## Usage

### Running Locally

1. Install deps: `npm ci`
2. Start database: `docker compose up postgres`
3. Apply migrations: `npm run migrate`
4. Either:
   - `npm run build && npm run start -- --query_type=created --query_from=2025-01-01`
   - `docker compose up openalex-importer` (defaults to scheduled, set variables in `.env` to configure)

### Running in Production

Start container. By default, it will start from the first day not covered by an `updated` batch.

#### Deployment

There is no CI build/deploy for this service, since there is no dev environment for the openalex database.
Alas, be careful 🙏

```bash
# This overwrites openalex-importer:latest ⚠
./build-and-push-to-gcr.sh

# Edit kubernetes/deployment.yaml (this is a job spec, so edit the envvars in the spec to start it in the cluster)
kubectl apply -f kubernetes/deployment.yaml
```

### Script Arguments

```
Usage: node index.js --query_type=created|updated [OPTIONALS]

Flags:
  --query_type=created|updated
  [--query_from=YYYY-MM-DD]
  [--query_to=YYYY-MM-DD]
  [--query_schedule='CRONTAB']

Corresponding environment variables:
  QUERY_TYPE
  QUERY_FROM
  QUERY_TO
  QUERY_SCHEDULE

Note: Dates are always UTC. Always queries full days.

Semantics:
- No specified query range => schedule recurring job trying to continue updates from the last successful import
- Only query_from => query that single day
- Both query_from and query_to => query range (inclusive)
- No query_schedule => defaults to trying to perform next import every 5 minutes, no-op if already in progress
```

#### Environment variable configuration

The flags have corresponding envvars, additionally these are available:

- `NODE_ENV=development`
  - Saves raw and normalised data to the `logs` directory
  - Caps fetching at `MAX_PAGES_TO_FETCH` (incomplete data, useful for testing)
- `MAX_PAGES_TO_FETCH`
  - Configure cutoff for fetch (dev only, default 100)
  - Use to test larger datasets in testing
- `SKIP_LOG_WRITE=true`
  - Do not write fetched data to `logs/` (dev only)
  - Can use many gigs of space when using `--query-type=updated`

## Common Commands

### Generate new migrations

If you change either schema, run this to create new migration files and apply the to the database.

```bash
npm run generate
npm run migrate
```

### Introspect Remote OpenAlex Schema

> [!WARNING]  
> This overwrites the `schema.ts` file, which has multiple change to indices and keys.
> Only do this to reset the base state, and be ready to rebuild the migrations directory.

To introspect a schema file from the remote database, first tunnel the remote database to `5438` to your local machine
using kubectl.

Then, set the following environment variables:

```bash
PG_HOST=localhost
PG_PORT=5438
POSTGRES_USER=reader2
POSTGRES_PASSWORD=[redacted]
POSTGRES_DB=postgres
```

Finally, run:

```bash
npx drizzle-kit introspect
```

The drizzle introspection of indexes has a bug where it sometimes sets an incompatible `opclass`, mainly
`int4_ops` on `text` fields. If the migrations fail after introspection, fix these instances manually in the
schema by setting it to `text_ops`.

### Manually generate batches migration

> [!NOTE]  
> This shouldn't be necessary now that `drizzle.config.ts` includes both schemas.

```bash
npx drizzle-kit generate --schema=./drizzle/migrations/batches-schema.ts --out=./drizzle --dialect=postgresql
```

## Troubleshooting

### Drizzle bug: `maximum call stack size exceeded`

There is an issue with `drizzle` where large batch inserts hits this error. Likely caused by using non-tail optimised
recursion to build the queries.

```
RangeError: Maximum call stack size exceeded
    at mergeQueries (...)
```

Solution: decrease the batch size when doing batch inserts.

Open issues:
https://github.com/drizzle-team/drizzle-orm/issues/1740

### Drizzle bug: `syntax error` / `cannot cast type record to text[]` on array functions

Trying to pass arrays of values when building queries doesn't work as drizzle can't handle them.
This would be better than using raw `VALUES` for bulk inserts, but the following bug/feature request suggest it's
not possible atm. The workarounds suggest stringifying the full array into the query instead of parameterising it,
but that does not work well with large batches.

Open issues:
https://github.com/drizzle-team/drizzle-orm/issues/1589
https://github.com/drizzle-team/drizzle-orm/issues/1289

### Drizzle bug: `index does not exist` on index/key adjustments

Drizzle doesn't include the schema qualifier when generating migrations that edit indexes or keys, so trying to apply
the migration causes these errors:

```
openalex_db  | 2025-01-22 12:29:24.281 UTC [7285] ERROR:  index "authors_id_idx" does not exist
openalex_db  | 2025-01-22 12:29:24.281 UTC [7285] STATEMENT:  DROP INDEX "authors_id_idx";
```

Solution: manually edit the broken migration file to prefix the identifier:

```sql
DROP INDEX "openalex"."authors_id_idx"`
```

### Drizzle bug: `npx drizzle-kit {generate,migrate}: module not found './schema.js'`

When invoked through as a binary, drizzle fails to find any schema imported with ESM syntax. Other imports are fine for
some reason.

Use `npm run generate` and `npm run migrate`, which make this change automatically.

If you need to run the binary: temporarily drop the `.js` from this import in `batches-schema.ts` when running `npx drizzle` commands.

```ts
// batches-schema.ts
import { openalex as openAlexSchema, worksInOpenalex } from './schema.js'; // <-- this guy
```

Open issues:
https://github.com/drizzle-team/drizzle-orm/issues/1561
https://github.com/drizzle-team/drizzle-orm/issues/2705

### Drizzle bug: fails to remove `NOT NULL` constraint after `PRIMARY KEY` constraint is dropped in migration

If a column is removed from a composite primary key in a migration, drizzle does not remove the implicit `NOT NULL`
constraint. Hence, `null` cannot be inserted into a column which was _previously_ included in a composite PK.

### Drizzle bug: supports `enum` but doesn't actually create them

When creating an enum type column [exactly like the docs](https://orm.drizzle.team/docs/column-types/pg#enum), it's
not actually included in the migration file so the `ALTER TABLE` statement fails to apply.

Solution: use `text`

## Future improvements

1. Add support for other endpoints to support missing data (see footnote 2 in table)
2. Fix `works_authorships` (overloaded with dupe info, breaks `ON CONFLICT UPDATE` within batches)

## Supported datatypes

Not all OA datatypes are fully supported, the table below shows the status of each.

| Table                   | Support | Note                                  |
| ----------------------- | ------- | ------------------------------------- |
| authors                 | 🌓      | only: id, display_name, orcid (1) (2) |
| authors_counts_by_year  | ❌      | (2)                                   |
| authors_ids             | 🌓      | only: id + orcid (1) (2)              |
| topics                  | ❌      | (2)                                   |
| concepts                | ❌      | (2)                                   |
| institutions            | ❌      | (2)                                   |
| sources                 | ❌      | (2)                                   |
| works                   | ✅      |                                       |
| works_primary_locations | ✅      |                                       |
| works_locations         | ✅      | no unique constraint available        |
| works_best_oa_locations | ✅      |                                       |
| works_authorships       | ❌      |                                       |
| works_topics            | ✅      | maps work -> topic ID                 |
| works_concepts          | ✅      | maps work -> concept ID               |
| works_ids               | ✅      |                                       |
| works_open_access       | ✅      |                                       |
| works_referenced_works  | ✅      |                                       |
| works_related_works     | ✅      |                                       |

Footnotes:

1. Populated from the dehydrated `author` field in `work.authorship`, which lacks the rest
2. Needs support for separate API route/format
