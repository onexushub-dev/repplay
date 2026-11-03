import { describeLinkEvent } from '../remoteLinkDiag';

test('the diagnostic lines say it plainly, and that a comeback never counts as a press', () => {
  expect(describeLinkEvent({ kind: 'dropped', idleMs: 30_400 })).toBe('controle: conexão caiu (30.4 s após o último clique)');
  expect(describeLinkEvent({ kind: 'back', awayMs: 1200, idleAtDropMs: 30_400 })).toBe(
    'controle: conexão voltou após 1.2 s (não conta como clique)',
  );
  expect(describeLinkEvent({ kind: 'back', awayMs: undefined, idleAtDropMs: undefined })).toBe(
    'controle: conexão voltou (não conta como clique)',
  );
});
