-- Public bucket the CI workflow uploads built installers to, and the
-- website's /dashboard links straight to.
insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)
on conflict (id) do nothing;
