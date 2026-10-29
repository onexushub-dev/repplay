import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { track } from '../../analytics';
import Pair from '../pair';

jest.mock('../../../modules/replay-camera', () => ({
  remoteControllerStart: jest.fn(),
  remoteControllerStop: jest.fn(),
  remoteControllerPairWithLink: jest.fn(),
  addReplayListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('../../analytics', () => ({ track: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(),
}));

const camera = () => jest.requireMock('../../../modules/replay-camera');
const router = () => jest.requireMock('expo-router').router;
const params = (p: Record<string, string>) => jest.requireMock('expo-router').useLocalSearchParams.mockReturnValue(p);
const GOOD = { h: 'h1', s: 'AAECAwQFBgcICQoLDA0ODw', n: 'Quadra 1' };

function emit(payload: unknown) {
  const calls = camera().addReplayListener.mock.calls.filter((c: any[]) => c[0] === 'onRemotePairing');
  return act(async () => {
    calls.forEach((c: any[]) => c[1](payload));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  params(GOOD);
});

afterEach(() => jest.useRealTimers());

test('opening the link starts pairing with the camera phone it names', async () => {
  await render(<Pair />);
  expect(screen.getByText('Conectando a Quadra 1…')).toBeTruthy();
  expect(camera().remoteControllerStart).toHaveBeenCalledTimes(1);
  expect(camera().remoteControllerPairWithLink).toHaveBeenCalledWith('h1', 'AAECAwQFBgcICQoLDA0ODw', 'Quadra 1');
});

test('on success it says so and goes to the remote', async () => {
  await render(<Pair />);
  await emit({ phase: 'paired', peer: { id: 'h1', name: 'Quadra 1' } });
  expect(screen.getByText('Pronto! Este celular agora controla Quadra 1')).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
  expect(router().replace).toHaveBeenCalledWith('/remote');
  expect(camera().remoteControllerStop).not.toHaveBeenCalled();
});

test('each failure says what happened', async () => {
  await render(<Pair />);
  await emit({ phase: 'failed', reason: 'expired' });
  expect(screen.getByText('Código vencido. Peça um novo no celular da câmera.')).toBeTruthy();
  await emit({ phase: 'failed', reason: 'locked' });
  expect(screen.getByText('Muitas tentativas. Gere um novo código.')).toBeTruthy();
  await emit({ phase: 'failed', reason: 'notFound' });
  expect(
    screen.getByText('Não encontrei o celular da câmera. Chegue mais perto e confira se o Repplay está aberto lá.'),
  ).toBeTruthy();
  await emit({ phase: 'failed', reason: 'denied' });
  expect(screen.getByText('Este celular não está mais pareado com a câmera. Pareie de novo.')).toBeTruthy();
});

test('a broken link does not try to pair', async () => {
  params({ h: 'h1', s: 'curto' });
  await render(<Pair />);
  expect(screen.getByText('Este link de pareamento não é válido. Peça um novo código no celular da câmera.')).toBeTruthy();
  expect(camera().remoteControllerPairWithLink).not.toHaveBeenCalled();
});

test('leaving without pairing lets the search go', async () => {
  const view = await render(<Pair />);
  await view.unmount();
  expect(camera().remoteControllerStop).toHaveBeenCalledTimes(1);
});

test('says this iPhone is the remote, so the two phones are not mixed up', async () => {
  await render(<Pair />);
  expect(screen.getByText('ESTE IPHONE É O CONTROLE')).toBeTruthy();
});

test('a camera phone that does not answer ends in "not found" instead of spinning forever', async () => {
  await render(<Pair />);
  await act(async () => {
    jest.advanceTimersByTime(15_000);
  });
  expect(
    screen.getByText('Não encontrei o celular da câmera. Chegue mais perto e confira se o Repplay está aberto lá.'),
  ).toBeTruthy();
});

test('not found: one tap tries the same link again and goes back to connecting', async () => {
  await render(<Pair />);
  await emit({ phase: 'failed', reason: 'notFound' });
  await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(camera().remoteControllerPairWithLink).toHaveBeenCalledTimes(2);
  expect(camera().remoteControllerPairWithLink).toHaveBeenLastCalledWith('h1', 'AAECAwQFBgcICQoLDA0ODw', 'Quadra 1');
  expect(screen.getByText('Conectando a Quadra 1…')).toBeTruthy();
});

test('an expired or locked code sends the player to type a new one', async () => {
  await render(<Pair />);
  await emit({ phase: 'failed', reason: 'expired' });
  expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Digitar código' }));
  expect(router().replace).toHaveBeenCalledWith('/remote');
});

test('a camera phone that no longer knows this remote offers to pair again', async () => {
  await render(<Pair />);
  await emit({ phase: 'failed', reason: 'denied' });
  await fireEvent.press(screen.getByRole('button', { name: 'Digitar código' }));
  expect(router().replace).toHaveBeenCalledWith('/remote');
});

test('a broken link offers to type the code instead', async () => {
  params({ h: 'h1', s: 'curto' });
  await render(<Pair />);
  await fireEvent.press(screen.getByRole('button', { name: 'Digitar código' }));
  expect(router().replace).toHaveBeenCalledWith('/remote');
});

test('Fechar leaves even when the QR code opened the app straight on this screen', async () => {
  router().canGoBack.mockReturnValueOnce(false);
  await render(<Pair />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
  expect(router().back).not.toHaveBeenCalled();
  expect(router().replace).toHaveBeenCalledWith('/');
});

describe('analytics', () => {
  test('a pairing that succeeds reports the QR method once', async () => {
    await render(<Pair />);
    await emit({ phase: 'paired', peer: { id: 'h1', name: 'Quadra 1' } });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('pairing_completed', { method: 'qr', kind: 'remote' });
  });

  test('a failure reports its reason, never the camera phone name', async () => {
    await render(<Pair />);
    await emit({ phase: 'failed', reason: 'expired' });
    expect(track).toHaveBeenCalledWith('pairing_failed', { reason: 'expired' });
  });

  test('no answer for 15 s reports notFound', async () => {
    await render(<Pair />);
    await act(async () => {
      jest.advanceTimersByTime(16_000);
    });
    expect(track).toHaveBeenCalledWith('pairing_failed', { reason: 'notFound' });
  });

  test('a link that is not a pairing link reports invalid_link once', async () => {
    params({});
    await render(<Pair />);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('pairing_failed', { reason: 'invalid_link' });
  });
});
