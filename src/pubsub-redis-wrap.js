'use strict';

const Redis = require('ioredis');

module.exports = ((config) => {
  // TODO: destruct the config object passed in to evaluate using default values
  const sub = new Redis(config);
  const pub = new Redis(config);

  const serializeMessage = (message) => {
    return JSON.stringify(message);
  };

  const tryConvertToJSON = (jsonString) => {
    try {
      const json = JSON.parse(jsonString);

      if (json && typeof json === 'object') {
        return json;
      }
    } catch (err) {}

    return jsonString;
  };

  return {
    subscribe: (channel) => {
      return sub.psubscribe(channel).then((count) => {
        console.log(`Successfully subscribed to channel ${channel}`);
      }).catch((err) => {
        console.error(`Something went wrong with this subscribe for channel ${channel}`, err);
      });
    },

    unsubscribe: (channel) => {
      return sub.punsubscribe(channel).then((count) => {
        console.log(`Successfully unsubscribed to channel ${channel}`);
        return count;
      }).catch((err) => {
        console.error(`Something went wrong with this subscribe for channel ${channel}`, err);
      });
    },

    publish: (channel, message) => {
      return new Promise((resolve, reject) => {
        if (!channel || !message) {
          return reject(new Error('Must provide a channel and message data'));
        }

        return pub.publish(channel, serializeMessage(message)).then((response) => {
          console.log(`Successfully publish to channel (${channel})`);
          return resolve(response);
        }).catch((err) => {
          console.error(`Could not publish to the channel (${channel}) with the message (${message})`, err);
          return reject(err);
        });
      });
    },

    listen: (channel, handler) => {
      const messageHandler = (pattern, msgChannel, message) => {
        if (channel === pattern) {
          handler(msgChannel, tryConvertToJSON(message));
        }
      };

      sub.on('pmessage', messageHandler);
    },

    on: (handleMessage) => {
      sub.on('pmessage', (pattern, channel, message) => {
        handleMessage(channel, message);
      });
    },
  };
})();
