// TEMP(diag-remote): Bluetooth remote investigation; this whole file goes with its commit.
import { router } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { diagClear, diagFileUri, diagFlags, diagSubscribe, diagText, setDiagFlags } from '../diag/diagLog';
import { colors, fonts, radius } from '../theme/tokens';

/**
 * Diagnóstico (Bluetooth remote investigation; temporary, Portuguese only): the in-app log, a switch to record without
 * screen economy, and the log's file for the share sheet (AirDrop to the Mac, WhatsApp…).
 */
export default function Diag() {
  const [text, setText] = useState(() => diagText());
  const [economyOff, setEconomyOff] = useState(() => diagFlags().economyOff);

  useEffect(() => diagSubscribe(() => setText(diagText())), []);

  const toggleEconomy = (off: boolean) => {
    setEconomyOff(off);
    setDiagFlags({ economyOff: off });
  };

  const share = () => {
    const uri = diagFileUri();
    if (uri === undefined) {
      Alert.alert('Não foi possível abrir o arquivo do diagnóstico.');
      return;
    }
    shareAsync(uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: 'Diagnóstico do Revi' }).catch(
      () => {},
    );
  };

  const confirmClear = () =>
    Alert.alert('Limpar o diagnóstico?', 'Todas as linhas registradas até agora serão apagadas.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: diagClear },
    ]);

  const all = text.length === 0 ? [] : text.split('\n');
  const count = all.length;
  // Newest on top here; the shared file stays in order.
  const newestFirst = all.slice().reverse().join('\n');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <Text style={styles.title}>Diagnóstico</Text>
        <Text style={styles.note}>
          Registra o controle Bluetooth, o áudio, o calor e a tela durante as gravações. Depois de um teste, toque em
          Compartilhar e mande o arquivo.
        </Text>

        <View style={styles.row}>
          <Text style={styles.rowName}>Desligar a economia de tela nas gravações</Text>
          <Switch
            value={economyOff}
            onValueChange={toggleEconomy}
            trackColor={{ true: colors.accent, false: colors.surface }}
            accessibilityLabel="Desligar a economia de tela nas gravações"
          />
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label="Compartilhar" onPress={share} />
          </View>
          <View style={styles.action}>
            <Button label="Limpar" variant="secondary" onPress={confirmClear} />
          </View>
        </View>

        <Text style={styles.count}>{count} linhas (mais recentes no topo)</Text>
        <ScrollView style={styles.log} contentContainerStyle={styles.logBody}>
          <Text selectable style={styles.logText}>
            {count === 0 ? 'Nada registrado ainda.' : newestFirst}
          </Text>
        </ScrollView>

        <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, padding: 20, gap: 12 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, color: colors.text },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
  count: { fontFamily: fonts.body, fontSize: 13, color: colors.soft },
  log: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.card },
  logBody: { padding: 12 },
  logText: { fontFamily: 'Menlo', fontSize: 11, lineHeight: 16, color: colors.text },
});
