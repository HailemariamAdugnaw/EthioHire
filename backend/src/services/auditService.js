const prisma = require('../config/db');

async function logAudit({ userId, action, entityType, entityId, payload }) {
  return prisma.auditLog.create({ data: { userId, action, entityType, entityId, payload } });
}

module.exports = { logAudit };
