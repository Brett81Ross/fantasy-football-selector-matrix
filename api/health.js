module.exports = function handler(req, res) {
  res.status(200).json({
    app: 'Fantasy Football Selector Matrix',
    version: '1.2.0',
    status: 'ok'
  });
};
