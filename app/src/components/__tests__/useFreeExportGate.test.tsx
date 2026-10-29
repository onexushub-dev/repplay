import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { track } from '../../analytics';
import { useFreeExportGate } from '../useFreeExportGate';

jest.mock('../../analytics', () => ({ track: jest.fn() }));

let gate: ReturnType<typeof useFreeExportGate>;
function Harness() {
  gate = useFreeExportGate();
  return gate.sheet;
}

afterEach(() => jest.useRealTimers());

test('"Cancelar" resolves at once', async () => {
  await render(<Harness />);
  let choice: string | undefined;
  await act(async () => void gate.ask({ focus: false, speed: false, sound: true }).then((c) => (choice = c)));
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(choice).toBe('cancel');
});

test('"Liberar" waits for the sheet to close (or the fallback) before the paywall may open', async () => {
  jest.useFakeTimers();
  await render(<Harness />);
  let choice: string | undefined;
  await act(async () => void gate.ask({ focus: false, speed: false, sound: true }).then((c) => (choice = c)));
  await fireEvent.press(screen.getByRole('button', { name: 'Liberar tudo com o Pro' }));
  await act(async () => {});
  expect(choice).toBeUndefined();
  await act(async () => void jest.advanceTimersByTime(900));
  expect(choice).toBe('unlock');
});

test('opening the free-plan notice reports free_export_limit_hit', async () => {
  (track as jest.Mock).mockClear();
  await render(<Harness />);
  await act(async () => void gate.ask({ focus: true, speed: false, sound: false }));
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith('free_export_limit_hit');
});
