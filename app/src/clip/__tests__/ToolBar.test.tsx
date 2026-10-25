import { fireEvent, render, screen } from '@testing-library/react-native';

import { ToolBar } from '../ToolBar';

test('one tab per tool, the open one selected, Foco marked when on', async () => {
  const onOpen = jest.fn();
  await render(<ToolBar open="speed" focusOn onOpen={onOpen} />);
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((t) => t.props.accessibilityLabel)).toEqual(['Foco, ligado', 'Velocidade', 'Som', 'Zoom', 'Girar']);
  expect(screen.getByRole('tab', { name: 'Velocidade' }).props.accessibilityState).toMatchObject({ selected: true });
  await fireEvent.press(screen.getByRole('tab', { name: 'Som' }));
  expect(onOpen).toHaveBeenCalledWith('sound');
});

test('Foco off is just Foco', async () => {
  await render(<ToolBar open="focus" focusOn={false} onOpen={() => {}} />);
  expect(screen.getByRole('tab', { name: 'Foco' }).props.accessibilityState).toMatchObject({ selected: true });
});
