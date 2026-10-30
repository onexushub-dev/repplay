import { translate } from '../../i18n';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { readEdit } from '../../share/editing';
import { EDIT_TOOLS, type ToolContext } from '../tools';

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    edit: readEdit(undefined),
    plan: 'paid',
    unlock: jest.fn(),
    setEdit: jest.fn(),
    focus: 'on',
    toggleFocus: jest.fn(),
    resetZoom: jest.fn(),
    turn: jest.fn(),
    ...over,
  };
}

const panel = (id: string) => EDIT_TOOLS.find((t) => t.id === id)!.Panel;

test('the tools, in order, with their names', () => {
  expect(EDIT_TOOLS.map((tool) => [tool.id, translate('pt-BR', tool.label)])).toEqual([
    ['focus', 'Foco'],
    ['speed', 'Velocidade'],
    ['sound', 'Som'],
    ['zoom', 'Zoom'],
    ['rotate', 'Girar'],
  ]);
});

test('Velocidade explains itself and stores the chosen speed', async () => {
  const c = ctx();
  const Panel = panel('speed');
  await render(<Panel ctx={c} />);
  expect(screen.getByText('Escolha a velocidade de reprodução do clipe.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Velocidade 1x' }).props.accessibilityState).toMatchObject({ selected: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Velocidade 2x' }));
  expect(c.setEdit).toHaveBeenCalledWith({ speed: 2 });
});

test('Som turns the sound off and on, and is off and locked at another speed', async () => {
  const c = ctx();
  const Panel = panel('sound');
  const view = await render(<Panel ctx={c} />);
  expect(screen.getByText('Ative ou desative o som do clipe.')).toBeTruthy();
  expect(screen.getByText('Com som')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Som' }));
  expect(c.setEdit).toHaveBeenCalledWith({ muted: true });
  const fast = ctx({ edit: { ...readEdit(undefined), speed: 2 } });
  await view.rerender(<Panel ctx={fast} />);
  expect(screen.getByText('Sem som')).toBeTruthy();
  expect(screen.getByText('Fora de 1x o vídeo sai sem som.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Som' }));
  expect(fast.setEdit).not.toHaveBeenCalled();
});

test('Zoom shows the hand zoom and goes back to 1x', async () => {
  const Panel = panel('zoom');
  const c = ctx({ edit: { ...readEdit(undefined), zoom: { scale: 2, cx: 0.5, cy: 0.5 } } });
  const view = await render(<Panel ctx={c} />);
  expect(screen.getByText('Pince o vídeo para aproximar. Com zoom manual o Modo Foco desliga.')).toBeTruthy();
  expect(screen.getByText('2.0x')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Voltar zoom para 1x' }));
  expect(c.resetZoom).toHaveBeenCalled();
  await view.rerender(<Panel ctx={ctx()} />);
  expect(screen.getByText('1.0x')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Voltar zoom para 1x' })).toBeNull();
});

test('Girar turns the video', async () => {
  const c = ctx();
  const Panel = panel('rotate');
  await render(<Panel ctx={c} />);
  expect(screen.getByText('Para um vídeo gravado de lado.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Girar vídeo' }));
  expect(c.turn).toHaveBeenCalled();
});

test('Foco: a switch when ready, a wait while preparing, a message when it cannot frame', async () => {
  const Panel = panel('focus');
  const c = ctx();
  const view = await render(<Panel ctx={c} />);
  expect(screen.getByText('A câmera acompanha o lance, com zoom quando a jogada se concentra.')).toBeTruthy();
  expect(screen.getByText('Mantenha o dedo pressionado no vídeo para ver o clipe original')).toBeTruthy();
  const sw = screen.getByRole('switch', { name: 'Modo Foco' });
  expect(sw.props.accessibilityState).toMatchObject({ checked: true });
  await fireEvent.press(sw);
  expect(c.toggleFocus).toHaveBeenCalled();
  await view.rerender(<Panel ctx={ctx({ focus: 'off' })} />);
  expect(screen.getByRole('switch', { name: 'Modo Foco' }).props.accessibilityState).toMatchObject({ checked: false });
  await view.rerender(<Panel ctx={ctx({ focus: 'preparing' })} />);
  expect(screen.getByText('Preparando o enquadramento…')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Modo Foco' }).props.accessibilityState).toMatchObject({ disabled: true });
  await view.rerender(<Panel ctx={ctx({ focus: 'unavailable' })} />);
  expect(screen.getByText('Modo Foco indisponível para esse clipe.')).toBeTruthy();
  expect(screen.queryByRole('switch', { name: 'Modo Foco' })).toBeNull();
});

test('on a free recording the sound works like on a paid one', async () => {
  const c = ctx({ plan: 'free' });
  const Panel = panel('sound');
  await render(<Panel ctx={c} />);
  expect(screen.getByText('Ative ou desative o som do clipe.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Som' }));
  expect(c.setEdit).toHaveBeenCalledWith({ muted: true });
  expect(c.unlock).not.toHaveBeenCalled();
});

test('on a free recording Modo Foco works, and the hint says it does not leave the app', async () => {
  const c = ctx({ focus: 'on', plan: 'free' });
  const Panel = panel('focus');
  await render(<Panel ctx={c} />);
  expect(screen.getByText('No plano grátis o Foco funciona aqui, mas não vai no vídeo salvo ou enviado.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch', { name: 'Modo Foco' }));
  expect(c.toggleFocus).toHaveBeenCalledTimes(1);
  expect(c.unlock).not.toHaveBeenCalled();
});

test('on a free recording the speed works, and the hint says it does not leave the app', async () => {
  const c = ctx({ plan: 'free' });
  const Panel = panel('speed');
  await render(<Panel ctx={c} />);
  expect(screen.getByText('No plano grátis a velocidade funciona aqui, mas não vai no vídeo salvo ou enviado.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Velocidade 2x' }));
  expect(c.setEdit).toHaveBeenCalledWith({ speed: 2 });
  expect(c.unlock).not.toHaveBeenCalled();
});
