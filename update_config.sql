-- Adiciona as colunas de Nome do Site e Texto de Aviso na tabela de configurações
ALTER TABLE configuracoes 
ADD COLUMN IF NOT EXISTS nome_site TEXT DEFAULT 'Mailson Styles',
ADD COLUMN IF NOT EXISTS aviso_texto TEXT;

-- Garante que a linha de configuração exista
INSERT INTO configuracoes (id, nome_site) 
VALUES ('config', 'Mailson Styles') 
ON CONFLICT (id) DO UPDATE SET nome_site = EXCLUDED.nome_site;
