import pino from 'pino';

const log = pino({
    transport: {
      target: 'pino-pretty'
    },
  });

log.level = 10



export default log;