import { parseCode, parsePairLink, parsePairUrl } from '../pairLink';

// The camera phone builds this exact link (Swift test `testQrURLIsPinned`):
// reprize://pair?h=h1&s=AAECAwQFBgcICQoLDA0ODw&n=Quadra%201
const good = { h: 'h1', s: 'AAECAwQFBgcICQoLDA0ODw', n: 'Quadra 1' };

test('reads the link the camera phone builds', () => {
  expect(parsePairLink(good)).toEqual({ hostId: 'h1', secret: 'AAECAwQFBgcICQoLDA0ODw', hostName: 'Quadra 1' });
});

test('a link without a usable host id is refused', () => {
  expect(parsePairLink({ ...good, h: undefined })).toBeNull();
  expect(parsePairLink({ ...good, h: '' })).toBeNull();
  expect(parsePairLink({ ...good, h: 'x'.repeat(65) })).toBeNull();
});

test('a link without a well-formed secret is refused', () => {
  expect(parsePairLink({ ...good, s: undefined })).toBeNull();
  expect(parsePairLink({ ...good, s: 'AAECAwQFBgcICQoLDA0O+w' })).toBeNull(); // '+' is not base64url
  expect(parsePairLink({ ...good, s: 'AAECAwQFBgcICQoLDA0O/w' })).toBeNull(); // '/' is not base64url
  expect(parsePairLink({ ...good, s: 'AAECAwQFBgcICQoLDA0ODw==' })).toBeNull(); // padding
  expect(parsePairLink({ ...good, s: 'AAECAwQFBgcICQoLDA0OD' })).toBeNull(); // 21 characters
  expect(parsePairLink({ ...good, s: 'AAECAwQFBgcICQoLDA0ODwA' })).toBeNull(); // 23 characters
});

test('a missing name falls back, and a long one is cut to 40 characters', () => {
  expect(parsePairLink({ ...good, n: undefined })).toMatchObject({ hostName: 'Celular da câmera' });
  expect(parsePairLink({ ...good, n: '' })).toMatchObject({ hostName: 'Celular da câmera' });
  const cut = parsePairLink({ ...good, n: 'x'.repeat(60) });
  expect(cut === null ? 0 : cut.hostName.length).toBe(40);
});

test('the typed code is six digits, spaces allowed', () => {
  expect(parseCode('123456')).toBe('123456');
  expect(parseCode(' 123 456 ')).toBe('123456');
  expect(parseCode('042517')).toBe('042517');
});

test('anything else is not a code', () => {
  expect(parseCode('12345')).toBeNull();
  expect(parseCode('1234567')).toBeNull();
  expect(parseCode('abcdef')).toBeNull();
  expect(parseCode('12 34 5a')).toBeNull();
  expect(parseCode('')).toBeNull();
});

test('reads the link in the QR code, with the name encoded', () => {
  expect(parsePairUrl('reprize://pair?h=host1&s=AAAAAAAAAAAAAAAAAAAAAA&n=Quadra%201')).toEqual({
    hostId: 'host1',
    secret: 'AAAAAAAAAAAAAAAAAAAAAA',
    hostName: 'Quadra 1',
  });
});

test('anything else read by the scanner is not a pairing link', () => {
  expect(parsePairUrl('https://example.com')).toBeNull();
  expect(parsePairUrl('reprize://pair?h=host1')).toBeNull();
  expect(parsePairUrl('reprize://pair?h=host1&s=curto')).toBeNull();
});
