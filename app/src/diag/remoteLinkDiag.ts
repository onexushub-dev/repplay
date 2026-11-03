// TEMP(diag-remote): the Bluetooth remote's link in the diagnostic log (Portuguese, like the Diagnóstico screen).
import type { LinkEvent } from '../triggers/linkMonitor';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function describeLinkEvent(e: LinkEvent): string {
  if (e.kind === 'dropped') return `controle: conexão caiu (${seconds(e.idleMs)} após o último clique)`;
  const away = e.awayMs === undefined ? '' : ` após ${seconds(e.awayMs)}`;
  return `controle: conexão voltou${away} (não conta como clique)`;
}
