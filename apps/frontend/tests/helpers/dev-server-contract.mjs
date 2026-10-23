export function isOwnedReadiness(message, expected) {
  return isOwnedMessage(message, expected, 'evix-test-ready');
}
export function isOwnedShutdown(message, expected) {
  return isOwnedMessage(message, expected, 'evix-test-stopped');
}
function isOwnedMessage(message, expected, type) {
  return message !== null && typeof message === 'object' && !Array.isArray(message)
    && message.type === type
    && message.nonce === expected.nonce && message.pid === expected.pid
    && message.port === expected.port && message.hostname === expected.hostname
    && message.cwd === expected.cwd;
}
