'use client';

import Link from 'next/link';
import { useAuth } from '@/features/auth/use-auth';
import { useChatIndicators } from '../hooks/use-chat-indicators';

export function NegotiationsNavLink() {
  const { user } = useAuth();
  const { indicators } = useChatIndicators(Boolean(user));

  if (!user) {
    return null;
  }

  const totalBadgeCount = indicators?.totalBadgeCount ?? 0;

  return (
    <Link className="topbar-nav-link topbar-nav-badge-link" href="/negociacoes">
      <span>Negociações</span>
      {totalBadgeCount > 0 && (
        <span
          className="nav-badge-count"
          aria-label={`${totalBadgeCount} notificações não lidas`}
        >
          {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
        </span>
      )}
    </Link>
  );
}
