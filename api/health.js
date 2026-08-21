module.exports = function handler(req, res) {
  res.status(200).json({
    app: 'Fantasy Football Matrix',
    version: '1.3.0',
    status: 'ok'
  });
};
