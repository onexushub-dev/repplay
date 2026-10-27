import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BatchResultCard } from '../../components/BatchResultCard';
import { Button } from '../../components/Button';
import { ClipCard } from '../../components/ClipCard';
import { EmptyState } from '../../components/EmptyState';
import { ExportProgress } from '../../components/ExportProgress';
import { SelectionBar } from '../../components/SelectionBar';
import { UpgradeCard } from '../../components/UpgradeCard';
import { ClipIcon, TrashIcon } from '../../components/icons';
import { clipNumber, dayAndTime, megabytes, modeLabel, recordedLabel, sessionLabel } from '../../components/format';
import { removeFile, repo } from '../../data/mmkv';
import { MAX_GAME_NAME } from '../../data/schema';
import { unlockRecording } from '../../payments/unlock';
import { useFreeExportGate } from '../../components/useFreeExportGate';
import { useViewPlan } from '../../share/entitlement';
import { freeLosses } from '../../share/exportOptions';
import { useBatchActions } from '../../share/useBatchActions';
import { useT } from '../../i18n/useT';
import { useSession } from '../../session/SessionContext';
import { colors, fonts } from '../../theme/tokens';

export default function SessionSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reset, state } = useSession();
  const { t, locale } = useT();
  const navigation = useNavigation();
  // Re-read whenever the repo changes (a clip deleted on the clip screen, a late save landing).
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const { session, clips, stats } = useMemo(
    () => ({ session: repo.getSession(id), clips: repo.listClips(id), stats: repo.sessionStats(id) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [id, version],
  );

  const plan = useViewPlan(id);

  const [name, setName] = useState(() => session?.name ?? '');
  const saveName = () => {
    if (session && name.trim() !== (session.name ?? '')) repo.renameSession(id, name);
  };

  // Picking clips to delete.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // A picked clip deleted elsewhere (the clip screen) is no longer in the list: only what is still there counts.
  const pickedClips = useMemo(() => clips.filter((c) => picked.includes(c.id)), [clips, picked]);
  const batch = useBatchActions({
    plan,
    labelOf: (c) => (c.name ? c.name : t('batch.clipNumber', { number: clipNumber(c, clips.indexOf(c)) })),
  });
  const working = batch.job !== undefined;
  // A free recording's clips leave without sound, Modo Foco and the app mark off: say so before saving or sending them.
  const freeGate = useFreeExportGate();
  const exportAfterNotice = async (clips: typeof pickedClips, go: (clips: typeof pickedClips) => Promise<void>) => {
    if (plan === 'free') {
      const choice = await freeGate.ask({
        focus: clips.some((c) => freeLosses(c).focus),
        speed: clips.some((c) => freeLosses(c).speed),
        sound: clips.some((c) => freeLosses(c).sound),
      });
      if (choice === 'unlock') void unlockRecording(id, t);
      if (choice !== 'go') return;
    }
    await go(clips);
  };
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };
  const toggle = (clipId: string) =>
    setPicked((current) => (current.includes(clipId) ? current.filter((c) => c !== clipId) : [...current, clipId]));
  const pickAll = () => setPicked(pickedClips.length === clips.length ? [] : clips.map((c) => c.id));

  function confirmDeleteClips() {
    const count = pickedClips.length;
    Alert.alert(t('summary.deleteClipsTitle', { count }), t('common.cantUndo'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          for (const clip of pickedClips) {
            removeFile(clip.path);
            repo.deleteClip(clip.id);
          }
          stopSelecting();
        },
      },
    ]);
  }

  function confirmDeleteGame() {
    const count = clips.length;
    Alert.alert(
      t('summary.deleteGameTitle'),
      count === 0 ? t('summary.deleteGameEmpty') : t('summary.deleteGameBody', { count }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            repo.deleteSession(id).forEach((path) => removeFile(path));
            if (state.sessionId === id) reset();
            leaveToGames();
          },
        },
      ],
    );
  }

  // Minhas gravações must always have the setup screen under it. A game that has just ended got here straight from the
  // setup, so /games is not in the stack and dismissTo would leave it as the only screen, with nowhere to go back to.
  function leaveToGames() {
    const state = navigation.getState();
    const inStack = state === undefined || state.routes.some((route) => route.name === 'games');
    if (inStack) {
      router.dismissTo('/games');
      return;
    }
    router.dismissTo('/setup');
    router.push('/games');
  }

  // However this screen goes (swiping back to the setup, Android's back, Nova gravação, Minhas gravações), the game that
  // has just ended leaves with it: the setup under it starts over, as Nova gravação always did.
  const leaving = useRef({ live: state.sessionId === id, reset });
  useEffect(() => {
    leaving.current = { live: state.sessionId === id, reset };
  }, [state.sessionId, id, reset]);
  useEffect(
    () => () => {
      if (leaving.current.live) leaving.current.reset();
    },
    [],
  );

  function newGame() {
    // Only the game that just ended resets the live session; from Minhas gravações, setup is already under us.
    if (state.sessionId === id) reset();
    router.dismissTo('/setup');
  }

  // A game whose last clip was just deleted (here or on the clip screen) has nothing left to show: remove it too and go
  // back to the list. A game that was recorded without any clip still opens as an empty summary.
  const hadClips = useRef(clips.length > 0);
  useEffect(() => {
    if (clips.length > 0) {
      hadClips.current = true;
      return;
    }
    if (!hadClips.current || !session) return;
    hadClips.current = false;
    repo.deleteSession(id).forEach((path) => removeFile(path));
    if (state.sessionId === id) reset();
    leaveToGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the clip list changes
  }, [clips.length, session]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            {session ? (
              <Text style={styles.subtitle}>{`${modeLabel(session.sport, locale)} · ${dayAndTime(session.startedAt, undefined, locale)}`}</Text>
            ) : null}
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
              {session?.name ? sessionLabel(session, undefined, locale) : t('summary.ended')}
            </Text>
          </View>
          {session && !selecting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('games.deleteRecording')}
              hitSlop={6}
              onPress={confirmDeleteGame}
              style={styles.deleteGame}>
              <TrashIcon color={colors.rec} size={22} />
            </Pressable>
          ) : null}
        </View>
        {session ? (
          <View style={styles.nameBox}>
            <TextInput
              accessibilityLabel={t('summary.nameLabel')}
              value={name}
              onChangeText={setName}
              onSubmitEditing={saveName}
              onBlur={saveName}
              placeholder={sessionLabel({ ...session, name: undefined }, undefined, locale)}
              placeholderTextColor={colors.muted}
              maxLength={MAX_GAME_NAME}
              returnKeyType="done"
              style={styles.nameInput}
            />
            <Text style={styles.nameCaption}>{t('summary.nameCaption')}</Text>
          </View>
        ) : null}
      </View>

      {clips.length > 0 ? (
        <View style={styles.pickBar}>
          {selecting ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('summary.cancelSelection')}
                hitSlop={8}
                onPress={stopSelecting}>
                <Text style={styles.pickLink}>{t('common.cancel')}</Text>
              </Pressable>
              <Text style={styles.pickCount}>
                {pickedClips.length === 0 ? t('summary.tapClips') : t('summary.selected', { count: pickedClips.length })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pickedClips.length === clips.length ? t('summary.clearSelection') : t('summary.selectAll')}
                hitSlop={8}
                onPress={pickAll}>
                <Text style={styles.pickLink}>{pickedClips.length === clips.length ? t('summary.clear') : t('summary.all')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('summary.selectClips')}
              hitSlop={8}
              onPress={() => setSelecting(true)}>
              <Text style={styles.pickLink}>{t('summary.selectClips')}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <View style={styles.stats}>
        <Stat value={recordedLabel(stats.recordedMs, locale)} label={t('summary.recorded')} />
        <Stat value={String(stats.clips)} label={t('summary.clipsStat', { count: stats.clips })} accent />
        <Stat value={megabytes(stats.bytes, locale)} label={t('summary.kept')} />
      </View>
      <Text style={styles.note}>{t('summary.note')}</Text>

      {/* The summary only exists after the recording ends, so this card never shows mid-recording. */}
      {plan === 'free' ? (
        <UpgradeCard
          title={t('summary.freeTitle')}
          message={t('summary.freeNote')}
          action={t('summary.upgrade')}
          badge={t('setup.proBadge')}
          onPress={() => void unlockRecording(id, t)}
        />
      ) : null}

      <FlatList
        data={clips}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={
          <EmptyState icon={<ClipIcon color={colors.accent} size={40} />} title={t('summary.emptyTitle')} message={t('summary.emptyMessage')} />
        }
        extraData={[selecting, picked, plan]}
        renderItem={({ item, index }) => (
          <ClipCard
            clip={item}
            number={clipNumber(item, index)}
            selecting={selecting}
            selected={picked.includes(item.id)}
            onPress={() => (selecting ? toggle(item.id) : router.push(`/clip/${item.id}`))}
            onLongPress={
              selecting
                ? undefined
                : () => {
                    setSelecting(true);
                    setPicked([item.id]);
                  }
            }
          />
        )}
      />

      <View style={styles.footer}>
        {selecting ? (
          <SelectionBar
            count={pickedClips.length}
            paid={plan === 'paid'}
            busy={working}
            onShare={() => void exportAfterNotice(pickedClips, batch.share)}
            onSave={() => void exportAfterNotice(pickedClips, batch.save)}
            onCompile={() => void batch.compile(pickedClips)}
            onDelete={confirmDeleteClips}
          />
        ) : (
          <Button label={t('summary.newRecording')} onPress={newGame} />
        )}
      </View>
      {freeGate.sheet}
      {batch.overlay}
      {batch.job ? <ExportProgress job={batch.job} onCancel={batch.job.stage === 'preparing' ? batch.cancel : undefined} /> : null}
      {batch.card ? (
        <BatchResultCard card={batch.card} onClose={batch.closeCard} />
      ) : null}
    </SafeAreaView>
  );
}

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 16 },
  header: { gap: 4, marginTop: 16 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  title: { fontFamily: fonts.displayBold, fontSize: 44, lineHeight: 46, color: colors.text },
  nameBox: { gap: 4, marginTop: 4 },
  nameInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.text,
  },
  nameCaption: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 2 },
  statValue: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.text },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: -8 },
  // The same pattern as the paid groups on the setup screen: lime outline and one small "Pro" pill on the border.
  grid: { gap: 10, paddingBottom: 12 },
  gridRow: { gap: 10 },
  footer: { gap: 8, paddingBottom: 12 },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center' },
  pickBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  pickLink: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  pickCount: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  deleteGame: { width: 44, height: 44, marginRight: -10, marginTop: -6, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: 10 },
});
