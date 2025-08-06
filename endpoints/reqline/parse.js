const { createHandler } = require('@app-core/server');
const parseService = require('../../services/reqline/parse');

module.exports = createHandler({
  path: '/',
  method: 'post',
  async handler(rc, helpers) {
    const { reqline } = rc.body;
    const response = await parseService({ reqline });
    return {
      status: helpers.http_statuses.HTTP_200_OK,
      data: response,
    };
  },
});
