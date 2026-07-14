-- 007 - Contact section cleanup and Instagram public config.

alter table public.australia_whv_monitor_config
  add column if not exists instagram_url text;

create or replace view public.australia_whv_public_config as
  select support_whatsapp_number,
         support_default_message,
         contact_text,
         about_body,
         landing_trust_text,
         instagram_url
  from public.australia_whv_monitor_config
  where singleton_key = 'main';

grant select on public.australia_whv_public_config to anon;

comment on column public.australia_whv_monitor_config.instagram_url is 'Public Instagram profile URL or handle shown in the landing contact section.';
