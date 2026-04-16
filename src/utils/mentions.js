function parseMentions(text) {
  const matches = [];
  const regex = /@([\w]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

module.exports = { parseMentions };
