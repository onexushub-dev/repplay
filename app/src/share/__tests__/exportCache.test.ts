import { cachedExport, clearExportsFolder, forgetAllExportsForTests, forgetExport, rememberExport } from '../exportCache';

const mockFiles = new Set<string>();
const mockListed: string[] = [];
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
  Directory: class {
    list() {
      return [...mockFiles].map((uri) => ({ delete: () => (mockListed.push(uri), mockFiles.delete(uri)) }));
    }
  },
  Paths: { cache: '/cache' },
}));

beforeEach(() => {
  forgetAllExportsForTests();
  mockFiles.clear();
  mockListed.length = 0;
});

test('a remembered export is found while its file exists', () => {
  mockFiles.add('file:///e1.mp4');
  rememberExport('k', '/e1.mp4');
  expect(cachedExport('k')).toBe('/e1.mp4');
});

test('a removed file is a miss, and the entry goes', () => {
  rememberExport('k', '/e1.mp4');
  expect(cachedExport('k')).toBeUndefined();
  mockFiles.add('file:///e1.mp4');
  expect(cachedExport('k')).toBeUndefined();
});

test('forgetExport removes the entry and the file', () => {
  mockFiles.add('file:///e1.mp4');
  rememberExport('k', '/e1.mp4');
  forgetExport('/e1.mp4');
  expect(mockFiles.has('file:///e1.mp4')).toBe(false);
  expect(cachedExport('k')).toBeUndefined();
});

test('clearExportsFolder empties the folder and the map', () => {
  mockFiles.add('file:///e1.mp4');
  rememberExport('k', '/e1.mp4');
  clearExportsFolder();
  expect(mockListed).toEqual(['file:///e1.mp4']);
  expect(cachedExport('k')).toBeUndefined();
});
