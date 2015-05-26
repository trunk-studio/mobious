'use strict';

import path from 'path';
import debug from 'debug';

import koa from 'koa';
import hbs from 'koa-hbs';
import mount from 'koa-mount';
import helmet from 'koa-helmet';
import logger from 'koa-logger';
import favicon from 'koa-favicon';
import staticCache from 'koa-static-cache';
import responseTime from 'koa-response-time';
import koaBodyParser from 'koa-bodyparser';

import isomorphicRouter from './router';
import bootstrap from './bootstrap';

import config from './config/init';
import Router from 'koa-router';
import PluginService from './services/pluginService';
import models from './models';

const env = process.env.NODE_ENV || 'development';
const app = koa();

var router = new Router();
var pluginService = new PluginService(models.sequelize, router);

app.use(koaBodyParser());

app
  .use(router.routes())
  .use(router.allowedMethods());

pluginService.installPlugin('mobious_plugin_sample');

global.models = pluginService.getDb();

// add header `X-Response-Time`
app.use(responseTime());
app.use(logger());

// various security headers
app.use(helmet.defaults());

if (env === 'production') {
  app.use(require('koa-conditional-get')());
  app.use(require('koa-etag')());
  app.use(require('koa-compressor')());

  // Cache pages
  const cache = require('lru-cache')({maxAge: 3000});
  app.use(require('koa-cash')({
    get: function* (key) {
      return cache.get(key);
    },
    set: function* (key, value) {
      cache.set(key, value);
    }
  }));
}

if (env === 'development') {
  // set debug env, must be programmaticaly for windows
  debug.enable('dev,koa');
  // log when process is blocked
  require('blocked')((ms) => debug('koa')(`blocked for ${ms}ms`));
}

app.use(favicon(path.join(__dirname, '../app/images/favicon.ico')));



app.use(hbs.middleware({
  defaultLayout: 'index',
  layoutsPath: path.join(__dirname, '/views/layouts'),
  viewPath: path.join(__dirname, '/views')
}));

const cacheOpts: Object = {maxAge: 86400000, gzip: true};

// Proxy asset folder to webpack development server in development mode
if (env === 'development') {
  var webpackConfig: Object = require('./../webpack/dev.config');
  app.use(mount('/assets', require('koa-proxy')({ host: `http://localhost:${webpackConfig.server.port}` })));
}
else {
  app.use(mount('/assets', staticCache(path.join(__dirname, '../dist'), cacheOpts)));
}

app.use(isomorphicRouter);

var liftApp = async () => {


  await models.sequelize.sync({force: config.connection.force})

  await bootstrap();
  app.listen(config.port);

  console.log(`Application started on port ${config.port}`);
  if (process.send) {
    process.send('online');
  }


  return app;

}

if (env !== 'test') liftApp();

module.exports = liftApp
