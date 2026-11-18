# 02: Criar conta e entrar

**What to build:** Um visitante pode registrar-se como usuário com 13 anos ou mais e entrar com e-mail/senha ou Google; as ações de membro exigem autenticação.

**Blocked by:** 01: Navegar o catálogo PT-BR.

**Status:** ready-for-agent

- [ ] O cadastro exige data de nascimento, impede cadastro declarado abaixo de 13 anos e registra aceite dos Termos de Uso.
- [ ] Os Termos explicam que usuários de 13 a 17 anos devem ter supervisão de responsáveis legais em negociações financeiras externas.
- [ ] Usuários conseguem entrar com e-mail/senha e Google.
- [ ] Novos usuários autenticados via Google passam por onboarding obrigatório para registrar data de nascimento (+13) e aceite dos Termos de Uso antes de ativar a conta.
- [ ] Visitantes continuam podendo navegar o catálogo e conteúdo público, mas ações de publicar, propor, comprar e interagir exigem sessão válida.
- [ ] Testes pela API cobrem cadastro, login e autorização usando dependências de identidade substituíveis no ambiente de teste.
