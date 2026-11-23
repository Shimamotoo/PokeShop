# 02: Criar conta e entrar

**What to build:** Um visitante pode registrar-se como usuário com 13 anos ou mais e entrar com e-mail/senha ou Google; as ações de membro exigem autenticação.

**Blocked by:** 01: Navegar o catálogo PT-BR.

**Status:** resolved

- [x] O cadastro exige data de nascimento, impede cadastro declarado abaixo de 13 anos e registra aceite dos Termos de Uso.
- [x] Os Termos explicam que usuários de 13 a 17 anos devem ter supervisão de responsáveis legais em negociações financeiras externas.
- [x] Usuários conseguem entrar com e-mail/senha e Google.
- [x] Novos usuários autenticados via Google passam por onboarding obrigatório para registrar data de nascimento (+13) e aceite dos Termos de Uso antes de ativar a conta.
- [x] Visitantes continuam podendo navegar o catálogo e conteúdo público, mas ações de publicar, propor, comprar e interagir exigem sessão válida.
- [x] Testes pela API cobrem cadastro, login e autorização usando dependências de identidade substituíveis no ambiente de teste.
