-- ============================================================
-- 0030: 事前問診(AI)の進み具合と、会社の担当者への共有
--   - progress: 聞き取りの進み具合(0〜100。本人の画面のバーに使う)
--   - share_consent: 本人が選んだ「会社の担当者に伝えてよい範囲」
--   - company_share_draft / company_share: 共有する文章(AIの下書き / 医師が確認して共有したもの)
--   - 会社の担当者(実施事務従事者)は、医師が共有した文章だけを関数経由で読める(問診の記録そのものは読めない)
-- 何度実行しても同じ結果になる(0028・0029 の実行後に実行する)
-- ============================================================

alter table public.interview_intakes add column if not exists progress int not null default 0;
alter table public.interview_intakes add column if not exists share_consent jsonb;          -- {keys:[...], note, at}
alter table public.interview_intakes add column if not exists company_share_draft text;
alter table public.interview_intakes add column if not exists company_share text;
alter table public.interview_intakes add column if not exists company_shared_at timestamptz;
alter table public.interview_intakes add column if not exists company_shared_by uuid references auth.users(id) on delete set null;
alter table public.interview_intakes add column if not exists summary_error text;          -- 要約を作れなかったときの理由

-- 会社の担当者(実施事務従事者)向け: 医師が共有した文章だけを返す
create or replace function public.intake_company_shares(p_company uuid)
returns table(request_id uuid, company_share text, company_shared_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.request_id, i.company_share, i.company_shared_at
    from interview_intakes i
   where i.company_id = p_company
     and i.company_share is not null
     and (my_role() = 'office' or (my_role() = 'jimu' and my_company() = p_company))
$$;

grant execute on function public.intake_company_shares(uuid) to authenticated;

select 'OK: 0030 intake_share' as result;
