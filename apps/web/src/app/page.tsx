import { OrderStatus } from '@pokeshop/shared';
import { ShoppingBag, BookOpen, MessageSquare, ShieldCheck } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-3xl space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-pokemon-darkRed rounded-full text-sm font-semibold">
          <span>⚡ Em Desenvolvimento (MVP)</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
          Bem-vindo ao <span className="text-pokemon-red">PokeShop</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-600">
          A plataforma definitiva para colecionadores de Pokémon TCG no Brasil. Catálogo oficial PT-BR, negociação segura de exemplares físicos e comunidade.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left pt-6">
          <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 font-semibold text-slate-800 mb-1">
              <BookOpen className="w-5 h-5 text-pokemon-blue" />
              Catálogo PT-BR
            </div>
            <p className="text-sm text-slate-600">
              Sincronizado com TCGdex para consulta instantânea de raridades e coleções.
            </p>
          </div>

          <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 font-semibold text-slate-800 mb-1">
              <ShoppingBag className="w-5 h-5 text-pokemon-red" />
              Marketplace de Exemplares
            </div>
            <p className="text-sm text-slate-600">
              Anúncios de cartas reais únicas com máquina de estados rigorosa ({OrderStatus.DISPONIVEL} → {OrderStatus.VENDIDO}).
            </p>
          </div>

          <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 font-semibold text-slate-800 mb-1">
              <MessageSquare className="w-5 h-5 text-pokemon-gold" />
              Chat Direto Integrado
            </div>
            <p className="text-sm text-slate-600">
              Negocie frete e pagamento externo com privacidade e alertas de inatividade.
            </p>
          </div>

          <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-3 font-semibold text-slate-800 mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Privacidade S3 & Moderação
            </div>
            <p className="text-sm text-slate-600">
              Fotos protegidas por URLs temporárias pré-assinadas e fila de moderação manual.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
