require('dotenv').config();
const winston = require('winston');
const Transport = require('winston-transport');
const axios = require('axios');

// Custom transport to send logs via HTTP POST, mimicking the curl command.
class SolarwindsHttpTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.token = opts.token;
    this.url = 'https://logs.collector.ap-01.cloud.solarwinds.com/v1/logs';
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // We just send the message property as a raw string.
    const message = info.message;

    axios.post(this.url, message, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'text/plain', // The original curl used octet-stream, but text/plain is often accepted.
      },
      timeout: 5000,
    }).catch(err => {
      // Log transport errors to the console to avoid infinite loops.
      console.error('Solarwinds HTTP transport error:', err.message);
    });

    callback();
  }
}

const logger = winston.createLogger({
  level: 'info',
  transports: [
    // The console transport will show colorful, simple logs.
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add the custom transport only if the token is available.
if (process.env.PAPERTRAIL_TOKEN) {
  logger.add(new SolarwindsHttpTransport({
    token: process.env.PAPERTRAIL_TOKEN
  }));
} else {
  console.warn('Papertrail token not found. Papertrail logging is disabled.');
}

// Add a global error handler to the logger itself to prevent crashes.
logger.on('error', (err) => {
    console.error('An error occurred in the logger:', err);
});

module.exports = logger;