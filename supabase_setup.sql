-- RESET TOTAL COM CASCADE (Limpa tudo sem erros)
drop table if exists agendamentos cascade;
drop table if exists bloqueios cascade;
drop table if exists bloqueios_horarios cascade;
drop table if exists expediente cascade;
drop table if exists servicos cascade;
drop table if exists barbeiros cascade;
drop table if exists clientes cascade;
drop table if exists configuracoes cascade;

-- 1. Barbeiros
create table barbeiros (
  id uuid default gen_random_uuid() primary key,
  nome text not null
);

-- 2. Serviços
create table servicos (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  duracao_minutos integer not null default 30
);

-- 3. Expediente (Regras Semanais)
create table expediente (
  id uuid default gen_random_uuid() primary key,
  barbeiro_id uuid references barbeiros(id) on delete cascade,
  dia_semana integer not null, 
  inicio_1 text, 
  fim_1 text,    
  inicio_2 text, 
  fim_2 text,    
  is_aberto boolean default true,
  unique(barbeiro_id, dia_semana)
);

-- 4. Bloqueios de Datas
create table bloqueios (
  id uuid default gen_random_uuid() primary key,
  barbeiro_id uuid references barbeiros(id) on delete cascade,
  data date not null,
  unique(barbeiro_id, data)
);

-- 5. Bloqueios de Horas Individuais
create table bloqueios_horarios (
  id uuid default gen_random_uuid() primary key,
  barbeiro_id uuid references barbeiros(id) on delete cascade,
  data date not null,
  hora text not null,
  unique(barbeiro_id, data, hora)
);

-- 6. Agendamentos
create table agendamentos (
  id uuid default gen_random_uuid() primary key,
  cliente_nome text not null,
  cliente_whatsapp text not null,
  barbeiro_id uuid references barbeiros(id),
  servico_id uuid references servicos(id),
  servico_nome text,
  duracao_servico integer,
  data date not null,
  hora text not null,
  hora_fim text,
  status text default 'confirmado',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Clientes
create table clientes (
  id uuid default gen_random_uuid() primary key,
  whatsapp text unique not null,
  nome text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Configurações
create table configuracoes (
  id text primary key default 'config',
  whatsapp_central text default '5511999999999'
);

insert into configuracoes (id) values ('config') on conflict do nothing;

-- Habilitar RLS e Políticas
alter table barbeiros enable row level security;
alter table servicos enable row level security;
alter table expediente enable row level security;
alter table bloqueios enable row level security;
alter table bloqueios_horarios enable row level security;
alter table agendamentos enable row level security;
alter table clientes enable row level security;
alter table configuracoes enable row level security;

create policy "Acesso Público 1" on barbeiros for all using (true) with check (true);
create policy "Acesso Público 2" on servicos for all using (true) with check (true);
create policy "Acesso Público 3" on expediente for all using (true) with check (true);
create policy "Acesso Público 4" on bloqueios for all using (true) with check (true);
create policy "Acesso Público 5" on bloqueios_horarios for all using (true) with check (true);
create policy "Acesso Público 6" on agendamentos for all using (true) with check (true);
create policy "Acesso Público 7" on clientes for all using (true) with check (true);
create policy "Acesso Público 8" on configuracoes for all using (true) with check (true);

-- Dados Iniciais
insert into barbeiros (nome) values ('Mailson');
insert into servicos (nome, duracao_minutos) values ('Corte Cabelo', 30), ('Barba', 20), ('Pé de Cabelo', 10);
