// Map<project_id, Map<user_id, { socket_id, display_name, joined_at }>>
const presenceMap = new Map();

function addPresence(projectId, userId, socketId, displayName) {
  if (!presenceMap.has(projectId)) {
    presenceMap.set(projectId, new Map());
  }
  presenceMap.get(projectId).set(userId, {
    socket_id: socketId,
    display_name: displayName,
    joined_at: new Date().toISOString(),
  });
}

function removePresence(projectId, userId) {
  if (!presenceMap.has(projectId)) return;
  presenceMap.get(projectId).delete(userId);
  if (presenceMap.get(projectId).size === 0) {
    presenceMap.delete(projectId);
  }
}

function getPresence(projectId) {
  if (!presenceMap.has(projectId)) return [];
  return Array.from(presenceMap.get(projectId).entries()).map(([user_id, data]) => ({
    user_id,
    display_name: data.display_name,
    joined_at: data.joined_at,
  }));
}

function removeFromAllProjects(socketId) {
  const affected = [];
  for (const [projectId, users] of presenceMap.entries()) {
    for (const [userId, data] of users.entries()) {
      if (data.socket_id === socketId) {
        users.delete(userId);
        if (users.size === 0) presenceMap.delete(projectId);
        affected.push(projectId);
        break;
      }
    }
  }
  return affected;
}

module.exports = { addPresence, removePresence, getPresence, removeFromAllProjects };
