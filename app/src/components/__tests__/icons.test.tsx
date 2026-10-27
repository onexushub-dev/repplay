import { render } from '@testing-library/react-native';

import { colors } from '../../theme/tokens';
import { TrashIcon } from '../icons';

/** react-native-svg stores a colour as an ARGB number: '#FF5A36' → 0xFFFF5A36. */
const argb = (hex: string) => (0xff000000 + parseInt(hex.slice(1), 16)) >>> 0;

test('the delete icon is red by default, so every screen shows it the same', async () => {
  const view = await render(<TrashIcon />);
  const tree = JSON.stringify(view.toJSON());
  expect(tree).toContain(`"stroke":{"type":0,"payload":${argb(colors.rec)}}`);
  expect(tree).not.toContain(`"payload":${argb(colors.text)}`);
});
