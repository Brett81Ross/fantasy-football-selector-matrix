module.exports = function handler(req, res) {
  res.status(200).json({
    app: 'Fantasy Football Selector Matrix',
    version: '1.1.0',
    status: 'ok'
  });
};
