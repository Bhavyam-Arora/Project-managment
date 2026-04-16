function encode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function decode(str) {
  return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
}

module.exports = { encode, decode };
