'use strict';
/**
 * @callback MessageHandler
 * @param {String} pattern - The pattern of the subscription.
 * @param {String} channel - The specific channel the message is received from.
 * @param {String} message - The contents of the message.
 */

/**
 * @callback ListenMessageHandler
 * @param {String} channel - The channel name the message is coming from
 * @param {String | Object} message - The contents of the message. If the contents are in JSON format, the message will
 * be converted to an Object.
 */

const Redis = require('ioredis');

module.exports = ((config) => {
  const sub = new Redis(config);
  const pub = new Redis(config);

  /**
   * A helper method to convert the message into the valid format for Redis Pub/Sub which is a string.
   *
   * @param {*} message
   * @return {string}
   */
  const serializeMessage = (message) => {
    // Prevent a possible null value from serializing to the string 'null'.
    if (!message) {
      return '';
    }

    if (typeof message === 'object') {
      return JSON.stringify(message);
    }

    return message;
  };

  /**
   * A method that attempts to gracefully convert a string to an object, otherwise just passes back the string.
   *
   * @param {String} jsonString - A string that could be in stringified JSON format.
   * @return {Object|*}
   */
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
    /**
     * Subscribe to a channel or a list of channels as additional method arguments. The method uses Redis PSUBSCRIBE
     * which allows each "channel" argument to use "glob-style" patterns.
     *
     * @param {...String} channels - A list of channels to subscribe to. "Glob-style" patterns are supported. See redis
     * documentation for examples of glob-style patterns https://redis.io/commands/psubscribe
     * @return {Promise<Number>} Returns the number of channels the "subscriber" is subscribed to.
     */
    subscribe: (...channels) => {
      return sub.psubscribe(channels);
    },

    /**
     * Unsubscribe to a channel or a list of channels as additional method arguments. The method uses Redis PUNSUBSCRIBE
     * which allows each "channel" argument to use "glob-style" patterns.
     *
     * @param {...String} channels - A list of channels to unsubscribe from. "Glob-style" patterns are supported. See redis
     * documentation for examples of glob-style patterns https://redis.io/commands/psubscribe
     * @return {Promise<Number>} Returns the number of remaining channels the "subscriber" is subscribed to.
     */
    unsubscribe: (...channels) => {
      return sub.punsubscribe(channels);
    },

    /**
     * A publish command to send a message to the specified channel. The `channel` is the name of a specific channel
     * and does not support using a "pattern" to broadcast a message to multiple channels.
     *
     * @param {String} channel - The channel the message should be published to
     * @param {String | Object} message - A string to pass as a message. If an Object-like value is present, we will
     * attempt to serialize it into a string to ensure delivery.
     * @return {Promise<Number>} Returns the number of clients that received the message
     */
    publish: (channel, message) => {
      return new Promise((resolve, reject) => {
        if (!channel || !message) {
          return reject(new Error('Must provide a channel and message data'));
        }

        return pub.publish(channel, serializeMessage(message)).catch((err) => {
          console.error(`Could not publish to the channel (${channel}) with the message (${message})`, err);
          return reject(err);
        });
      });
    },

    /**
     * A convenience method around `onMessage` that accepts a channel to filter the messages by. All subscriptions use
     * the "pattern" subscription model through Redis so this listener will listen to ioredis' "pmessage" event which
     * receives messages from channels registered with "psubscribe".
     *
     * @param {String | RegExp} channel - As a string, the messages will be filtered by the exact match of the channel.
     * If supplied as a RegExp (regular expression), the channels and respective messages will be passed to the callback
     * that match the pattern.
     * @param {ListenMessageHandler} handler - The callback function which will be called upon for messages that match
     * `channel`.
     */
    listen: (channel, handler) => {
      sub.on('pmessage', (pattern, msgChannel, message) => {
        if (channel instanceof RegExp) {
          if (msgChannel.match(channel)) {
            return handler(msgChannel, tryConvertToJSON(message));
          }
        }

        if (msgChannel === channel) {
          return handler(msgChannel, tryConvertToJSON(message));
        }
      });
    },

    /**
     * Basic listener to messages in the subscribed channels. This will receive every message published to the Redis
     * instance and picked up by the subscriber. The callback passed in will receive the `pattern` of the subscription,
     * the `channel` the message came from and `message` as the contents of the message. This method is best used if
     * you want to handle the filtering of messages on your own. See `listen()` for a convenience method.
     *
     * @param {MessageHandler} handleMessage - A function that will be called on each message received. The callback can
     * expect to receive the params list as: (pattern, channel, message).
     */
    onMessage: (handleMessage) => {
      sub.on('pmessage', handleMessage);
    },

    /**
     * Provides a redis connection that is not in subscriber mode to run redis commands with. The client is an instance
     * created with `ioredis`. https://github.com/luin/ioredis
     */
    redis: pub,
  };
});
