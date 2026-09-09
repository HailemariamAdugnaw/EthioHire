function ok(res, data, message = 'OK') {
  return res.status(200).json({ success: true, message, data });
}

function created(res, data, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

module.exports = { ok, created, fail };
