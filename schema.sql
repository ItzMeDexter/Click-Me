-- CLICK ME (GitHub Pages + Supabase). Run this whole file ONCE in Supabase > SQL Editor.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
create table if not exists private.secrets(k text primary key, v text not null);
insert into private.secrets values('enc', encode(extensions.gen_random_bytes(32),'hex')) on conflict do nothing;

create table if not exists profiles(id uuid primary key references auth.users on delete cascade, username text not null, email text not null,
  usd numeric(12,2) not null default 0 check(usd>=0), earned numeric(12,2) not null default 0, suspended boolean not null default false,
  is_admin boolean not null default false, last_bonus bigint not null default 0, created bigint not null default extract(epoch from now())::bigint);
create unique index if not exists pu on profiles(lower(username)); create unique index if not exists pe on profiles(email);
create table if not exists ads(id bigint generated always as identity primary key, title text not null, reward numeric(8,2) not null, secs int not null default 15, active boolean not null default true);
create table if not exists tasks(id bigint generated always as identity primary key, title text not null, descr text not null, reward numeric(8,2) not null, active boolean not null default true);
create table if not exists task_subs(id bigint generated always as identity primary key, uid uuid not null references profiles on delete cascade, tid bigint not null references tasks on delete cascade, status text not null default 'pending', t bigint not null, unique(uid,tid));
create table if not exists tx(id bigint generated always as identity primary key, txid text unique not null, uid uuid not null references profiles on delete cascade, type text not null, amt numeric(12,2) not null, note text, demo int not null default 0, t bigint not null);
create index if not exists tx_u on tx(uid,t);
create table if not exists withdrawals(id bigint generated always as identity primary key, wid text unique not null, uid uuid not null references profiles on delete cascade, usd numeric(12,2) not null, cur text not null, rate numeric(12,4) not null, payout numeric(14,2) not null, last4 text, details text not null, status text not null default 'Pending', t bigint not null, upd bigint not null);
create table if not exists settings(k text primary key, v text not null);
create table if not exists rates(id bigint generated always as identity primary key, rate numeric(12,4) not null, note text, t bigint not null);
create table if not exists attempts(id bigint generated always as identity primary key, k text not null, t bigint not null);
create table if not exists ad_sessions(uid uuid primary key references profiles on delete cascade, ad_id bigint not null, t bigint not null);
insert into settings values('rate','300'),('min','200'),('bonus','0.05'),('maxAds','20'),('cool','60'),('demo','1'),('revenue','0') on conflict do nothing;
insert into ads(title,reward,secs) select 'Rewarded video - short',0.18,15 where not exists(select 1 from ads);
insert into ads(title,reward,secs) select 'Rewarded video - extended',0.28,30 where (select count(*) from ads)=1;
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
-- RLS is ON with NO policies: nobody can read/write tables directly. All access goes through the functions below.

create or replace function private.ts() returns bigint language sql stable as $$ select extract(epoch from now())::bigint $$;
create or replace function private.daystart() returns bigint language sql stable as $$ select extract(epoch from (date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo'))::bigint $$;
create or replace function private.setv(text) returns text language sql stable security definer set search_path=public as $$ select v from public.settings where k=$1 $$;
create or replace function private.tid() returns text language sql as $$ select 'TX-'||upper(encode(extensions.gen_random_bytes(5),'hex')) $$;
create or replace function private.me() returns profiles language plpgsql security definer set search_path=public as $$
declare u profiles; begin select * into u from profiles where id=auth.uid();
 if not found then raise exception 'Please log in'; end if; if u.suspended then raise exception 'Account unavailable'; end if; return u; end $$;
create or replace function private.adm() returns void language plpgsql security definer set search_path=public as $$
begin if not coalesce((select is_admin and not suspended from profiles where id=auth.uid()),false) then raise exception 'Admin login required'; end if; end $$;
create or replace function private.throttle(p_k text,mx int,win int) returns void language plpgsql security definer set search_path=public as $$
begin if (select count(*) from attempts where k=p_k and t>private.ts()-win)>=mx then raise exception 'Too many attempts. Wait a few minutes.'; end if; insert into attempts(k,t) values(p_k,private.ts()); end $$;
create or replace function private.credit(p_uid uuid,p_amt numeric,p_type text,p_note text,p_earn boolean default true) returns void language plpgsql security definer set search_path=public as $$
begin update profiles set usd=usd+p_amt, earned=earned+case when p_earn then p_amt else 0 end where id=p_uid;
 insert into tx(txid,uid,type,amt,note,demo,t) values(private.tid(),p_uid,p_type,p_amt,p_note,case when p_earn then private.setv('demo')::int else 0 end,private.ts()); end $$;

-- profile is created when someone registers (validated here, on the server)
create or replace function private.on_signup() returns trigger language plpgsql security definer set search_path=public as $$
declare un text:=trim(new.raw_user_meta_data->>'username'); em text:=lower(trim(new.raw_user_meta_data->>'email'));
begin
 if un !~ '^[A-Za-z0-9_]{3,20}$' or em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(em)>120 or coalesce(new.raw_user_meta_data->>'age','')<>'true' then raise exception 'Invalid signup data'; end if;
 insert into profiles(id,username,email) values(new.id,un,em); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.on_signup();

create or replace function api_init(p jsonb) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('csrf','','user',exists(select 1 from profiles where id=auth.uid() and not suspended),
  'admin',coalesce((select is_admin and not suspended from profiles where id=auth.uid()),false),
  'set',jsonb_build_object('rate',private.setv('rate')::numeric,'min',private.setv('min')::numeric,'bonus',private.setv('bonus')::numeric,'maxAds',private.setv('maxAds')::int,'demo',private.setv('demo')::int)) $$;
create or replace function api_resolve(p jsonb) returns text language sql stable security definer set search_path=public as $$
 select coalesce((select lower(username)||'@clickme-rewards.net' from profiles where lower(username)=lower(p->>'id') or email=lower(p->>'id') limit 1), lower(coalesce(p->>'id','x'))||'@clickme-rewards.net') $$;

create or replace function api_u_state(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u profiles; d bigint:=private.daystart(); begin u:=private.me();
 return jsonb_build_object('u',jsonb_build_object('username',u.username,'email',u.email,'created',u.created,'usd',u.usd,'earned',u.earned,
   'pending',(select coalesce(sum(usd),0) from withdrawals where uid=u.id and status in('Pending','Processing','Approved')),
   'adsDone',(select count(*) from tx where uid=u.id and type='ad'),'today',(select coalesce(sum(amt),0) from tx where uid=u.id and amt>0 and t>=d),
   'todayAds',(select count(*) from tx where uid=u.id and type='ad' and t>=d),'bonusLeft',greatest(0,u.last_bonus+86400-private.ts())),
  'tx',coalesce((select jsonb_agg(to_jsonb(x)) from (select txid as id,type,amt,note,demo,t from tx where uid=u.id order by id desc limit 100) x),'[]'),
  'wds',coalesce((select jsonb_agg(to_jsonb(x)) from (select wid as id,usd,cur,payout,status,last4,t from withdrawals where uid=u.id order by id desc limit 50) x),'[]'),
  'ads',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,reward,secs from ads where active order by id) x),'[]'),
  'tasks',coalesce((select jsonb_agg(to_jsonb(x)) from (select t.id,t.title,t.descr,t.reward,s.status st from tasks t left join task_subs s on s.tid=t.id and s.uid=u.id where t.active order by t.id) x),'[]'),
  'set',(api_init('{}')->'set')); end $$;

create or replace function api_ad_start(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u profiles; a ads; begin u:=private.me();
 select * into a from ads where id=(p->>'id')::bigint and active; if not found then raise exception 'Ad not available'; end if;
 if (select count(*) from tx where uid=u.id and type='ad' and t>=private.daystart())>=private.setv('maxAds')::int then raise exception 'Daily ad limit reached'; end if;
 if private.ts()-coalesce((select max(t) from tx where uid=u.id and type='ad'),0)<private.setv('cool')::int then raise exception 'Please wait before the next ad'; end if;
 insert into ad_sessions values(u.id,a.id,private.ts()) on conflict(uid) do update set ad_id=excluded.ad_id,t=excluded.t;
 return jsonb_build_object('secs',a.secs); end $$;
-- When a real ad provider is connected, verify its confirmation here instead of the timer.
create or replace function api_ad_claim(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u profiles; s ad_sessions; a ads; begin u:=private.me(); perform 1 from profiles where id=u.id for update;
 delete from ad_sessions where uid=u.id returning * into s; if not found then raise exception 'No ad in progress'; end if;
 select * into a from ads where id=s.ad_id and active; if not found then raise exception 'Ad not available'; end if;
 if private.ts()-s.t<a.secs then raise exception 'Ad not completed'; end if;
 if private.ts()-coalesce((select max(t) from tx where uid=u.id and type='ad'),0)<private.setv('cool')::int then raise exception 'Too fast'; end if;
 perform private.credit(u.id,a.reward,'ad','Rewarded ad: '||a.title); return '{"ok":1}'; end $$;

create or replace function api_bonus(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u profiles; begin u:=private.me(); select * into u from profiles where id=u.id for update;
 if private.ts()-u.last_bonus<86400 then raise exception 'Bonus not ready yet'; end if;
 update profiles set last_bonus=private.ts() where id=u.id; perform private.credit(u.id,private.setv('bonus')::numeric,'bonus','Daily bonus'); return '{"ok":1}'; end $$;
create or replace function api_task_submit(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u profiles; begin u:=private.me(); if not exists(select 1 from tasks where id=(p->>'id')::bigint and active) then raise exception 'Task not found'; end if;
 insert into task_subs(uid,tid,t) values(u.id,(p->>'id')::bigint,private.ts()) on conflict do nothing; if not found then raise exception 'Already submitted'; end if; return '{"ok":1}'; end $$;

create or replace function api_wd_create(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u profiles; amt numeric:=round(coalesce(nullif(p->>'amt','')::numeric,0),2); cur text:=p->>'cur'; bank text:=left(trim(coalesce(p->>'bank','')),60);
 nm text:=left(trim(coalesce(p->>'name','')),80); ac text:=regexp_replace(coalesce(p->>'acct',''),'\s','','g'); rt numeric:=private.setv('rate')::numeric; w text:='WD-'||upper(encode(extensions.gen_random_bytes(5),'hex'));
begin u:=private.me(); perform private.throttle('wd:'||u.id,5,86400);
 if cur not in('USD','LKR') then raise exception 'Choose USD or LKR'; end if;
 if amt<private.setv('min')::numeric then raise exception 'Minimum withdrawal is $% USD',private.setv('min'); end if;
 if length(bank)<2 or length(nm)<2 or ac !~ '^[A-Za-z0-9-]{6,34}$' then raise exception 'Enter valid bank name, account holder name and account number'; end if;
 select * into u from profiles where id=u.id for update; if amt>u.usd then raise exception 'Amount is more than your available balance'; end if;
 update profiles set usd=usd-amt where id=u.id;
 insert into withdrawals(wid,uid,usd,cur,rate,payout,last4,details,t,upd) values(w,u.id,amt,cur,rt,case when cur='LKR' then round(amt*rt,2) else amt end,right(ac,4),
  encode(extensions.pgp_sym_encrypt(jsonb_build_object('bank',bank,'name',nm,'acct',ac)::text,(select v from private.secrets where k='enc')),'base64'),private.ts(),private.ts());
 insert into tx(txid,uid,type,amt,note,demo,t) values(private.tid(),u.id,'withdraw',-amt,'Withdrawal request '||w,0,private.ts()); return jsonb_build_object('id',w); end $$;

-- ADMIN functions (every one checks is_admin on the server)
create or replace function api_a_state(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform private.adm();
 return jsonb_build_object('stats',jsonb_build_object('users',(select count(*) from profiles),'earned',(select coalesce(sum(earned),0) from profiles),
  'paid',(select coalesce(sum(usd),0) from withdrawals where status='Completed'),'pending',(select coalesce(sum(usd),0) from withdrawals where status in('Pending','Processing','Approved')),'revenue',private.setv('revenue')::numeric),
 'users',coalesce((select jsonb_agg(to_jsonb(x)) from (select u.id,username,email,created,usd,earned,suspended,(select count(*) from tx where uid=u.id and type='ad') ads from profiles u order by created desc limit 500) x),'[]'),
 'wds',coalesce((select jsonb_agg(to_jsonb(x)) from (select w.wid,w.status,w.usd,w.cur,w.rate,w.payout,w.t,u.username,
    extensions.pgp_sym_decrypt(decode(w.details,'base64'),(select v from private.secrets where k='enc'))::jsonb d from withdrawals w join profiles u on u.id=w.uid order by w.id desc limit 200) x),'[]'),
 'tx',coalesce((select jsonb_agg(to_jsonb(x)) from (select t.txid,t.type,t.amt,t.note,t.demo,t.t,u.username from tx t join profiles u on u.id=t.uid order by t.id desc limit 200) x),'[]'),
 'ads',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from ads a),'[]'),'tasks',coalesce((select jsonb_agg(to_jsonb(k) order by k.id) from tasks k),'[]'),
 'subs',coalesce((select jsonb_agg(to_jsonb(x)) from (select s.id,s.t,u.username,k.title,k.reward from task_subs s join profiles u on u.id=s.uid join tasks k on k.id=s.tid where s.status='pending' order by s.id) x),'[]'),
 'cfg',(select jsonb_object_agg(k,v) from settings),'rates',coalesce((select jsonb_agg(to_jsonb(r)) from (select rate,note,t from rates order by id desc limit 10) r),'[]')); end $$;

create or replace function api_a_wd_set(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare w withdrawals; ns text:=p->>'s'; begin perform private.adm();
 select * into w from withdrawals where wid=p->>'id' for update;
 if not found or not ((w.status='Pending' and ns in('Processing','Approved','Rejected')) or (w.status='Processing' and ns in('Approved','Completed','Rejected')) or (w.status='Approved' and ns in('Completed','Rejected'))) then raise exception 'Invalid status change'; end if;
 if ns='Rejected' then perform private.credit(w.uid,w.usd,'refund','Refund '||w.wid||' (rejected)',false); end if;
 update withdrawals set status=ns,upd=private.ts() where id=w.id; return '{"ok":1}'; end $$;
create or replace function api_a_sub_set(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare s task_subs; k tasks; ok boolean:=coalesce((p->>'ok')::boolean,false); begin perform private.adm();
 select * into s from task_subs where id=(p->>'id')::bigint and status='pending' for update; if not found then raise exception 'Not found'; end if;
 select * into k from tasks where id=s.tid; update task_subs set status=case when ok then 'approved' else 'rejected' end where id=s.id;
 if ok then perform private.credit(s.uid,k.reward,'task','Task: '||k.title); end if; return '{"ok":1}'; end $$;
create or replace function api_a_user(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare id uuid:=(p->>'id')::uuid; tmp text:='Tmp'||encode(extensions.gen_random_bytes(4),'hex')||'9'; begin perform private.adm();
 if p->>'do'='suspend' then if id=auth.uid() then raise exception 'Cannot suspend yourself'; end if; update profiles set suspended=not suspended where profiles.id=api_a_user.id; return '{"ok":1}'; end if;
 if p->>'do'='reset' then update auth.users set encrypted_password=extensions.crypt(tmp,extensions.gen_salt('bf')) where auth.users.id=api_a_user.id; return jsonb_build_object('tmp',tmp); end if;
 raise exception 'Bad request'; end $$;
create or replace function api_a_ad_save(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare t text:=left(trim(coalesce(p->>'title','')),80); r numeric:=round(coalesce(nullif(p->>'reward','')::numeric,-1),2); s int:=greatest(5,least(120,coalesce(nullif(p->>'secs','')::int,15))); begin perform private.adm();
 if t='' or r<0 or r>100 then raise exception 'Invalid ad'; end if;
 if nullif(p->>'id','') is not null then update ads set title=t,reward=r,secs=s,active=coalesce((p->>'active')::boolean,false) where id=(p->>'id')::bigint; else insert into ads(title,reward,secs) values(t,r,s); end if; return '{"ok":1}'; end $$;
create or replace function api_a_ad_del(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform private.adm(); delete from ads where id=(p->>'id')::bigint; return '{"ok":1}'; end $$;
create or replace function api_a_task_save(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare t text:=left(trim(coalesce(p->>'title','')),80); d text:=left(coalesce(p->>'descr',''),300); r numeric:=round(coalesce(nullif(p->>'reward','')::numeric,-1),2); begin perform private.adm();
 if t='' or r<0 or r>100 then raise exception 'Invalid task'; end if;
 if nullif(p->>'id','') is not null then update tasks set title=t,descr=d,reward=r,active=coalesce((p->>'active')::boolean,false) where id=(p->>'id')::bigint; else insert into tasks(title,descr,reward) values(t,d,r); end if; return '{"ok":1}'; end $$;
create or replace function api_a_task_del(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform private.adm(); delete from tasks where id=(p->>'id')::bigint; return '{"ok":1}'; end $$;
create or replace function api_a_settings(p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare rt numeric:=coalesce(nullif(p->>'rate','')::numeric,0); begin perform private.adm();
 if rt<=0 or rt>100000 then raise exception 'Invalid rate'; end if;
 if rt<>private.setv('rate')::numeric then insert into rates(rate,note,t) values(rt,left(coalesce(p->>'note',''),60),private.ts()); end if;
 insert into settings values('rate',rt::text),('min',greatest(1,coalesce(nullif(p->>'min','')::numeric,200))::text),('bonus',greatest(0,coalesce(nullif(p->>'bonus','')::numeric,0))::text),
  ('maxAds',greatest(1,coalesce(nullif(p->>'maxAds','')::int,20))::text),('cool',greatest(0,coalesce(nullif(p->>'cool','')::int,60))::text),
  ('demo',case when coalesce((p->>'demo')::boolean,false) then '1' else '0' end),('revenue',greatest(0,coalesce(nullif(p->>'revenue','')::numeric,0))::text)
 on conflict(k) do update set v=excluded.v; return '{"ok":1}'; end $$;

-- LOCK DOWN: only logged-in users may call api_*; only api_init/api_resolve are public
revoke all on all tables in schema public from anon, authenticated; revoke all on schema private from public, anon, authenticated;
do $$ declare f record; begin for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'api\_%' loop
 execute format('revoke all on function %s from public, anon, authenticated',f.sig);
 if f.proname in('api_init','api_resolve') then execute format('grant execute on function %s to anon, authenticated',f.sig); else execute format('grant execute on function %s to authenticated',f.sig); end if; end loop; end $$;

-- AFTER you register on the site, make yourself admin (change the username):
-- update profiles set is_admin=true where lower(username)=lower('YOUR_USERNAME');
