import { router } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { GameCard } from '../components/GameCard';
import { EmptyState } from '../components/EmptyState';
import { UpgradeCard } from '../components/UpgradeCard';
import { openPaywall } from '../payments/feedback';
import { sessionPlan } from '../payments/rules';
import { useProActive } from '../share/entitlement';
import { BackIcon, ReplayIcon } from '../components/icons';
import { sessionLabel } from '../components/format';
import { removeFile, repo } from '../data/mmkv';
import { useT } from '../i18n/useT';
import { useSession } from '../session/SessionContext';
import { colors, fonts } from '../theme/tokens';

/** Past games with at least one lance, newest first. */
export default function Games() {
  const { t, locale } = useT();
  const { reset, state } = useSession();
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const games = useMemo(
    () =>
      repo.listSessions().map((g) => ({
        ...g,
        recordedMs: repo.sessionStats(g.session.id).recordedMs,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [version],
  );

  // Pro unlocks every recording while it lasts: the gallery says so while some recordings are still on the free plan.
  const pro = useProActive();
  const hasFreeRecordings = games.some((g) => g.clips > 0 && sessionPlan(g.session) === 'free');

  // A game still being recorded has no end yet: it is never offered for deleting.
  const confirmDelete = (id: string, label: string, clips: number) => {
    Alert.alert(
      t('games.deleteTitle', { name: label }),
      t('games.deleteBody', { count: clips }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => repo.deleteSession(id).forEach((path) => removeFile(path)),
        },
      ],
    );
  };

  // The setup screen is already under this one. A game that has just ended still holds the live session, so start clean.
  const newGame = () => {
    if (state.phase === 'ended') reset();
    router.dismissTo('/setup');
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={styles.back}>
          <BackIcon />
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t('games.title')}
      </Text>
      <FlatList
        data={games}
        ListHeaderComponent={
          !pro && hasFreeRecordings ? (
            <UpgradeCard
              title={t('games.proTitle')}
              message={t('games.proMessage')}
              action={t('games.proAction')}
              badge={t('setup.proBadge')}
              onPress={() => void openPaywall(t, 'upgrade_card')}
            />
          ) : undefined
        }
        keyExtractor={(g) => g.session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon={<ReplayIcon color={colors.accent} size={40} />} title={t('games.emptyTitle')} message={t('games.emptyMessage')} />
        }
        renderItem={({ item }) => {
          const ended = item.session.endedAt !== undefined;
          const ask = () => confirmDelete(item.session.id, sessionLabel(item.session, undefined, locale), item.clips);
          return (
            <GameCard
              session={item.session}
              clips={item.clips}
              firstClip={item.firstClip}
              recordedMs={item.recordedMs}
              onPress={() => router.push(`/session/${item.session.id}`)}
              onLongPress={ended ? ask : undefined}
              onDelete={ended ? ask : undefined}
            />
          );
        }}
      />
      <View style={styles.footer}>
        <Button label={t('summary.newRecording')} onPress={newGame} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 12 },
  top: { flexDirection: 'row', marginTop: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.displayBold, fontSize: 44, lineHeight: 46, color: colors.text },
  list: { gap: 10, paddingBottom: 24 },
  footer: { paddingBottom: 12, gap: 10 },
});
