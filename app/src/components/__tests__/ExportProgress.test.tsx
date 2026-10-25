import { fireEvent, render, screen } from '@testing-library/react-native';

import { ExportProgress, exportTitle } from '../ExportProgress';

test('a single clip keeps its titles', () => {
  expect(exportTitle({ kind: 'save', stage: 'preparing' }, 'pt-BR')).toBe('Preparando o vídeo…');
  expect(exportTitle({ kind: 'save', stage: 'delivering' }, 'pt-BR')).toBe('Salvando na galeria…');
  expect(exportTitle({ kind: 'share', stage: 'delivering' }, 'pt-BR')).toBe('Abrindo o compartilhamento…');
});

test('a batch says which clip it is on', () => {
  const job = { kind: 'save', stage: 'preparing', step: { done: 1, total: 5 } } as const;
  expect(exportTitle(job, 'pt-BR')).toBe('Preparando 2 de 5…');
  expect(exportTitle(job, 'en')).toBe('Preparing 2 of 5…');
});

test('the last clip never reads past the total', () => {
  expect(exportTitle({ kind: 'share', stage: 'preparing', step: { done: 5, total: 5 } }, 'pt-BR')).toBe('Preparando 5 de 5…');
});

test('joining the clips has its own title', () => {
  expect(exportTitle({ kind: 'compile', stage: 'joining' }, 'pt-BR')).toBe('Juntando os clipes…');
});

test('with onCancel there is a Cancelar button that calls it; without, the card lets touches through', async () => {
  const onCancel = jest.fn();
  const view = await render(<ExportProgress job={{ kind: 'save', stage: 'preparing', step: { done: 0, total: 3 } }} onCancel={onCancel} />);
  fireEvent.press(screen.getByRole('button', { name: /Cancel/ }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  view.unmount();
  await render(<ExportProgress job={{ kind: 'save', stage: 'preparing' }} />);
  expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
});
