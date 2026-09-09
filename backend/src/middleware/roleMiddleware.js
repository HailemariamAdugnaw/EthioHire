const { fail } = require('../utils/response');

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return fail(res, 403, 'Forbidden');
    return next();
  };
}

module.exports = { allowRoles };
