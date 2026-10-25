import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { setLocale } from '../../i18n';
import SessionSummary from '../session/[id]';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  // The stack under the summary: tests that open it from Minhas gravações keep /games in it.
  useNavigation: () => ({ getState: () => ({ routes: [{ name: 'setup' }, { name: 'games' }, { name: 'session/[id]' }] }) }),
  useLocalSearchParams: () => ({ id: 's1' }),
}));
jest.mock('../../components/useClipThumbnail', () => ({ useClipThumbnail: () => undefined }));
jest.mock('../../payments', () => ({
  payments: { subscribe: () => () => {}, version: () => 0, nextPlan: jest.fn(() => 'free'), showPaywall: jest.fn(), unlockOption: jest.fn(() => ({ kind: 'none' })) },
}));
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn() }));
jest.mock('../../data/mmkv', () => {
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    repo: {
      getSession: jest.fn(),
      listClips: jest.fn(),
      sessionStats: jest.fn(),
      renameSession: jest.fn(),
      deleteClip: jest.fn(),
      deleteSession: jest.fn(() => ['/a.mp4', '/b.mp4']),
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      version: () => version,
      __change: () => {
        version += 1;
        listeners.forEach((fn) => fn());
      },
    },
    removeFile: jest.fn(),
  };
});

const { repo } = jest.requireMock('../../data/mmkv');
const { router } = jest.requireMock('expo-router');
const { payments } = jest.requireMock('../../payments');
const { useSession } = jest.requireMock('../../session/SessionContext');

const clip = (id: string, source: string, createdAt: number) => ({
  id,
  sessionId: 's1',
  createdAt,
  source,
  path: `/${id}.mp4`,
  durationMs: 60000,
  trim: { startMs: 30000, endMs: 60000 },
});

beforeEach(() => {
  jest.clearAllMocks();
  useSession.mockReturnValue({ reset: jest.fn(), state: {} });
  repo.getSession.mockReturnValue({ id: 's1', sport: 'futevolei', startedAt: new Date(2026, 9, 17, 18, 40).getTime(), paid: true });
});

test('shows the game stats', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 4, bytes: 92_000_000, recordedMs: (2 * 60 + 14) * 60_000 });
  await render(<SessionSummary />);
  expect(screen.getByText('2h14')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.getByText('92 MB')).toBeTruthy();
  expect(screen.getByText(/Futevôlei ·/)).toBeTruthy();
});

test('tapping a clipe opens it', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1)]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: /Clipe 1/ }));
  expect(router.push).toHaveBeenCalledWith('/clip/a');
});

test('re-reads the clipes when one is deleted elsewhere', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  expect(screen.getByRole('button', { name: /Clipe 2/ })).toBeTruthy();

  repo.listClips.mockReturnValue([clip('a', 'gesture', 1)]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 1 });
  await act(async () => repo.__change());

  expect(screen.queryByRole('button', { name: /Clipe 2/ })).toBeNull();
});

test('a game with no clipes says so', async () => {
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 60_000 });
  await render(<SessionSummary />);
  expect(screen.getByText('Nenhum lance salvo')).toBeTruthy();
  expect(screen.getByText('Salve um lance durante a gravação e ele aparece aqui.')).toBeTruthy();
});

test('Nova gravação resets the session and goes back to setup', async () => {
  const reset = jest.fn();
  useSession.mockReturnValue({ reset, state: { sessionId: 's1' } });
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Nova gravação' }));
  expect(reset).toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith('/setup');
});

test('typing a name and submitting renames the game', async () => {
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  const input = screen.getByLabelText('Nome da gravação');
  await fireEvent.changeText(input, 'Final do torneio');
  await fireEvent(input, 'submitEditing');
  expect(repo.renameSession).toHaveBeenCalledWith('s1', 'Final do torneio');
});

test('a named game shows its name as the title', async () => {
  repo.getSession.mockReturnValue({ id: 's1', sport: 'futevolei', startedAt: 0, name: 'Final do torneio', paid: true });
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  expect(screen.getByRole('header')).toHaveTextContent('Final do torneio');
});

test('the footer has no "Postar um clipe": sharing happens inside the clip', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  expect(screen.queryByRole('button', { name: 'Postar um clipe' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Nova gravação' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Apagar gravação' })).toBeTruthy();
});

test('Nova gravação from a past game goes back to the existing setup without touching the current session', async () => {
  const reset = jest.fn();
  useSession.mockReturnValue({ reset, state: { sessionId: 'other' } });
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 0 });
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Nova gravação' }));
  expect(reset).not.toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith('/setup');
});

test('a named clip is identified by its name in the recording', async () => {
  repo.listClips.mockReturnValue([{ ...clip('a', 'gesture', 1), name: 'Ace no fundo' }, clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  expect(screen.getByText('Ace no fundo')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Clipe 1 · Ace no fundo/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Clipe 2,/ })).toBeTruthy();
});

describe('free recording', () => {
  const oldLockedClip = (id: string, createdAt: number) => ({ ...clip(id, 'screen', createdAt), locked: true });
  const setup = (tier: string) => {
    // The recording's own plan: 'pass' is an older session that holds a Pass and has no `paid` flag.
    const plan = tier === 'free' ? { paid: false } : tier === 'pass' ? { passTransactionId: 'tx-1' } : { paid: true };
    repo.getSession.mockReturnValue({ id: 's1', sport: 'futevolei', startedAt: 0, ...plan });
    repo.listClips.mockReturnValue([clip('a', 'gesture', 1), oldLockedClip('b', 2)]);
    repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  };

  test('the free plan shows the card, and tapping it opens the paywall', async () => {
    setup('free');
    await render(<SessionSummary />);
    expect(screen.getByText('Gravada no plano grátis')).toBeTruthy();
    expect(screen.getByText('Seus clipes saem com marca d’água, sem som, sem Modo Foco e sem velocidade. Libere tudo com o Pro ou um Passe Avulso.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Gravada no plano grátis/ }));
    expect(payments.showPaywall).toHaveBeenCalledWith();
  });

  test('with Pro active a recording made on the free plan has no card: Pro unlocks it', async () => {
    setup('free');
    payments.unlockOption.mockReturnValue({ kind: 'pro' });
    await render(<SessionSummary />);
    expect(screen.queryByText('Gravada no plano grátis')).toBeNull();
    payments.unlockOption.mockReturnValue({ kind: 'none' });
  });

  test.each(['pass', 'pro'])('on the %s plan there is no card', async (tier) => {
    setup(tier);
    await render(<SessionSummary />);
    expect(screen.queryByText('Gravada no plano grátis')).toBeNull();
    expect(screen.queryByText('Liberar')).toBeNull();
  });

  test.each(['free', 'pass', 'pro'])('on the %s plan any clipe opens, even an old one stored with locked: true', async (tier) => {
    setup(tier);
    await render(<SessionSummary />);
    await fireEvent.press(screen.getByRole('button', { name: /^Clipe 2,/ }));
    expect(router.push).toHaveBeenCalledWith('/clip/b');
    expect(payments.showPaywall).not.toHaveBeenCalled();
  });

  test('no clipe is labeled as blocked', async () => {
    setup('free');
    await render(<SessionSummary />);
    expect(screen.queryByText(/bloqueado/i)).toBeNull();
  });
});

function lastAlertButtons(alert: jest.SpyInstance) {
  return alert.mock.calls[alert.mock.calls.length - 1][2] as { text: string; onPress?: () => void }[];
}

test('Selecionar clipes: pick some, delete them after confirming', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2), clip('c', 'screen', 3)]);
  repo.sessionStats.mockReturnValue({ clips: 3, bytes: 1, recordedMs: 1 });
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Selecionar clipes' }));
  expect(screen.getByText('Toque nos clipes')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /^Clipe 1/ }));
  await fireEvent.press(screen.getByRole('button', { name: /^Clipe 3/ }));
  expect(screen.getByText('2 selecionados')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Apagar 2 clipes' }));
  expect(repo.deleteClip).not.toHaveBeenCalled();
  await act(async () => lastAlertButtons(alert).find((b) => b.text === 'Apagar')!.onPress!());
  expect(repo.deleteClip.mock.calls.map((c: string[]) => c[0])).toEqual(['a', 'c']);
  expect(jest.requireMock('../../data/mmkv').removeFile).toHaveBeenCalledWith('/a.mp4');
  expect(screen.queryByText('2 selecionados')).toBeNull();
  alert.mockRestore();
});

test('holding a clip starts the selection with it picked; Cancelar leaves it', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  await render(<SessionSummary />);
  await fireEvent(screen.getByRole('button', { name: /^Clipe 2/ }), 'longPress');
  expect(screen.getByText('1 selecionado')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar seleção' }));
  expect(screen.getByRole('button', { name: 'Selecionar clipes' })).toBeTruthy();
});

test('Apagar gravação removes the game and its clips after confirming, and goes to the list', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
  repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
  const reset = jest.fn();
  useSession.mockReturnValue({ reset, state: { sessionId: 's1' } });
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  await render(<SessionSummary />);
  await fireEvent.press(screen.getByRole('button', { name: 'Apagar gravação' }));
  expect(repo.deleteSession).not.toHaveBeenCalled();
  await act(async () => lastAlertButtons(alert).find((b) => b.text === 'Apagar')!.onPress!());
  expect(repo.deleteSession).toHaveBeenCalledWith('s1');
  expect(jest.requireMock('../../data/mmkv').removeFile).toHaveBeenCalledTimes(2);
  expect(reset).toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith('/games');
  alert.mockRestore();
});

test('deleting the last clip removes the game too and goes back to the list', async () => {
  repo.listClips.mockReturnValue([clip('a', 'gesture', 1)]);
  repo.sessionStats.mockReturnValue({ clips: 1, bytes: 1, recordedMs: 1 });
  const reset = jest.fn();
  useSession.mockReturnValue({ reset, state: { sessionId: 's1' } });
  await render(<SessionSummary />);
  expect(repo.deleteSession).not.toHaveBeenCalled();
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 1 });
  await act(async () => repo.__change());
  expect(repo.deleteSession).toHaveBeenCalledWith('s1');
  expect(reset).toHaveBeenCalled();
  expect(router.dismissTo).toHaveBeenCalledWith('/games');
});

test('a game recorded without any clip still opens as an empty summary', async () => {
  repo.listClips.mockReturnValue([]);
  repo.sessionStats.mockReturnValue({ clips: 0, bytes: 0, recordedMs: 1 });
  await render(<SessionSummary />);
  await act(async () => repo.__change());
  expect(repo.deleteSession).not.toHaveBeenCalled();
  expect(router.dismissTo).not.toHaveBeenCalled();
});

test('an English phone sees the selection and delete texts in English', async () => {
  setLocale('en');
  try {
    repo.listClips.mockReturnValue([clip('a', 'gesture', 1), clip('b', 'screen', 2)]);
    repo.sessionStats.mockReturnValue({ clips: 2, bytes: 1, recordedMs: 1 });
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    await render(<SessionSummary />);
    await fireEvent.press(screen.getByRole('button', { name: 'Select clips' }));
    await fireEvent.press(screen.getByRole('button', { name: /^Clip 1/ }));
    expect(screen.getByText('1 selected')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete 1 clip' }));
    expect(alert).toHaveBeenLastCalledWith('Delete 1 clip?', "This can't be undone.", expect.any(Array));
    alert.mockRestore();
  } finally {
    setLocale('pt-BR');
  }
});
