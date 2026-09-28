-- push_history.type's CHECK constraint didn't include 'video', so publishing a video content
-- item (now allowed by the admin content API) would fail to log its push history. Postgres
-- auto-names an unnamed inline CHECK constraint as "<table>_<column>_check".
alter table public.push_history drop constraint push_history_type_check;
alter table public.push_history add constraint push_history_type_check
  check (type in ('watchlist', 'article', 'video', 'promo'));
