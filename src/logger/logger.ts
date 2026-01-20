import pino from 'pino';

const pretty = process.env.LOG_PRETTY === '1' || process.env.LOG_PRETTY === 'true';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
