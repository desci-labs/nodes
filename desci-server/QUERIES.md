# get all active users

```sql
select id, email from "User" u
join (select * from "InteractionLog" z where z.extra::json->'userId'::text = u.id::text order by z."createdAt" group by  z.extra::json->'userId'::text) zz limit 10;
```

```sql
select * from "InteractionLog" z  where z.extra::json->'userId' is not null group by  z.extra::json->'userId' order by z."createdAt" limit 10;
```
