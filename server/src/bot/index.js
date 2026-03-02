import { v4 as uuid } from 'uuid';
import { initDb, userQueries } from '../db/index.js';

await initDb();

const token = process.env.TELEGRAM_BOT_TOKEN || '8345415769:AAHDpo-LCWJJ6vHtos2gzyc6_dYPaj-bJdw';
const API_URL = process.env.API_URL || 'http://localhost:3001';
const TELEGRAM_API = `https://api.telegram.org/bot${token}`;

async function sendMessage(chatId, text, parseMode = null) {
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Telegram sendMessage error:', res.status, err);
  }
}

async function processUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === '/start') {
    await sendMessage(
      chatId,
      '👋 Добро пожаловать в Voice Portal!\n\n' +
        'Используйте /register для регистрации в сервисе. После регистрации вы получите ссылку для входа в клиент.'
    );
    return;
  }

  if (text === '/help') {
    await sendMessage(
      chatId,
      '📌 Команды:\n' +
        '/start - приветствие\n' +
        '/register - зарегистрироваться и получить ID для входа\n' +
        '/help - эта справка'
    );
    return;
  }

  if (text === '/register') {
    const telegramId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'user';
    const displayName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || username;

    let user = userQueries.getByTelegramId.get(telegramId);
    if (user) {
      userQueries.update.run(username, displayName, null, user.id);
      user = userQueries.getById.get(user.id);
      await sendMessage(
        chatId,
        '✅ Вы уже зарегистрированы. Ваш ID для входа в клиент:\n\n' +
          `\`${user.id}\`\n\n` +
          `Или используйте Telegram ID: \`${telegramId}\`\n\n` +
          `Откройте клиент и войдите с этим ID (в настройках укажите сервер: ${API_URL})`,
        'Markdown'
      );
      return;
    }

    const id = uuid();
    try {
      userQueries.create.run(id, telegramId, username, displayName, null);
      await sendMessage(
        chatId,
        '✅ Регистрация успешна!\n\n' +
          'Ваш уникальный ID для входа в клиент:\n\n' +
          `\`${id}\`\n\n` +
          `Также можно войти по Telegram ID: \`${telegramId}\`\n\n` +
          `Скачайте и откройте клиент Voice Portal, введите этот ID и адрес сервера: ${API_URL}`,
        'Markdown'
      );
    } catch (e) {
      await sendMessage(chatId, '❌ Ошибка регистрации. Попробуйте позже.');
    }
  }
}

async function poll() {
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`);
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) continue;
      for (const update of data.result) {
        offset = update.update_id + 1;
        processUpdate(update).catch((err) => console.error('Process update error:', err));
      }
    } catch (err) {
      console.error('Poll error:', err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

console.log('Telegram bot running (long poll). Use /register in bot to get login ID.');
poll();
