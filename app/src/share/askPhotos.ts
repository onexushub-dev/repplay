import { getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';

import { track } from '../analytics';

/**
 * Asks to save videos to the gallery. Reports `permission_result` only when the app had never asked before, so the
 * system prompt really showed: a save with the permission already decided is not a new answer.
 */
export async function askPhotos(): Promise<boolean> {
  let firstTime = false;
  try {
    firstTime = (await getPermissionsAsync(true, ['video'])).status === 'undetermined';
  } catch {
    firstTime = false;
  }
  const { granted } = await requestPermissionsAsync(true, ['video']);
  if (firstTime) track('permission_result', { kind: 'photos', granted });
  return granted;
}
