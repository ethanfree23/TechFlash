import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TextInput,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import { colors } from '../theme';
import { getConversation } from '../api/conversationsApi';
import { createMessage, listMessages, type MessageRow } from '../api/messagesApi';
import { createFeedback } from '../api/feedbackApi';
import { blockUser } from '../api/settingsApi';
import { useAuth } from '../auth/AuthContext';
import type { AppStackParamList } from '../navigation/RootNavigator';

type ConvRoute = RouteProp<AppStackParamList, 'Conversation'>;

function isBlockedMessagingError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('blocked') || m.includes('messaging is unavailable');
}

export default function ConversationScreen() {
  const route = useRoute<ConvRoute>();
  const { conversationId } = route.params;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [blockedMessaging, setBlockedMessaging] = useState(false);
  const [conversation, setConversation] = useState<Record<string, unknown>>({});
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [reportBody, setReportBody] = useState('');
  const { user } = useAuth();

  const load = useCallback(async () => {
    setError('');
    try {
      const [conv, msgs] = await Promise.all([
        getConversation(conversationId),
        listMessages(conversationId),
      ]);
      setConversation(conv as Record<string, unknown>);
      setMessages(msgs);
      setBlockedMessaging(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load conversation';
      setError(msg);
      if (isBlockedMessagingError(msg)) setBlockedMessaging(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const isFeedbackThread =
    conversation.conversation_type === 'feedback' || conversation.inbox_category === 'feedback';

  const onSend = async () => {
    if (!draft.trim() || isFeedbackThread || blockedMessaging) return;
    setSaving(true);
    setError('');
    try {
      await createMessage(conversationId, draft.trim());
      setDraft('');
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not send message';
      setError(msg);
      if (isBlockedMessagingError(msg)) setBlockedMessaging(true);
    } finally {
      setSaving(false);
    }
  };

  const targetUserId =
    user?.role === 'technician'
      ? Number((conversation.company_profile as Record<string, unknown> | undefined)?.user_id || 0)
      : Number((conversation.technician_profile as Record<string, unknown> | undefined)?.user_id || 0);

  const onReport = () => {
    if (!reportBody.trim()) {
      setError('Enter report details first.');
      return;
    }
    Alert.alert(
      'Submit report?',
      'This creates a moderation record for TechFlash staff. It does not automatically ban the other user.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit report',
          onPress: async () => {
            setSaving(true);
            setError('');
            setNotice('');
            try {
              await createFeedback(
                'problem',
                `Conversation report #${conversationId}\n${reportBody.trim()}`,
                `/conversations/${conversationId}`
              );
              setReportBody('');
              setNotice('Report submitted. Our team will review it.');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not submit report');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const onBlock = () => {
    if (!targetUserId) {
      setError('Could not determine user to block.');
      return;
    }
    Alert.alert(
      'Block this user?',
      'They will no longer be able to message you, and you will not be able to message them. You can unblock later in Settings → Account → Blocked users.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            setError('');
            setNotice('');
            try {
              await blockUser(targetUserId);
              setBlockedMessaging(true);
              setNotice('User blocked. Direct messaging with this person is now disabled.');
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not block user');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primaryOrange} /></View>;
  }

  return (
    <View style={styles.root}>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {isFeedbackThread ? (
        <Text style={styles.info}>Feedback thread is read-only.</Text>
      ) : null}
      {blockedMessaging ? (
        <Text style={styles.info}>
          Messaging is unavailable because one participant has blocked the other. Unblock from Settings if needed.
        </Text>
      ) : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryOrange} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.msgCard}>
            <Text style={styles.msgMeta}>
              {String(item.sender_display_name || item.sender_type || 'Sender')}
            </Text>
            <Text style={styles.msgBody}>{String(item.content || '')}</Text>
          </View>
        )}
      />
      {!isFeedbackThread ? (
        <View style={styles.safetyCard}>
          <Text style={styles.safetyTitle}>Safety</Text>
          <TextInput
            value={reportBody}
            onChangeText={setReportBody}
            placeholder="Report abusive behavior or unsafe content"
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable style={styles.reportBtn} onPress={onReport} disabled={saving}>
            <Text style={styles.reportBtnText}>Report this conversation</Text>
          </Pressable>
          <Pressable style={styles.blockBtn} onPress={onBlock} disabled={saving || blockedMessaging}>
            <Text style={styles.blockBtnText}>{blockedMessaging ? 'User blocked' : 'Block this user'}</Text>
          </Pressable>
        </View>
      ) : null}
      {!isFeedbackThread && !blockedMessaging ? (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type message..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            multiline
          />
          <Pressable style={[styles.send, saving && { opacity: 0.7 }]} onPress={onSend} disabled={saving}>
            <Text style={styles.sendText}>{saving ? '...' : 'Send'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  error: { color: colors.danger, marginHorizontal: 14, marginTop: 10 },
  notice: { color: colors.primaryBlue, marginHorizontal: 14, marginTop: 10, fontWeight: '600' },
  info: { color: colors.muted, marginHorizontal: 14, marginTop: 10 },
  empty: { marginTop: 20, textAlign: 'center', color: colors.muted },
  msgCard: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  msgMeta: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  msgBody: { color: colors.text, fontSize: 15 },
  safetyCard: {
    marginHorizontal: 14,
    marginBottom: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
    padding: 10,
  },
  safetyTitle: { color: colors.text, fontWeight: '700', marginBottom: 6 },
  reportBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  reportBtnText: { color: colors.text, fontWeight: '600' },
  blockBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  blockBtnText: { color: colors.danger, fontWeight: '700' },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: colors.white,
    minHeight: 38,
    maxHeight: 100,
  },
  send: {
    backgroundColor: colors.primaryOrange,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendText: { color: colors.white, fontWeight: '700' },
});
