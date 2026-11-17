-- ============================================================
-- 0034: メールアドレスやスマートフォンのない方の受検(IDでの受検・紙の回答の登録)
--   受検の基本は今までどおりメールあり(配布URL・QR・招待メール)。それが難しい方のために:
--   - ID受検: 実施者・実施事務従事者が「ログインID(数字8桁)」と「合言葉」を発行して紙で渡す。
--             本人はログイン画面の「IDでログイン」から入り、最初に生年月日で本人確認をして受検する
--   - 紙:     専用の回答用紙に記入してもらい、実施者・実施事務従事者が回答を登録する(写真からのAI読み取りも可)
--   どの方法でも、結果は同じ表(results)に入り、結果一覧・集団分析・労基署報告に同じように反映される
--
--   - profiles.login_id:            メールなしの方のログインID(数字8桁)。メールありの方は空
--   - profiles.id_birth_date:       発行時に登録した生年月日(最初のログインの本人確認用。本人は変更できない)
--   - profiles.id_issued_at:        合言葉を最後に発行した日時(まだ紙を渡していない方が分かるように)
--   - profiles.id_confirmed_at:     本人確認が済んだ日時
--   - profiles.id_confirm_failures: 本人確認に失敗した回数(5回で止め、合言葉の再発行が必要になる)
--   - results.exam_method:          受検方法(web: メール / id: ID受検 / paper: 紙)
--   - results.entered_by:           紙の回答を登録した人
-- 何度実行しても同じ結果になる
-- ============================================================

alter table public.profiles add column if not exists login_id text;
alter table public.profiles add column if not exists id_birth_date date;
alter table public.profiles add column if not exists id_issued_at timestamptz;
alter table public.profiles add column if not exists id_confirmed_at timestamptz;
alter table public.profiles add column if not exists id_confirm_failures int not null default 0;

alter table public.profiles drop constraint if exists profiles_login_id_format;
alter table public.profiles add constraint profiles_login_id_format check (login_id is null or login_id ~ '^[0-9]{8}$');
create unique index if not exists profiles_login_id_uniq on public.profiles (login_id) where login_id is not null;

alter table public.results add column if not exists exam_method text not null default 'web';
alter table public.results drop constraint if exists results_exam_method_check;
alter table public.results add constraint results_exam_method_check check (exam_method in ('web', 'id', 'paper'));
alter table public.results add column if not exists entered_by uuid references auth.users(id) on delete set null;

-- IDでログインした方の、最初の本人確認(生年月日)が済んでいるか。メールでログインする方は常に true
create or replace function public.id_confirmed(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from profiles p
     where p.user_id = p_user and p.login_id is not null and p.id_confirmed_at is null
  );
$$;
revoke all on function public.id_confirmed(uuid) from public, anon;
grant execute on function public.id_confirmed(uuid) to authenticated;

-- 本人が画面から受検したときの受検方法は、データベース側で決める(本人の申告を信用しない)。
-- 紙の回答の登録(サーバーからの登録。ログイン中の本人ではない)は、指定された値のままにする。
-- IDでログインした方は、本人確認が済むまで回答を登録できない(合言葉の紙を拾った人が使えないように)
create or replace function public.set_exam_method() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.user_id = auth.uid() and not public.id_confirmed(auth.uid()) then
      raise exception '最初に生年月日でのご本人の確認を済ませてください';
    end if;
    new.exam_method := case
      when exists (select 1 from profiles p where p.user_id = new.user_id and p.login_id is not null) then 'id'
      else 'web'
    end;
    new.entered_by := null;
  end if;
  return new;
end $$;

drop trigger if exists set_exam_method on public.results;
create trigger set_exam_method before insert on public.results
  for each row execute function public.set_exam_method();

-- IDでログインした方は、本人確認が済むまで自分の結果(過去の年度を含む)を読めない。
-- ほかの決まり(本人・実施者・実施事務従事者・同意済みの事業者)はそのままで、これは追加の条件(restrictive)
drop policy if exists "id user reads own results after confirmation" on public.results;
create policy "id user reads own results after confirmation" on public.results
  as restrictive for select to authenticated
  using (user_id <> (select auth.uid()) or (select public.id_confirmed(auth.uid())));

-- 適用状況の確認
select * from (
  values
    ('メールなしの受検者(profiles の列)',
     (select case when count(*) = 5 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name in ('login_id', 'id_birth_date', 'id_issued_at', 'id_confirmed_at', 'id_confirm_failures'))),
    ('受検方法(results の列)',
     (select case when count(*) = 2 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public' and table_name = 'results' and column_name in ('exam_method', 'entered_by'))),
    ('受検方法を決める仕組み(トリガー)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end from pg_trigger where tgname = 'set_exam_method')),
    ('本人確認が済むまで結果を読めない決まり',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_policies where schemaname = 'public' and tablename = 'results'
         and policyname = 'id user reads own results after confirmation'))
) as t(項目, 状態);
