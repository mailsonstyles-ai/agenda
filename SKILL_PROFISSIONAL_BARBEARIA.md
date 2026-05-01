# 💈 Skill Profissional: Mailson Styles (Barbearia) - Blueprint Técnico

Este documento é o guia mestre de arquitetura e implementação do sistema Mailson Styles. Ele foi projetado para que qualquer agente de IA ou desenvolvedor possa replicar, manter ou expandir o projeto com precisão cirúrgica, eliminando ambiguidades e erros comuns.

---

## 🛠️ 1. Arquitetura de Sistema e Stack

O sistema é construído como uma **SPA (Single Page Application)** focada em performance mobile (Mobile-First).

**Stack Tecnológica Detalhada:**
- **Frontend:** React 19 + Vite (HMR habilitado).
- **Roteamento:** `react-router-dom` v7.
- **Banco de Dados & Auth:** Supabase (PostgreSQL + GoTrue Auth).
- **Data Handling:** `date-fns` para cálculos precisos de fusos horários e intervalos de tempo.
- **Infraestrutura:** 
  - **Hospedagem:** Netlify (Frontend).
  - **Versionamento/CI:** GitHub.
  - **Automations:** GitHub Actions para manutenção de banco.

---

## 🧠 2. O "Coração" do Sistema: Motor de Agendamento

O cálculo de disponibilidade é a parte mais crítica. Ele ocorre em `Home.jsx` (cliente) e `Admin.jsx` (manual).

### ⚙️ Lógica de Geração de Slots (Algoritmo)
Para cada barbeiro, data e serviço selecionados, o sistema executa os seguintes passos:

1. **Validação de Bloqueio Total:** Consulta a tabela `bloqueios`. Se houver um registro para `barbeiro_id` + `data`, o dia é marcado como **Fechado**.
2. **Verificação de Expediente:** Consulta a tabela `expediente` filtrando por `barbeiro_id` + `dia_semana`.
   - Se `is_aberto` for `false`, o dia é **Fechado**.
   - O sistema suporta dois turnos (`inicio_1` → `fim_1` e `inicio_2` → `fim_2`).
3. **Definição do "Passo" (Step):** 
   - O sistema busca a **menor duração de serviço** cadastrada no banco.
   - Este valor define o intervalo de geração de slots (ex: se o menor serviço é 10min, os slots são gerados a cada 10min). Isso evita que o cliente "perca" vagas pequenas.
4. **Geração e Filtragem de Horários:**
   - O sistema percorre os turnos do expediente usando o `step`.
   - Para cada horário gerado (`horaStr`), ele calcula o `horaFimReq` (`horaStr` + `duracao_do_servico_escolhido`).
   - **Filtro de Conflito de Agendamento:** Verifica na tabela `agendamentos` se existe qualquer marcação onde `(horaStr < agendamento_fim AND horaFimReq > agendamento_inicio)`.
   - **Filtro de Bloqueio Manual:** Verifica na tabela `bloqueios_horarios` se aquele slot específico está bloqueado.
   - **Filtro de Tempo Real (Hoje):** Se a data selecionada for hoje, ignora qualquer slot onde `horaStr <= agora`.
5. **Resultado:** Apenas os slots que passaram em todos os filtros são exibidos.

---

## 🗄️ 3. Modelo de Dados (Banco de Dados)

O banco de dados é PostgreSQL. Todas as tabelas possuem **RLS (Row Level Security)** habilitado.

| Tabela | Propósito | Chaves/Constraints |
| :--- | :--- | :--- |
| `barbeiros` | Cadastro de profissionais | `id` (UUID), `nome` |
| `servicos` | Catálogo de serviços | `id` (UUID), `nome`, `duracao_minutos` |
| `expediente` | Regras de horário semanal | `unique(barbeiro_id, dia_semana)` |
| `bloqueios` | Folgas/Feriados (dia todo) | `unique(barbeiro_id, data)` |
| `bloqueios_horarios`| Pausas curtas (almoço/reunião) | `unique(barbeiro_id, data, hora)` |
| `agendamentos` | Registro de marcações | `barbeiro_id` e `servico_id` (FKs) |
| `clientes` | Base de contatos (CRM) | `whatsapp` (Unique) |
| `configuracoes` | Ajustes globais do sistema | `id = 'config'` (Registro único) |
| `lista_espera` | Clientes aguardando desistência | `barbeiro_id`, `data`, `cliente_whatsapp` |

---

## 🎨 4. Identidade Visual e Layout (Design System)

O layout é rigorosamente **Mobile-First** (`max-width: 480px`).

**Paleta de Cores (CSS Variables):**
- **Primary (Gold):** `#d4af37` (Usado para destaques, botões principais e logos).
- **Background Dark:** `#0f172a` (Cor de fundo profunda).
- **Background Card:** `#1e293b` (Contraste para elementos de conteúdo).
- **Text:** `#f8fafc` (Main) e `#94a3b8` (Muted).
- **Danger:** `#ef4444` (Alertas e exclusões).
- **Success:** `#22c55e` (Confirmações e WhatsApp).

**Princípios de UI:**
- **Animações:** Uso de `animate-fade-in` (translateY + opacity) para transições suaves entre passos.
- **Componentização:** Uso de Cards com bordas sutis (`rgba(255,255,255,0.05)`) e sombras suaves.
- **Interatividade:** Feedback visual imediato via `:active { transform: scale(0.98) }` em todos os botões.
- **Logo:** Dimensões ideais 350px largura x 150px altura, maxHeight 150px no site.

**Fluxo do Cliente:**
1. **Step 1 - WhatsApp:** Input do número, busca cliente existente.
2. **Step 2 - Nome:** Confirmação ou cadastro.
3. **Step 3 - Serviço:** Lista de serviços com duração.
4. **Step 4 - Barbeiro:** Seleção do profissional.
5. **Step 5 - Agenda:** Card destacado do barbeiro selecionado + botão "Trocar" + escolha de data/hora.
6. **Step 6 - Sucesso:** Confirmação + redirect WhatsApp.

---

## 🛡️ 5. Segurança e Gestão de Segredos (Secret Management)

Para garantir a integridade dos dados e evitar invasões, o projeto segue este protocolo rigoroso de segurança:

1. **Isolamento de Chaves (Ambiente):**
   - **NUNCA** enviar o arquivo `.env` para o GitHub. Ele deve estar obrigatoriamente listado no `.gitignore`.
   - O arquivo `.env` serve apenas para desenvolvimento local.
2. **Injeção de Segredos via Hosting:**
   - Em produção (Netlify), as chaves `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` devem ser configuradas exclusivamente no painel **Site configuration → Environment variables**.
   - Isso garante que as chaves fiquem em um cofre seguro e não fiquem expostas no código-fonte.
3. **Risco de Exposição:**
   - Caso as chaves sejam commitadas acidentalmente no GitHub, o procedimento obrigatório é:
     1. Adicionar `.env` ao `.gitignore`.
     2. Executar `git rm --cached .env` para remover do histórico.
     3. **Rotacionar (gerar novas) chaves** no painel do Supabase, pois as chaves antigas devem ser consideradas comprometidas.
4. **Políticas de Banco (RLS):**
   - O uso de Row Level Security (RLS) no Supabase é a última linha de defesa, controlando quem pode ler/escrever nos dados mesmo que a `ANON_KEY` seja conhecida.

---

## ⚠️ 6. Prevenção de Erros e Regras de Negócio (Safeguards)

Para evitar a corrupção de dados ou erros de usuário, as seguintes travas foram implementadas:

1. **Proteção de Integridade Referencial:**
   - O Admin não pode deletar um Barbeiro ou Serviço se houver **agendamentos futuros** vinculados a eles. O sistema lista os clientes afetados e bloqueia a ação.
2. **Upsert de Clientes:**
   - Sempre que um agendamento é feito, o sistema usa `upsert` na tabela `clientes` baseado no WhatsApp. Isso garante que o nome do cliente seja atualizado sem criar duplicatas.
3. **Redirecionamento SPA (Netlify):**
   - O arquivo `public/_redirects` com `/* /index.html 200` é obrigatório. Sem isso, rotas como `/admin` ou `/login` retornam 404 ao atualizar a página.
4. **Keep-Alive do Supabase:**
   - O banco do plano gratuito do Supabase pausa após inatividade. A solução é o Workflow do GitHub Actions que faz um `GET` na API de `/rest/v1/` a cada 48 horas.
5. **Carregamento Inicial:**
   - O site mostra "Carregando..." enquanto busca dados do banco, evitando flickering do nome padrão.
6. **Lista de Espera:**
   - Quando não há vagas, o cliente pode solicitar inclusão na lista de espera para desistências.

---

## 🚀 7. Guia de Implementação para Agentes de IA

Se você for replicar este projeto, siga esta ordem exata:

1. **Setup Banco:** Executar o `supabase_setup.sql` no editor SQL do Supabase → Habilitar RLS → Criar políticas de acesso público.
2. **Variáveis de Ambiente e Segurança:** 
   - Criar arquivo `.env` localmente com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
   - **CRÍTICO:** Garantir que o `.env` esteja no `.gitignore` antes do primeiro commit para evitar a exposição de credenciais no GitHub.
3. **Estrutura de Pastas:** 
   - `src/lib/supabaseClient.js` (Instância única do cliente).
   - `src/pages/` (Home, Admin, Login).
4. **CSS Global:** Aplicar `src/index.css` para garantir a consistência visual.
5. **Deploy:** 
   - Conectar GitHub ao Netlify.
   - Configurar as variáveis de ambiente no painel do Netlify.
   - Adicionar o arquivo `_redirects` na pasta `public`.
6. **Automação:** Configurar o Secret `SUPABASE_URL` e `SUPABASE_ANON_KEY` no GitHub Repository Secrets para o Workflow de Keep-Alive.

**Cuidados Importantes:**
- Não usar valor padrão "Mailson Styles" em states ou títulos - usar string vazia e só exibir após carregar do banco.
- Em `useEffect`, sempre chamar `fetchData()` ao montar o componente para carregar dados.
- Ao adicionar funções como `handleSaveConfig`, definir antes do JSX para evitar erros silenciosos.
- Verificar build com `npm run build` após qualquer modificação significativa.

**Nome da Skill:** Skill Profissional barbearia  
**Versão:** 1.2 (Blueprint Técnico)  
**Status:** Produção / Referência de IA