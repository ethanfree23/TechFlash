import { messagesAPI } from '../../api/api';
import { MESSAGE_PRIORITIES } from './constants';

function firstLine(text, maxLen = 80) {
  if (!text) return 'No subject';
  const line = String(text).split('\n')[0].trim();
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen)}…`;
}

function inferTypeFromConversation(conv) {
  if (conv.conversation_type === 'feedback') {
    const kind = conv.feedback_kind || 'feedback';
    if (kind === 'problem') return 'problem';
    if (kind === 'suggestion') return 'suggestion';
    return 'feedback';
  }
  return 'job';
}

function inferSender(conv) {
  if (conv.conversation_type === 'feedback') {
    return {
      senderName: conv.submitter_email?.split('@')[0] || 'User',
      senderEmail: conv.submitter_email || '',
      senderRole: conv.submitter_role || 'company',
    };
  }
  if (conv.technician_profile) {
    const email = conv.technician_profile?.user?.email;
    return {
      senderName: email || conv.technician_profile?.trade_type || 'Technician',
      senderEmail: email || '',
      senderRole: 'technician',
    };
  }
  if (conv.company_profile) {
    return {
      senderName: conv.company_profile?.company_name || 'Company',
      senderEmail: '',
      senderRole: 'company',
    };
  }
  return { senderName: 'Unknown', senderEmail: '', senderRole: 'company' };
}

function buildThreadFromMessages(conv, msgs) {
  const list = Array.isArray(msgs) ? msgs : conv.messages || [];
  return list.map((m) => ({
    id: String(m.id),
    senderName: m.sender_display_name || 'User',
    senderRole:
      m.sender_type === 'TechnicianProfile'
        ? 'technician'
        : m.sender_type === 'CompanyProfile'
          ? 'company'
          : 'admin',
    body: m.content || '',
    isInternalNote: Boolean(m.internal),
    createdAt: m.created_at,
  }));
}

export function conversationToInboxMessage(conv, viewerRole) {
  const msgs = conv.messages || [];
  const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
  const bodyText = lastMsg?.content || '';
  const type = inferTypeFromConversation(conv);
  const sender = inferSender(conv);
  const isFeedback = conv.conversation_type === 'feedback';

  const subject = isFeedback
    ? `${(conv.feedback_kind || 'feedback').charAt(0).toUpperCase()}${(conv.feedback_kind || 'feedback').slice(1)}: ${firstLine(bodyText, 60)}`
    : conv.job?.title || firstLine(bodyText) || 'Job conversation';

  return {
    id: String(conv.id),
    sourceConversationId: conv.id,
    sourceConversationType: conv.conversation_type,
    isFeedbackThread: isFeedback,
    type,
    subject,
    preview: bodyText.slice(0, 120) || 'No preview',
    body: bodyText,
    senderName: sender.senderName,
    senderEmail: sender.senderEmail,
    senderRole: sender.senderRole,
    recipientName: viewerRole === 'admin' ? 'TechFlash Admin' : 'You',
    recipientRole: viewerRole === 'admin' ? 'admin' : viewerRole,
    status: conv.inbox_status || 'open',
    priority: conv.priority || 'normal',
    isUnread: Boolean(conv.is_unread),
    relatedJobId: conv.job_id ? String(conv.job_id) : null,
    relatedCompanyId: conv.company_profile_id ? String(conv.company_profile_id) : null,
    relatedTechnicianId: conv.technician_profile_id ? String(conv.technician_profile_id) : null,
    assignedTo: conv.assigned_to_name || conv.assigned_to_email || null,
    assignedToId: conv.assigned_to_id ?? null,
    createdAt: conv.created_at || new Date().toISOString(),
    updatedAt: conv.updated_at || conv.created_at || new Date().toISOString(),
    thread: buildThreadFromMessages(conv, msgs),
  };
}

export function mergeMessages(seedMessages, apiMessages) {
  const apiIds = new Set(apiMessages.map((m) => m.id));
  const seeds = seedMessages.filter((s) => !apiIds.has(s.id));
  return [...apiMessages, ...seeds].sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
  );
}

export async function sendConversationReply(conversationId, content, options = {}) {
  return messagesAPI.create(conversationId, content, options);
}

function formatDurationMs(ms) {
  if (!ms || ms < 0) return '—';
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function computeAvgResponseTime(messages) {
  const deltas = [];
  for (const msg of messages) {
    const thread = msg.thread || [];
    const firstAdmin = thread.find((t) => t.senderRole === 'admin');
    if (!firstAdmin?.createdAt || !msg.createdAt) continue;
    const start = new Date(msg.createdAt).getTime();
    const end = new Date(firstAdmin.createdAt).getTime();
    if (end > start) deltas.push(end - start);
  }
  if (deltas.length === 0) return '—';
  const avg = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  return formatDurationMs(avg);
}

export function exportMessagesCsv(messages) {
  const headers = ['id', 'type', 'subject', 'sender', 'status', 'priority', 'createdAt'];
  const rows = messages.map((m) =>
    [
      m.id,
      m.type,
      `"${(m.subject || '').replace(/"/g, '""')}"`,
      `"${(m.senderName || '').replace(/"/g, '""')}"`,
      m.status,
      m.priority,
      m.createdAt,
    ].join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

export function sortMessages(messages, sortId) {
  const copy = [...messages];
  if (sortId === 'oldest') {
    return copy.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  if (sortId === 'priority') {
    return copy.sort((a, b) => {
      const pa = MESSAGE_PRIORITIES[a.priority]?.order ?? 2;
      const pb = MESSAGE_PRIORITIES[b.priority]?.order ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
  if (sortId === 'unread') {
    return copy.sort((a, b) => {
      if (a.isUnread !== b.isUnread) return a.isUnread ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
  return copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function filterMessages(messages, { tab, tabs, search, statusFilter, priorityFilter, isAdmin }) {
  const tabDef = tabs.find((t) => t.id === tab) || tabs[0];
  let result = [...messages];

  if (tabDef.id === 'unread') {
    result = result.filter((m) => m.isUnread);
  } else if (tabDef.id === 'archived') {
    result = result.filter((m) => m.status === 'archived');
  } else if (tabDef.id !== 'all') {
    if (tabDef.types) {
      result = result.filter((m) => tabDef.types.includes(m.type));
    }
    if (tabDef.statuses) {
      result = result.filter((m) => tabDef.statuses.includes(m.status));
    }
  } else if (!isAdmin && tabDef.id === 'all') {
    result = result.filter((m) => m.status !== 'archived');
  }

  if (statusFilter && statusFilter !== 'all') {
    result = result.filter((m) => m.status === statusFilter);
  }

  if (priorityFilter && priorityFilter !== 'all') {
    result = result.filter((m) => m.priority === priorityFilter);
  }

  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (m) =>
        m.subject?.toLowerCase().includes(q) ||
        m.preview?.toLowerCase().includes(q) ||
        m.senderName?.toLowerCase().includes(q) ||
        m.senderEmail?.toLowerCase().includes(q) ||
        m.relatedJobId?.toLowerCase().includes(q) ||
        m.relatedCompanyId?.toLowerCase().includes(q),
    );
  }

  return result;
}

export function getTabCounts(messages, tabs) {
  const counts = {};
  tabs.forEach((tab) => {
    if (tab.id === 'all') {
      counts[tab.id] = messages.filter((m) => m.status !== 'archived').length;
    } else if (tab.id === 'unread') {
      counts[tab.id] = messages.filter((m) => m.isUnread).length;
    } else if (tab.id === 'archived') {
      counts[tab.id] = messages.filter((m) => m.status === 'archived').length;
    } else if (tab.types) {
      counts[tab.id] = messages.filter((m) => tab.types.includes(m.type) && m.status !== 'archived').length;
    } else {
      counts[tab.id] = 0;
    }
  });
  return counts;
}
