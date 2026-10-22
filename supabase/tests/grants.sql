-- Як у Supabase: ролі мають доступ до таблиць, а обмежує все RLS.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
