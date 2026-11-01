import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DONE_MS, GestureSheet, RAISED_HOLD_MS } from '../GestureSheet';

jest.mock('../../../modules/replay-camera', () => {
  const listeners: Record<string, ((e: unknown) => void) | undefined> = {};
  return {
    __listeners: listeners,
    setGestureEnabled: jest.fn(),
    signalSaved: jest.fn(),
    addReplayListener: jest.fn((event: string, fn: (e: unknown) => void) => {
      listeners[event] = fn;
      return {
        remove: () => {
          if (listeners[event] === fn) listeners[event] = undefined;
        },
      };
    }),
  };
});

const cam = jest.requireMock('../../../modules/replay-camera');
const emit = (event: string, body: unknown) =>
  act(async () => {
    const fn = cam.__listeners[event];
    if (fn) fn(body);
  });
const status = () => screen.getByTestId('gesture-practice-status');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test('open, the camera looks for the gesture; closed, it stops and nothing is heard', async () => {
  const { rerender } = await render(<GestureSheet visible onClose={jest.fn()} />);
  expect(cam.setGestureEnabled).toHaveBeenLastCalledWith(true);
  expect(screen.getByText('Acene com os dois braços acima da cabeça, de um lado para o outro.')).toBeTruthy();
  await rerender(<GestureSheet visible={false} onClose={jest.fn()} />);
  expect(cam.setGestureEnabled).toHaveBeenLastCalledWith(false);
  expect(cam.__listeners.onTrigger).toBeUndefined();
});

test('arms up asks for the wave, and goes back once they come down', async () => {
  await render(<GestureSheet visible onClose={jest.fn()} />);
  expect(status()).toHaveTextContent(/Afaste-se alguns passos/);
  await emit('onGestureDebug', { people: 1, isX: false, raised: true, orientation: 0 });
  expect(status()).toHaveTextContent('Braços levantados: agora acene');
  await act(async () => void jest.advanceTimersByTime(RAISED_HOLD_MS + 10));
  expect(status()).toHaveTextContent(/Afaste-se alguns passos/);
});

test('the gesture recognized says so with the save chime, then the practice starts over', async () => {
  await render(<GestureSheet visible onClose={jest.fn()} />);
  await emit('onTrigger', { source: 'gesture', at: 1 });
  expect(status()).toHaveTextContent('Gesto reconhecido');
  expect(cam.signalSaved).toHaveBeenCalledWith({ sound: true, flash: false });
  await emit('onGestureDebug', { people: 1, isX: true, orientation: 0 }); // arms still up right after: stays recognized
  expect(status()).toHaveTextContent('Gesto reconhecido');
  await act(async () => void jest.advanceTimersByTime(DONE_MS + 10));
  expect(status()).toHaveTextContent(/Afaste-se alguns passos/);
});

test('other triggers are not the gesture', async () => {
  await render(<GestureSheet visible onClose={jest.fn()} />);
  await emit('onTrigger', { source: 'voice', at: 1 });
  expect(status()).toHaveTextContent(/Afaste-se alguns passos/);
  expect(cam.signalSaved).not.toHaveBeenCalled();
});

test('Fechar closes', async () => {
  const onClose = jest.fn();
  await render(<GestureSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
  expect(onClose).toHaveBeenCalled();
});
