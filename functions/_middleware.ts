import { scheduled as telegramScheduled } from './cron/telegram-worker';

export const scheduled = async (event: any, env: any, ctx: any) => {
  await telegramScheduled(event, env, ctx);
};
