import { act, fireEvent, render, screen } from '@testing-library/react-native';

import Devices from '../devices';
import { resetRemoteLinkForTests } from '../../devices/bluetoothRemote';
import { clearRemotePress, isRemoteSheetOpen, markRemotePress } from '../../devices/remoteTest';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
// What iOS shows connected over Bluetooth; nothing known by default (a classic remote, or none learnt).
jest.mock('../../../modules/replay-camera', () => ({ bluetoothConnected: jest.fn(async () => undefined) }));
// The camera under the sheet: on unless a test opens the app fresh.
jest.mock('../../session/SessionContext', () => ({ useSession: jest.fn(() => ({ state: { camera: 'on' } })) }));
jest.mock('../../data/mmkv', () => {
  let prefs: any = {};
  return {
    __reset: () => (prefs = {}),
    repo: {
      getPrefs: () => prefs,
      setPrefs: jest.fn((p: object) => (prefs = { ...prefs, ...p })),
    },
  };
});

const { repo } = jest.requireMock('../../data/mmkv');
const { router } = jest.requireMock('expo-router');

// The setup screen under the sheet is the one listening; a press it hears reaches the sheet through remoteTest.
const press = async () => {
  await act(async () => {
    if (!repo.getPrefs().remoteTestedAt) repo.setPrefs({ remoteTestedAt: Date.now() });
    markRemotePress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  resetRemoteLinkForTests();
  jest.useFakeTimers();
  jest.requireMock('../../data/mmkv').__reset();
  clearRemotePress();
});

afterEach(() => jest.useRealTimers());

test('first time: tells how to pair the remote, step by step, and tells the setup screen to keep listening', async () => {
  await render(<Devices />);
  expect(screen.getByText('Controle Bluetooth')).toBeTruthy();
  expect(screen.getByText('Toque para conectar')).toBeTruthy();
  expect(screen.getByText('Ligue o controle e deixe em modo de pareamento.')).toBeTruthy();
  expect(screen.getByText('No iPhone abra Ajustes > Bluetooth e toque no nome dele.')).toBeTruthy();
  expect(screen.getByText('Volte ao Reprize e aperte um botão do controle.')).toBeTruthy();
  expect(screen.getByText('Aperte um botão do controle…')).toBeTruthy();
  expect(isRemoteSheetOpen()).toBe(true);
});

test('a press shows the remote as connected', async () => {
  await render(<Devices />);
  await press();
  expect(screen.getByText('Conectado')).toBeTruthy();
  expect(screen.getByText('Controle conectado')).toBeTruthy();
  expect(screen.queryByText('Aperte um botão do controle…')).toBeNull();
});

test('used in a previous launch: asks for a press (never "Pareado"), the steps behind "Parear de novo"', async () => {
  repo.setPrefs({ remoteTestedAt: 123 });
  repo.setPrefs.mockClear();
  await render(<Devices />);
  expect(screen.getByText('Aperte um botão para conferir')).toBeTruthy();
  expect(screen.queryByText(/Pareado/)).toBeNull();
  expect(screen.getByText('Controle já usado neste celular')).toBeTruthy();
  expect(screen.queryByText('Ligue o controle e deixe em modo de pareamento.')).toBeNull();
  expect(screen.getByText(/Confira se o controle aparece como Conectado em Ajustes > Bluetooth/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Não funciona? Parear de novo' }));
  expect(screen.getByText('Ligue o controle e deixe em modo de pareamento.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Não funciona? Parear de novo' })).toBeNull();
});

test('after 15 seconds without a press it adds the troubleshooting note and keeps the steps', async () => {
  await render(<Devices />);
  expect(screen.queryByText(/Confira se o controle aparece/)).toBeNull();
  await act(async () => jest.advanceTimersByTime(15_000));
  expect(screen.getByText(/Confira se o controle aparece como Conectado/)).toBeTruthy();
  expect(screen.getByText('Ligue o controle e deixe em modo de pareamento.')).toBeTruthy();
});

test('"Esquecer" asks first, explains how to remove it in Ajustes, then goes back to the first state', async () => {
  repo.setPrefs({ remoteTestedAt: 123 });
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  await render(<Devices />);
  await fireEvent.press(screen.getByRole('button', { name: 'Esquecer controle' }));
  expect(repo.getPrefs().remoteTestedAt).toBe(123);
  expect(alert.mock.calls[0][1]).toMatch(/Ajustes > Bluetooth/);
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Esquecer')!.onPress!());
  expect(repo.getPrefs().remoteTestedAt).toBeUndefined();
  expect(screen.getByText('Toque para conectar')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Esquecer controle' })).toBeNull();
  alert.mockRestore();
});

test('there is no "Esquecer" before the remote was ever used', async () => {
  await render(<Devices />);
  expect(screen.queryByRole('button', { name: 'Esquecer controle' })).toBeNull();
});

test('"Pronto" closes the sheet', async () => {
  await render(<Devices />);
  await fireEvent.press(screen.getByRole('button', { name: 'Pronto' }));
  expect(router.back).toHaveBeenCalled();
});

test('closing the sheet hands the volume buttons back to the setup screen alone', async () => {
  const view = await render(<Devices />);
  expect(isRemoteSheetOpen()).toBe(true);
  await view.unmount();
  expect(isRemoteSheetOpen()).toBe(false);
});

describe('a BLE remote the app has learnt', () => {
  const cam = () => jest.requireMock('../../../modules/replay-camera');
  const shutter = { id: 'AAAA', name: 'AB Shutter3', services: ['battery', 'info'] };

  test('connected over Bluetooth: "Conectado" without a press, and its name', async () => {
    repo.setPrefs({ remoteTestedAt: 1, remoteBleId: 'AAAA', remoteBleName: 'AB Shutter3' });
    cam().bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter] });
    await render(<Devices />);
    await act(async () => {});
    expect(screen.getByText('Conectado')).toBeTruthy();
    expect(screen.getByText('AB Shutter3 · usado neste celular')).toBeTruthy();
    expect(cam().bluetoothConnected).toHaveBeenCalledWith(false); // never asks for Bluetooth just to look
  });

  test('gone (asleep, off, out of range, unpaired): "Em espera", and it comes back on its own', async () => {
    repo.setPrefs({ remoteTestedAt: 1, remoteBleId: 'AAAA', remoteBleName: 'AB Shutter3' });
    cam().bluetoothConnected.mockResolvedValue({ state: 'on', devices: [] });
    await render(<Devices />);
    await act(async () => {});
    expect(screen.getByText('Em espera · aperte um botão')).toBeTruthy();
    expect(screen.getByText(/poupar bateria/)).toBeTruthy();
    cam().bluetoothConnected.mockResolvedValue({ state: 'on', devices: [shutter] });
    await act(async () => void jest.advanceTimersByTime(2500));
    expect(screen.getByText('Conectado')).toBeTruthy();
  });

  test('the iPhone Bluetooth off: says so', async () => {
    repo.setPrefs({ remoteTestedAt: 1, remoteBleId: 'AAAA' });
    cam().bluetoothConnected.mockResolvedValue({ state: 'off', devices: [] });
    await render(<Devices />);
    await act(async () => {});
    expect(screen.getByText('Bluetooth desligado')).toBeTruthy();
    expect(screen.getByText(/Central de Controle/)).toBeTruthy();
  });
});

test('right after the app opens, while the camera starts, it says to wait instead of asking for a press', async () => {
  const { useSession } = jest.requireMock('../../session/SessionContext');
  useSession.mockReturnValue({ state: { camera: 'starting' } });
  const view = await render(<Devices />);
  expect(screen.getByText(/Abrindo a câmera… espere um instante/)).toBeTruthy();
  expect(screen.queryByText('Aperte um botão do controle…')).toBeNull();
  useSession.mockReturnValue({ state: { camera: 'on' } });
  await view.rerender(<Devices />);
  expect(screen.queryByText(/Abrindo a câmera/)).toBeNull();
  expect(screen.getByText('Aperte um botão do controle…')).toBeTruthy();
});
