import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PokeShop — Plataforma para Colecionadores de Pokémon TCG',
  description: 'Catálogo de cartas, marketplace seguro de exemplares físicos e rede social para colecionadores no Brasil.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
