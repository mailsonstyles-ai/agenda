-- 1. Permite que qualquer pessoa visualize os logos (Leitura)
CREATE POLICY "Logos são públicos" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'logos' );

-- 2. Permite que usuários autenticados façam upload de logos (Escrita)
CREATE POLICY "Usuários autenticados podem subir logos" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'logos' AND auth.role() = 'authenticated' );

-- 3. Permite que usuários autenticados atualizem logos (Atualização)
CREATE POLICY "Usuários autenticados podem editar logos" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'logos' AND auth.role() = 'authenticated' );
