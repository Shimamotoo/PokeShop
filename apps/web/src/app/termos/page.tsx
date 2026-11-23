import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="detail-shell">
      <header className="store-topbar">
        <div className="store-topbar-inner">
          <Link className="wordmark" href="/" aria-label="PokeShop, início">
            <span className="wordmark-mark" aria-hidden="true">P</span>
            <span>PokeShop</span>
          </Link>
          <div className="topbar-actions">
            <Link className="back-link" href="/cadastro">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Voltar ao cadastro</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="terms-stage">
        <article className="terms-card">
          <h1>Termos de Uso do PokeShop</h1>
          <p className="terms-updated">Versão vigente para o MVP da plataforma</p>

          <section className="terms-section">
            <h2>1. Elegibilidade e idade mínima (+13 anos)</h2>
            <p>
              O cadastro e a utilização de recursos de membro no PokeShop são permitidos
              exclusivamente para pessoas com 13 (treze) anos de idade ou mais. Menores de 13 anos
              são proibidos de criar conta, publicar anúncios ou participar de negociações na
              plataforma.
            </p>
          </section>

          <section className="terms-section">
            <h2>2. Supervisão obrigatória para usuários de 13 a 17 anos</h2>
            <p>
              Usuários com idade entre 13 e 17 anos devem obrigatoriamente contar com a supervisão
              e autorização de seus pais ou responsáveis legais para conduzir negociações
              financeiras externas, combinar pagamentos, informar dados de envio ou despachar
              exemplares físicos acordados por meio do chat da plataforma.
            </p>
          </section>

          <section className="terms-section">
            <h2>3. Funcionamento do marketplace e negociações externas</h2>
            <p>
              O PokeShop conecta colecionadores de Pokémon TCG em português do Brasil (PT-BR) por
              meio de anúncios de exemplares físicos por preço fixo ou propostas e disponibiliza
              chat privado entre comprador e vendedor. O PokeShop não atua como intermediador
              financeiro, não processa pagamentos internos nem realiza custódia de valores ou
              logística de frete.
            </p>
          </section>

          <section className="terms-section">
            <h2>4. Conduta, veracidade e moderação</h2>
            <p>
              Todo anúncio deve corresponder a um exemplar físico real com fotos autênticas e
              condição física fielmente declarada. O descumprimento grave destas regras, tentativas
              de fraude ou violação de conduta comunitária sujeitam a conta ao banimento definitivo
              imediato pela moderação.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
