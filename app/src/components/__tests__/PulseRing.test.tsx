import { render, screen } from '@testing-library/react-native';

import { PulseRing } from '../PulseRing';

test('the ring and its dot are drawn at the asked size, hidden from screen readers', async () => {
  await render(<PulseRing color="#FFB000" size={28} />);
  const box = screen.getByTestId('pulse-ring', { includeHiddenElements: true });
  expect(box.props.accessibilityElementsHidden).toBe(true);
  expect(box.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 28 * 1.7, height: 28 * 1.7 })]));
});
