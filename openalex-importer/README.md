# OpenAlex Data Importer Script

This script aims to aid with realtime update of our openalex data imports. Denormalized data is fetched from the
OpenAlex API, which is then normalised into separate tables. This is all done in a single transaction, so we can
ensure atomic delta imports.

## Usage

### Running Locally

1. Install deps: `npm ci`
2. Start database: `docker-compose up postgres`
3. Apply migrations: `npm run migrate`

### Running in Production

1. Install dependencies
2. Start Docker service to run script

### Script Arguments

Run the script using:

```bash
node ./index.js --start=08-24-2024 --end=09-05-2024
```

Note: Arguments are optional. **The format is MMDDYYYY**.

#### Environment variable configuration
- `NODE_ENV=development`
  - Saves raw and normalised data to the `logs` directory
  - Caps fetching at `MAX_PAGES_TO_FETCH`
- `MAX_PAGES_TO_FETCH`
  - Configure cutoff for fetch in `development` (default 100)
  - Use to test larger datasets in testing

## Common Commands

### Generate new migrations
If you change either schema, run this to create new migration files.

```bash
npm run generate
npm run migrate
```

### Introspect Remote OpenAlex Schema

Note: this overwrites the `schema.ts` file, which has multiple change to indices and keys. Only do this to reset the base state, and be ready to rebuild the migrations directory.

To introspect a schema file from the remote database, first tunnel
`openalex-big-dev.ctzyam40vcxa.us-east-2.rds.amazonaws.com:5432` to `5438` to your local machine.

Then, set the following envvars:
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
Note: this shouldn't be necessary now that `drizzle.config.ts` includes both schemas.

```bash
npx drizzle-kit generate --schema=./drizzle/migrations/batches-schema.ts --out=./drizzle --dialect=postgresql
```

## Troubleshooting
- Some days can run with the default heap max, but some days have so many updates that it not sufficient.
  - The max long-term heap size can be increased with `--max-old-space-size=8192` (or some other number)
- To control GC frequency, bump the short-lived heap with `--max-semi-space-size=256`
  - This has a big effect with the very parallel async map requests in the older methods, not so much with bulk ops

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
import { openalex as openAlexSchema, worksInOpenalex } from "./schema.js"; // <-- this guy
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
1. Use Job+CronJob to schedule execution without having to provision 24/7
2. Add pkeys and indices to other tables if we want to use them too
3. Use a generator for fetching instead of accumulating everything in memory
   - Pick this if memory starts being an issue
