import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RecordingPanel as Recording } from '../RecordingPanel';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('../../data/mmkv', () => ({
  repo: {
    listClips: jest.fn(() => [{ id: 'c1' }]),
    deleteSession: jest.fn(() => []),
    getPrefs: jest.fn(() => ({ screenEconomy: true })),
  },
  removeFile: jest.fn(),
}));
jest.mock('../../../modules/replay-camera', () => ({
  addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
  setScreenEconomy: jest.fn(),
}));
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn() }));

const { useSession } = jest.requireMock('../../session/SessionContext');
const { router } = jest.requireMock('expo-router');
const { repo } = jest.requireMock('../../data/mmkv');
const { setScreenEconomy } = jest.requireMock('../../../modules/replay-camera');

function session(state: object) {
  const value = {
    state: {
      phase: 'recording',
      sessionId: 's1',
      startedAt: Date.now(),
      clipCount: 0,
      saving: false,
      paused: false,
      thermal: { level: 'nominal', degraded: false },
      ...state,
    },
    trigger: jest.fn(),
    undoLast: jest.fn(),
    stop: jest.fn(async () => 's1'),
    reset: jest.fn(),
  };
  useSession.mockReturnValue(value);
  return value;
}

beforeEach(() => jest.clearAllMocks());

test('the count is shown in a small pill, not over the preview', async () => {
  session({ clipCount: 3 });
  await render(<Recording />);
  expect(screen.getByText('3 clipes')).toBeTruthy();
});

test('tells the player clearly how to save', async () => {
  session({});
  await render(<Recording />);
  expect(screen.getByText('Toque na tela para salvar o clipe')).toBeTruthy();
});

test('tapping the screen saves a clipe', async () => {
  const s = session({});
  await render(<Recording />);
  await fireEvent.press(screen.getByRole('button', { name: /Toque em qualquer lugar/ }));
  expect(s.trigger).toHaveBeenCalledWith('screen');
});

test('a saved clipe shows the overlay with its number and source', async () => {
  session({ clipCount: 3, lastSaved: { clipId: 'c3', number: 3, source: 'gesture', at: Date.now(), cutMs: 30000 } });
  await render(<Recording />);
  expect(screen.getByText('CLIPE #3 SALVO')).toBeTruthy();
  expect(screen.getByText('via Acenar com os braços · 30s')).toBeTruthy();
});

test('Desfazer undoes the last clipe', async () => {
  const s = session({ clipCount: 1, lastSaved: { clipId: 'c1', number: 1, source: 'screen', at: Date.now(), cutMs: 30000 } });
  await render(<Recording />);
  await fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }));
  expect(s.undoLast).toHaveBeenCalled();
});

test('holding the footer ends the game and opens its summary', async () => {
  const s = session({});
  await render(<Recording />);
  jest.useFakeTimers();
  await fireEvent(screen.getByRole('button', { name: 'Segure para encerrar a gravação' }), 'pressIn');
  await act(async () => jest.advanceTimersByTime(1000));
  jest.useRealTimers();
  expect(s.stop).toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith('/session/s1');
});

test('a hot phone shows the heat banner', async () => {
  session({ thermal: { level: 'serious', degraded: true } });
  await render(<Recording />);
  expect(screen.getByText(/Passamos para 720p\/30/)).toBeTruthy();
});

test('the heat banner says which step was taken: Full HD at 30 fps first', async () => {
  session({ thermal: { level: 'serious', degraded: true, quality: '1080p30' } });
  await render(<Recording />);
  expect(screen.getByText(/Passamos para 1080p\/30/)).toBeTruthy();
});

test('then 720p at 30 fps', async () => {
  session({ thermal: { level: 'serious', degraded: true, quality: '720p30' } });
  await render(<Recording />);
  expect(screen.getByText(/Passamos para 720p\/30/)).toBeTruthy();
});

test('an interrupted game shows the paused banner', async () => {
  session({ paused: true });
  await render(<Recording />);
  expect(screen.getByText('Gravação pausada. Volte para o app para continuar.')).toBeTruthy();
});

test('a native error says recording stopped and offers the saved clipes', async () => {
  session({ phase: 'ended', error: 'ENCODER_FAILED', thermalStop: true });
  await render(<Recording />);
  expect(screen.getByText('A gravação parou: celular muito quente')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver clipes' }));
  expect(router.push).toHaveBeenCalledWith('/session/s1');
});

test('a clipe saved by voice says so', async () => {
  session({ clipCount: 1, lastSaved: { clipId: 'c1', number: 1, source: 'voice', at: Date.now(), cutMs: 30000 } });
  await render(<Recording />);
  expect(screen.getByText('via Voz · 30s')).toBeTruthy();
});

test('the saved popup tells the length the clip really has, not the length asked for', async () => {
  session({ clipCount: 2, lastSaved: { clipId: 'c2', number: 2, source: 'screen', at: Date.now(), cutMs: 7000 } });
  await render(<Recording clipSeconds={30} />);
  expect(screen.getByText('via Tela · 7s')).toBeTruthy();
  expect(screen.queryByText(/60s guardados/)).toBeNull();
});

test('the hint lists the triggers that are on and the clip length', async () => {
  session({});
  await render(<Recording clipSeconds={45} gesture={false} voice />);
  expect(screen.getByText('Últimos 45s prontos · ou diga “salvar” · ou use o controle')).toBeTruthy();
});

test('the arms-up hint shows when the gesture is on', async () => {
  session({});
  await render(<Recording clipSeconds={30} gesture voice={false} />);
  expect(screen.getByText('Últimos 30s prontos · ou acene com os braços · ou use o controle')).toBeTruthy();
});

test('a remote phone asking to end the recording ends it like the hold button does', async () => {
  const s = session({});
  await render(<Recording />);
  const calls = jest.requireMock('../../../modules/replay-camera').addReplayListener.mock.calls;
  const ask = calls.filter((c: any[]) => c[0] === 'onRemoteStop').pop()[1];
  await act(async () => ask());
  expect(s.stop).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith('/session/s1');
});

test('a stop asked outside a recording is ignored', async () => {
  const s = session({ phase: 'idle' });
  await render(<Recording />);
  const calls = jest.requireMock('../../../modules/replay-camera').addReplayListener.mock.calls;
  const ask = calls.filter((c: any[]) => c[0] === 'onRemoteStop').pop()[1];
  await act(async () => ask());
  expect(s.stop).not.toHaveBeenCalled();
});

test('after saving, no payments note shows', async () => {
  session({ clipCount: 10, lastSaved: { clipId: 'c10', number: 10, source: 'screen', at: Date.now() } });
  await render(<Recording />);
  expect(screen.queryByText(/Último clipe grátis/)).toBeNull();
  expect(screen.queryByText(/Guardado. Libere/)).toBeNull();
});

describe('a recording without any clip', () => {
  test('ending it removes it and opens Minhas gravações', async () => {
    repo.listClips.mockReturnValue([]);
    const s = session({});
    await render(<Recording />);
    jest.useFakeTimers();
    await fireEvent(screen.getByRole('button', { name: 'Segure para encerrar a gravação' }), 'pressIn');
    await act(async () => jest.advanceTimersByTime(1000));
    jest.useRealTimers();
    await act(async () => {});
    expect(repo.deleteSession).toHaveBeenCalledWith('s1');
    expect(s.reset).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/games');
    expect(router.push).not.toHaveBeenCalledWith('/session/s1');
    repo.listClips.mockReturnValue([{ id: 'c1' }]);
  });

  test('stopped by an error, it offers Minhas gravações instead of an empty summary', async () => {
    repo.listClips.mockReturnValue([]);
    const s = session({ phase: 'ended', error: 'ENCODER_FAILED', clipCount: 0 });
    await render(<Recording />);
    await fireEvent.press(screen.getByRole('button', { name: 'Minhas gravações' }));
    expect(repo.deleteSession).toHaveBeenCalledWith('s1');
    expect(s.reset).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/games');
    repo.listClips.mockReturnValue([{ id: 'c1' }]);
  });
});

describe('screen economy', () => {
  test('after 20 s without a touch the screen goes dark and says a tap wakes it', async () => {
    session({});
    jest.useFakeTimers();
    await render(<Recording />);
    expect(screen.queryByTestId('screen-economy')).toBeNull();
    await act(async () => jest.advanceTimersByTime(20_000));
    expect(screen.getByTestId('screen-economy')).toBeTruthy();
    expect(screen.getByText('Tela em economia para não esquentar. Toque para acender a tela.')).toBeTruthy();
    expect(screen.queryByText('Toque na tela para salvar o clipe')).toBeNull();
    expect(setScreenEconomy).toHaveBeenLastCalledWith(true);
    jest.useRealTimers();
  });

  test('a recording that starts with battery saving on says so for a few seconds', async () => {
    session({});
    jest.useFakeTimers();
    await render(<Recording />);
    expect(screen.getByTestId('economy-notice')).toBeTruthy();
    expect(screen.getByText('Economia de bateria ligada')).toBeTruthy();
    expect(screen.getByText('A tela escurece depois de 20 segundos sem toque. Toque para acender.')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(screen.queryByTestId('economy-notice')).toBeNull();
    jest.useRealTimers();
  });

  test('with battery saving off there is no notice', async () => {
    session({});
    repo.getPrefs.mockReturnValue({ screenEconomy: false });
    await render(<Recording />);
    expect(screen.queryByTestId('economy-notice')).toBeNull();
    repo.getPrefs.mockReturnValue({ screenEconomy: true });
  });

  test('with Economia de bateria off on the setup screen the screen never goes dark', async () => {
    session({});
    repo.getPrefs.mockReturnValue({ screenEconomy: false });
    jest.useFakeTimers();
    await render(<Recording />);
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(screen.queryByTestId('screen-economy')).toBeNull();
    expect(setScreenEconomy).not.toHaveBeenCalledWith(true);
    jest.useRealTimers();
    repo.getPrefs.mockReturnValue({ screenEconomy: true });
  });

  test('the first tap while dark only wakes the screen: no clip is saved', async () => {
    const s = session({});
    jest.useFakeTimers();
    await render(<Recording />);
    await act(async () => jest.advanceTimersByTime(20_000));
    const surface = screen.getByRole('button', { name: /Toque em qualquer lugar/ });
    await fireEvent(surface, 'touchStart');
    await fireEvent.press(surface);
    expect(s.trigger).not.toHaveBeenCalled();
    expect(screen.queryByTestId('screen-economy')).toBeNull();
    expect(setScreenEconomy).toHaveBeenLastCalledWith(false);
    jest.useRealTimers();
  });

  test('once awake, the next tap saves as usual', async () => {
    const s = session({});
    jest.useFakeTimers();
    await render(<Recording />);
    await act(async () => jest.advanceTimersByTime(20_000));
    const surface = screen.getByRole('button', { name: /Toque em qualquer lugar/ });
    await fireEvent(surface, 'touchStart');
    await fireEvent.press(surface);
    await fireEvent(surface, 'touchStart');
    await fireEvent.press(surface);
    expect(s.trigger).toHaveBeenCalledTimes(1);
    expect(s.trigger).toHaveBeenCalledWith('screen');
    jest.useRealTimers();
  });

  test('ending the game is still possible while dark', async () => {
    session({});
    jest.useFakeTimers();
    await render(<Recording />);
    await act(async () => jest.advanceTimersByTime(20_000));
    expect(screen.getByRole('button', { name: 'Segure para encerrar a gravação' })).toBeTruthy();
    jest.useRealTimers();
  });
});

describe('heat tip', () => {
  const tip = 'Celular esquentando: tire a capinha e evite carregar durante a gravação.';

  test('shows once when the phone gets warm, then goes away by itself', async () => {
    session({ thermal: { level: 'fair', degraded: false } });
    jest.useFakeTimers();
    await render(<Recording />);
    expect(screen.getByText(tip)).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(8000));
    expect(screen.queryByText(tip)).toBeNull();
    jest.useRealTimers();
  });

  test('does not come back in the same recording', async () => {
    session({ thermal: { level: 'fair', degraded: false } });
    jest.useFakeTimers();
    const view = await render(<Recording />);
    await act(async () => jest.advanceTimersByTime(8000));
    session({ thermal: { level: 'nominal', degraded: false } });
    await view.rerender(<Recording />);
    session({ thermal: { level: 'fair', degraded: false } });
    await view.rerender(<Recording />);
    expect(screen.queryByText(tip)).toBeNull();
    jest.useRealTimers();
  });

  test('not shown while cool, nor next to the step-down banner', async () => {
    session({});
    const view = await render(<Recording />);
    expect(screen.queryByText(tip)).toBeNull();
    session({ thermal: { level: 'serious', degraded: true, quality: '1080p30' } });
    await view.rerender(<Recording />);
    expect(screen.queryByText(tip)).toBeNull();
  });
});
