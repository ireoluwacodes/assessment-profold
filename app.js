/* eslint-disable global-require */
/* eslint-disable import/no-dynamic-require */
require('dotenv').config();

const fs = require('fs');
const { createServer } = require('@app-core/server');
const { createConnection } = require('@app-core/mongoose');

const canLogEndpointInformation = process.env.CAN_LOG_ENDPOINT_INFORMATION;

// createConnection({
//   uri: process.env.MONGO_URI,
// });

const server = createServer({
  port: process.env.PORT,
  JSONLimit: '150mb',
  enableCors: true,
});

const ENDPOINT_CONFIGS = [{ path: './endpoints/reqline/' }];

function logEndpointMetaData(endpointConfigs) {
  const endpointData = [];
  const storageDirName = './endpoint-data';
  const EXEMPTED_ENDPOINTS_REGEX = /onboarding/;

  endpointConfigs.forEach((endpointConfig) => {
    const { path: basePath, options } = endpointConfig;

    const dirs = fs.readdirSync(basePath);

    dirs.forEach((file) => {
      const handler = require(`${basePath}${file}`);

      if (!EXEMPTED_ENDPOINTS_REGEX.test(basePath) && handler.middlewares?.length) {
        const entry = { method: handler.method, endpoint: handler.path };
        entry.name = file.replaceAll('-', ' ').replace('.js', '');
        entry.display_name = `can ${entry.name}`;

        if (options?.pathPrefix) {
          entry.endpoint = `${options.pathPrefix}${entry.endpoint}`;
          entry.name = `${entry.name} (${options.pathPrefix.replace('/', '')})`;
        }

        endpointData.push(entry);
      }
    });
  });

  if (!fs.existsSync(storageDirName)) {
    fs.mkdirSync(storageDirName);
  }

  fs.writeFileSync(`${storageDirName}/endpoints.json`, JSON.stringify(endpointData, null, 2), {
    encoding: 'utf-8',
  });
}

if (canLogEndpointInformation) {
  logEndpointMetaData(ENDPOINT_CONFIGS);
}

function setupEndpointHandlers(basePath, options = {}) {
  const dirs = fs.readdirSync(basePath);

  dirs.forEach((file) => {
    const handler = require(`${basePath}${file}`);

    if (options.pathPrefix) {
      handler.path = `${options.pathPrefix}${handler.path}`;
    }

    server.addHandler(handler);
  });
}

ENDPOINT_CONFIGS.forEach((config) => {
  setupEndpointHandlers(config.path, config.options);
});

server.startServer();
