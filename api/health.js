module.exports = function handler(req, res) {
  res.status(200).json({
    app: 'Fantasy Football Matrix',
    version: '1.2.1',
    status: 'ok'
  });
};
